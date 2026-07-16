import { createHash } from 'crypto';
import type { VehicleType } from '@prisma/client';
import { prisma } from './prisma.js';
import { normalizePlate } from './plates.js';
import { normalizePersonName, scoreNameMatch, OWNER_NAME_MATCH_THRESHOLD } from './nameMatch.js';
import { getVehicleDocExtractor } from './vehicleDocExtractor.js';

export const VERIFICATION_TTL_MS = 10 * 60 * 1000;
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
  | 'plate_taken';

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

export interface VerifyVehicleResult {
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

function failure(
  reason: VerifyFailureReason,
  message: string,
  extracted: VerifyExtracted,
  checks: VerifyChecks
): VerifyVehicleResult {
  return { ok: false, reason, message, extracted, checks };
}

export async function verifyVehicleDocuments(
  ownerId: string,
  accountName: string,
  rcImageDataUrl: string,
  plateImageDataUrl: string,
  typedPlate: string
): Promise<VerifyVehicleResult> {
  const emptyChecks: VerifyChecks = {
    platesMatch: false,
    typedPlateMatch: false,
    ownerNameMatch: false,
    ownerNameScore: 0,
    confidence: 0,
    lowConfidenceWarning: false,
  };
  const emptyExtracted: VerifyExtracted = {
    rcPlate: null,
    photoPlate: null,
    ownerNameOnRc: null,
    vehicleName: null,
    vehicleType: null,
  };

  if (!typedPlate.trim()) {
    return failure('unreadable', 'Type your plate number to confirm what we read.', emptyExtracted, emptyChecks);
  }

  let extraction;
  try {
    extraction = await getVehicleDocExtractor().extract(rcImageDataUrl, plateImageDataUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not read documents';
    if (msg.includes('GEMINI') || msg.includes('not configured')) {
      return failure('gemini_unavailable', msg, emptyExtracted, emptyChecks);
    }
    return failure('unreadable', msg, emptyExtracted, emptyChecks);
  }

  const rcNormalized = extraction.registrationNumber
    ? normalizePlate(extraction.registrationNumber)
    : null;
  const photoNormalized = extraction.plateFromPhoto
    ? normalizePlate(extraction.plateFromPhoto)
    : null;
  const typedNormalized = normalizePlate(typedPlate);

  const extracted: VerifyExtracted = {
    rcPlate: rcNormalized ? formatPlateDisplay(rcNormalized) : null,
    photoPlate: photoNormalized ? formatPlateDisplay(photoNormalized) : null,
    ownerNameOnRc: extraction.ownerName,
    vehicleName: extraction.vehicleMakeModel,
    vehicleType: extraction.vehicleType,
  };

  const confidence = extraction.confidence;
  const platesMatch = !!(rcNormalized && photoNormalized && rcNormalized === photoNormalized);
  const typedPlateMatch = !!(
    rcNormalized &&
    photoNormalized &&
    typedNormalized === rcNormalized &&
    typedNormalized === photoNormalized
  );
  const ownerNameScore = extraction.ownerName
    ? scoreNameMatch(accountName, extraction.ownerName)
    : 0;
  const ownerNameMatch = ownerNameScore >= OWNER_NAME_MATCH_THRESHOLD;
  const lowConfidenceWarning = confidence >= CONFIDENCE_BLOCK && confidence < CONFIDENCE_WARN;

  const checks: VerifyChecks = {
    platesMatch,
    typedPlateMatch,
    ownerNameMatch,
    ownerNameScore,
    confidence,
    lowConfidenceWarning,
  };

  if (!rcNormalized || !photoNormalized || !extraction.ownerName) {
    return failure(
      'unreadable',
      'Could not read the RC or plate clearly. Retake in good light with the full document visible.',
      extracted,
      checks
    );
  }

  if (confidence < CONFIDENCE_BLOCK) {
    return failure(
      'low_confidence',
      'Photos are too unclear. Use brighter light, avoid glare, and show the full RC and plate.',
      extracted,
      checks
    );
  }

  if (!platesMatch) {
    return failure(
      'plates_mismatch',
      'Plate on RC does not match the plate photo. Retake both and try again.',
      extracted,
      checks
    );
  }

  if (!typedPlateMatch) {
    return failure(
      'typed_plate_mismatch',
      'Typed plate number does not match what we read. Check spelling and format.',
      extracted,
      checks
    );
  }

  if (!ownerNameMatch) {
    return failure(
      'owner_mismatch',
      'RC owner name does not match your account name. Update your profile or use the RC registered in your name.',
      extracted,
      checks
    );
  }

  const existingPlate = await prisma.vehicle.findFirst({ where: { numberNormalized: rcNormalized } });
  if (existingPlate) {
    return failure(
      'plate_taken',
      'This plate is already registered on Qertify.',
      extracted,
      checks
    );
  }

  const rcFingerprint = buildRcFingerprint(rcNormalized, extraction.ownerName, extraction.chassisLast4);
  const existingRc = await prisma.vehicleVerification.findUnique({ where: { rcFingerprint } });
  if (existingRc) {
    if (existingRc.ownerId !== ownerId && existingRc.status !== 'EXPIRED') {
      return failure(
        'rc_already_used',
        'This RC is already registered under another account.',
        extracted,
        checks
      );
    }
    if (existingRc.ownerId === ownerId && existingRc.status === 'CONSUMED') {
      return failure(
        'rc_already_used',
        'This RC was already used to register a vehicle on your account.',
        extracted,
        checks
      );
    }
  }

  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);
  const plateDisplay = typedPlate.trim().toUpperCase();

  if (existingRc && existingRc.ownerId === ownerId && existingRc.status === 'READY') {
    const updated = await prisma.vehicleVerification.update({
      where: { id: existingRc.id },
      data: {
        plateNormalized: rcNormalized,
        plateDisplay,
        ownerNameOnRc: extraction.ownerName,
        ownerNameScore,
        confidence,
        suggestedName: extraction.vehicleMakeModel,
        suggestedType: extraction.vehicleType ?? undefined,
        expiresAt,
      },
    });
    return {
      ok: true,
      message: lowConfidenceWarning
        ? 'Verified with low confidence — double-check the detected plate before adding.'
        : 'Documents verified. Confirm and add your vehicle.',
      verificationId: updated.id,
      expiresAt: expiresAt.toISOString(),
      extracted,
      checks,
    };
  }

  if (existingRc && existingRc.ownerId === ownerId && existingRc.status === 'EXPIRED') {
    const updated = await prisma.vehicleVerification.update({
      where: { id: existingRc.id },
      data: {
        plateNormalized: rcNormalized,
        plateDisplay,
        ownerNameOnRc: extraction.ownerName,
        ownerNameScore,
        confidence,
        suggestedName: extraction.vehicleMakeModel,
        suggestedType: extraction.vehicleType ?? undefined,
        status: 'READY',
        expiresAt,
        vehicleId: null,
      },
    });
    return {
      ok: true,
      message: lowConfidenceWarning
        ? 'Verified with low confidence — double-check the detected plate before adding.'
        : 'Documents verified. Confirm and add your vehicle.',
      verificationId: updated.id,
      expiresAt: expiresAt.toISOString(),
      extracted,
      checks,
    };
  }

  const verification = await prisma.vehicleVerification.create({
    data: {
      ownerId,
      rcFingerprint,
      plateNormalized: rcNormalized,
      plateDisplay,
      ownerNameOnRc: extraction.ownerName,
      ownerNameScore,
      confidence,
      suggestedName: extraction.vehicleMakeModel,
      suggestedType: extraction.vehicleType ?? undefined,
      expiresAt,
    },
  });

  return {
    ok: true,
    message: lowConfidenceWarning
      ? 'Verified with low confidence — double-check the detected plate before adding.'
      : 'Documents verified. Confirm and add your vehicle.',
    verificationId: verification.id,
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
  if (verification.status === 'EXPIRED' || verification.expiresAt < new Date()) {
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
