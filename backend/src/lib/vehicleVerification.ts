import { createHash } from 'crypto';
import type { VehicleType } from '@prisma/client';
import { prisma } from './prisma.js';
import { normalizePlate } from './plates.js';
import { normalizePersonName, scoreNameMatch, OWNER_NAME_MATCH_THRESHOLD } from './nameMatch.js';
import { extractRcDocument, extractPlatePhoto } from './vehicleDocExtractor.js';

export const VERIFICATION_TTL_MS = 15 * 60 * 1000;
export const CONFIDENCE_BLOCK = 0.6;
export const CONFIDENCE_WARN = 0.85;

export type VerifyFailureReason =
  | 'gemini_unavailable'
  | 'unreadable'
  | 'low_confidence'
  | 'plates_mismatch'
  | 'typed_plate_mismatch'
  | 'owner_mismatch'
  | 'rc_already_used'
  | 'plate_taken'
  | 'verification_not_found'
  | 'verification_expired';

export interface VerifyChecks {
  platesMatch: boolean;
  typedPlateMatch: boolean;
  ownerNameMatch: boolean;
  ownerNameScore: number;
  confidence: number;
  lowConfidenceWarning: boolean;
}

export interface VerifyExtracted {
  rcPlate: string | null;
  photoPlate: string | null;
  ownerNameOnRc: string | null;
  vehicleName: string | null;
  vehicleType: VehicleType | null;
}

export interface RcVerifyResult {
  ok: boolean;
  reason?: VerifyFailureReason;
  message: string;
  verificationId?: string;
  expiresAt?: string;
  extracted: VerifyExtracted;
  checks: VerifyChecks;
}

export interface PlateVerifyResult {
  ok: boolean;
  reason?: VerifyFailureReason;
  message: string;
  verificationId?: string;
  expiresAt?: string;
  extracted: VerifyExtracted;
  checks: VerifyChecks;
}

function formatPlateDisplay(normalized: string): string {
  if (normalized.length <= 4) return normalized;
  const state = normalized.slice(0, 2);
  const rest = normalized.slice(2);
  const district = rest.slice(0, 2);
  const series = rest.slice(2, 4).replace(/[^A-Z]/g, '') || rest.slice(2, 3);
  const number = rest.slice(series.length === 2 ? 4 : 3);
  if (number) return `${state} ${district} ${series} ${number}`.replace(/\s+/g, ' ').trim();
  return normalized;
}

export function buildRcFingerprint(
  plateNormalized: string,
  ownerNameOnRc: string,
  chassisLast4?: string | null
): string {
  const payload = [
    plateNormalized,
    normalizePersonName(ownerNameOnRc),
    (chassisLast4 ?? '').replace(/\s/g, '').toLowerCase(),
  ].join('|');
  return createHash('sha256').update(payload).digest('hex');
}

const emptyChecks = (): VerifyChecks => ({
  platesMatch: false,
  typedPlateMatch: false,
  ownerNameMatch: false,
  ownerNameScore: 0,
  confidence: 0,
  lowConfidenceWarning: false,
});

const emptyExtracted = (): VerifyExtracted => ({
  rcPlate: null,
  photoPlate: null,
  ownerNameOnRc: null,
  vehicleName: null,
  vehicleType: null,
});

function rcFailure(
  reason: VerifyFailureReason,
  message: string,
  extracted: VerifyExtracted,
  checks: VerifyChecks
): RcVerifyResult {
  return { ok: false, reason, message, extracted, checks };
}

function plateFailure(
  reason: VerifyFailureReason,
  message: string,
  extracted: VerifyExtracted,
  checks: VerifyChecks
): PlateVerifyResult {
  return { ok: false, reason, message, extracted, checks };
}

async function upsertRcVerification(
  ownerId: string,
  rcFingerprint: string,
  data: {
    plateNormalized: string;
    plateDisplay: string;
    ownerNameOnRc: string;
    ownerNameScore: number;
    confidence: number;
    suggestedName: string | null;
    suggestedType: VehicleType | null;
    expiresAt: Date;
  }
) {
  const existing = await prisma.vehicleVerification.findUnique({ where: { rcFingerprint } });

  if (existing?.ownerId === ownerId && existing.status === 'RC_VERIFIED') {
    return prisma.vehicleVerification.update({
      where: { id: existing.id },
      data: { ...data, status: 'RC_VERIFIED', vehicleId: null },
    });
  }

  if (existing?.ownerId === ownerId && existing.status === 'EXPIRED') {
    return prisma.vehicleVerification.update({
      where: { id: existing.id },
      data: { ...data, status: 'RC_VERIFIED', vehicleId: null },
    });
  }

  return prisma.vehicleVerification.create({
    data: {
      ownerId,
      rcFingerprint,
      ...data,
      status: 'RC_VERIFIED',
    },
  });
}

/** Step 1 — read RC only, validate owner + uniqueness, return extracted details. */
export async function verifyRcDocument(
  ownerId: string,
  accountName: string,
  rcImageDataUrl: string
): Promise<RcVerifyResult> {
  const checks = emptyChecks();
  const extracted = emptyExtracted();

  let extraction;
  try {
    extraction = await extractRcDocument(rcImageDataUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not read RC';
    if (msg.includes('GEMINI') || msg.includes('not configured')) {
      return rcFailure('gemini_unavailable', msg, extracted, checks);
    }
    return rcFailure('unreadable', msg, extracted, checks);
  }

  const rcNormalized = extraction.registrationNumber
    ? normalizePlate(extraction.registrationNumber)
    : null;

  extracted.rcPlate = rcNormalized ? formatPlateDisplay(rcNormalized) : null;
  extracted.ownerNameOnRc = extraction.ownerName;
  extracted.vehicleName = extraction.vehicleMakeModel;
  extracted.vehicleType = extraction.vehicleType;

  checks.confidence = extraction.confidence;
  checks.lowConfidenceWarning =
    extraction.confidence >= CONFIDENCE_BLOCK && extraction.confidence < CONFIDENCE_WARN;
  checks.ownerNameScore = extraction.ownerName
    ? scoreNameMatch(accountName, extraction.ownerName)
    : 0;
  checks.ownerNameMatch = checks.ownerNameScore >= OWNER_NAME_MATCH_THRESHOLD;

  if (!rcNormalized || !extraction.ownerName) {
    return rcFailure(
      'unreadable',
      'Could not read the RC clearly. Retake in good light with the full document visible.',
      extracted,
      checks
    );
  }

  if (extraction.confidence < CONFIDENCE_BLOCK) {
    return rcFailure(
      'low_confidence',
      'RC photo is too unclear. Use brighter light, avoid glare, and show the full RC.',
      extracted,
      checks
    );
  }

  if (!checks.ownerNameMatch) {
    return rcFailure(
      'owner_mismatch',
      'RC owner name does not match your account name. Update your profile or use the RC registered in your name.',
      extracted,
      checks
    );
  }

  const existingPlate = await prisma.vehicle.findFirst({ where: { numberNormalized: rcNormalized } });
  if (existingPlate) {
    return rcFailure('plate_taken', 'This plate is already registered on Qertify.', extracted, checks);
  }

  const rcFingerprint = buildRcFingerprint(rcNormalized, extraction.ownerName, extraction.chassisLast4);
  const existingRc = await prisma.vehicleVerification.findUnique({ where: { rcFingerprint } });
  if (existingRc) {
    if (existingRc.ownerId !== ownerId && existingRc.status !== 'EXPIRED') {
      return rcFailure(
        'rc_already_used',
        'This RC is already registered under another account.',
        extracted,
        checks
      );
    }
    if (existingRc.ownerId === ownerId && existingRc.status === 'CONSUMED') {
      return rcFailure(
        'rc_already_used',
        'This RC was already used to register a vehicle on your account.',
        extracted,
        checks
      );
    }
  }

  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);
  const plateDisplay = formatPlateDisplay(rcNormalized);

  const verification = await upsertRcVerification(ownerId, rcFingerprint, {
    plateNormalized: rcNormalized,
    plateDisplay,
    ownerNameOnRc: extraction.ownerName,
    ownerNameScore: checks.ownerNameScore,
    confidence: extraction.confidence,
    suggestedName: extraction.vehicleMakeModel,
    suggestedType: extraction.vehicleType,
    expiresAt,
  });

  return {
    ok: true,
    message: checks.lowConfidenceWarning
      ? 'RC read with low confidence — double-check the plate, then upload your plate photo.'
      : 'RC verified. Upload a photo of your number plate next.',
    verificationId: verification.id,
    expiresAt: expiresAt.toISOString(),
    extracted,
    checks,
  };
}

/** Step 2 — read plate photo and match against RC from step 1. */
export async function verifyPlatePhoto(
  ownerId: string,
  verificationId: string,
  plateImageDataUrl: string,
  typedPlate: string
): Promise<PlateVerifyResult> {
  const checks = emptyChecks();
  const extracted = emptyExtracted();

  if (!typedPlate.trim()) {
    return plateFailure(
      'typed_plate_mismatch',
      'Type your plate number to confirm what we read.',
      extracted,
      checks
    );
  }

  const verification = await prisma.vehicleVerification.findFirst({
    where: { id: verificationId, ownerId },
  });

  if (!verification) {
    return plateFailure(
      'verification_not_found',
      'RC verification not found. Upload your RC again.',
      extracted,
      checks
    );
  }

  if (verification.status === 'EXPIRED' || verification.expiresAt < new Date()) {
    await prisma.vehicleVerification.update({
      where: { id: verification.id },
      data: { status: 'EXPIRED' },
    });
    return plateFailure(
      'verification_expired',
      'RC verification expired. Upload your RC again.',
      extracted,
      checks
    );
  }

  if (verification.status !== 'RC_VERIFIED') {
    return plateFailure(
      'verification_not_found',
      'Complete RC verification first.',
      extracted,
      checks
    );
  }

  extracted.rcPlate = verification.plateDisplay;
  extracted.ownerNameOnRc = verification.ownerNameOnRc;
  extracted.vehicleName = verification.suggestedName;
  extracted.vehicleType = verification.suggestedType;

  let plateExtraction;
  try {
    plateExtraction = await extractPlatePhoto(plateImageDataUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not read plate photo';
    if (msg.includes('GEMINI') || msg.includes('not configured')) {
      return plateFailure('gemini_unavailable', msg, extracted, checks);
    }
    return plateFailure('unreadable', msg, extracted, checks);
  }

  const rcNormalized = verification.plateNormalized;
  const photoNormalized = plateExtraction.plateFromPhoto
    ? normalizePlate(plateExtraction.plateFromPhoto)
    : null;
  const typedNormalized = normalizePlate(typedPlate);

  extracted.photoPlate = photoNormalized ? formatPlateDisplay(photoNormalized) : null;

  const combinedConfidence = Math.min(verification.confidence, plateExtraction.confidence);
  checks.confidence = combinedConfidence;
  checks.lowConfidenceWarning =
    combinedConfidence >= CONFIDENCE_BLOCK && combinedConfidence < CONFIDENCE_WARN;
  checks.ownerNameMatch = verification.ownerNameScore >= OWNER_NAME_MATCH_THRESHOLD;
  checks.ownerNameScore = verification.ownerNameScore;
  checks.platesMatch = !!(photoNormalized && photoNormalized === rcNormalized);
  checks.typedPlateMatch = !!(
    photoNormalized &&
    typedNormalized === rcNormalized &&
    typedNormalized === photoNormalized
  );

  if (!photoNormalized) {
    return plateFailure(
      'unreadable',
      'Could not read the plate photo. Retake a clear, straight-on shot.',
      extracted,
      checks
    );
  }

  if (plateExtraction.confidence < CONFIDENCE_BLOCK) {
    return plateFailure(
      'low_confidence',
      'Plate photo is too unclear. Use brighter light and fill the frame with the plate.',
      extracted,
      checks
    );
  }

  if (!checks.platesMatch) {
    return plateFailure(
      'plates_mismatch',
      `Plate photo (${extracted.photoPlate}) does not match RC (${extracted.rcPlate}). Retake the plate photo.`,
      extracted,
      checks
    );
  }

  if (!checks.typedPlateMatch) {
    return plateFailure(
      'typed_plate_mismatch',
      'Typed plate number does not match what we read. Check spelling and format.',
      extracted,
      checks
    );
  }

  const existingPlate = await prisma.vehicle.findFirst({ where: { numberNormalized: rcNormalized } });
  if (existingPlate) {
    return plateFailure('plate_taken', 'This plate is already registered on Qertify.', extracted, checks);
  }

  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);
  const plateDisplay = typedPlate.trim().toUpperCase();

  const updated = await prisma.vehicleVerification.update({
    where: { id: verification.id },
    data: {
      plateDisplay,
      confidence: combinedConfidence,
      status: 'READY',
      expiresAt,
    },
  });

  return {
    ok: true,
    message: checks.lowConfidenceWarning
      ? 'Verified with low confidence — double-check the plate before adding.'
      : 'Plate verified. Confirm details and add your vehicle.',
    verificationId: updated.id,
    expiresAt: expiresAt.toISOString(),
    extracted,
    checks,
  };
}

export async function consumeVerification(
  verificationId: string,
  ownerId: string,
  name: string,
  type: VehicleType
) {
  const verification = await prisma.vehicleVerification.findFirst({
    where: { id: verificationId, ownerId },
  });

  if (!verification) {
    return { error: 'Verification not found. Upload your RC and plate again.' as const };
  }
  if (verification.status === 'CONSUMED') {
    return { error: 'This verification was already used.' as const };
  }
  if (verification.status !== 'READY') {
    return { error: 'Complete RC and plate verification before adding the vehicle.' as const };
  }
  if (verification.expiresAt < new Date()) {
    await prisma.vehicleVerification.update({
      where: { id: verification.id },
      data: { status: 'EXPIRED' },
    });
    return { error: 'Verification expired. Upload your RC and plate again.' as const };
  }

  const existingPlate = await prisma.vehicle.findFirst({
    where: { numberNormalized: verification.plateNormalized },
  });
  if (existingPlate) {
    return { error: 'This plate is already registered on Qertify.' as const };
  }

  return { verification };
}
