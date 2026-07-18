import { Router } from 'express';
import { VehicleType } from '@prisma/client';
import { nanoid } from 'nanoid';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireOwner, type AuthRequest } from '../lib/auth.js';
import { normalizePlate } from '../lib/plates.js';
import { parseStickerCustomization } from '../lib/stickerStyle.js';
import { APP_NAME } from '../lib/brand.js';
import { isGeminiConfigured, generateFullStickerCard } from '../lib/gemini.js';
import { verifyRcDocument, verifyPlatePhoto, consumeVerification } from '../lib/vehicleVerification.js';
import {
  getExpiryStatus,
  isPhotoSlot,
  parseVaultType,
  VAULT_EXPIRY_TYPES,
  VAULT_PHOTO_SLOTS,
} from '../lib/vault.js';
import type { VaultDocumentType } from '@prisma/client';

const router = Router();

router.use(requireAuth, requireOwner);

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

function mapVehicle(v: {
  id: string;
  name: string;
  number: string;
  type: VehicleType;
  active: boolean;
  theftMode: boolean;
  verified: boolean;
  verifiedAt: Date | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  bloodGroup: string | null;
  allergies: string | null;
  medicalInfo: string | null;
  sticker: {
    code: string;
    themeId: string;
    customImageData: string | null;
    customization: string;
  } | null;
  _count: { notifications: number; calls: number };
}) {
  return {
    id: v.id,
    name: v.name,
    number: v.number,
    type: v.type,
    active: v.active,
    theftMode: v.theftMode,
    verified: v.verified,
    verifiedAt: v.verifiedAt?.toISOString() ?? null,
    stickerCode: v.sticker?.code ?? null,
    stickerTheme: v.sticker?.themeId ?? 'default',
    stickerCustomImage: v.sticker?.customImageData ?? null,
    stickerCustomization: parseStickerCustomization(v.sticker?.customization ?? '{}'),
    totalPings: v._count.notifications,
    callsMasked: v._count.calls,
    emergencyContactName: v.emergencyContactName,
    emergencyContactPhone: v.emergencyContactPhone,
    bloodGroup: v.bloodGroup,
    allergies: v.allergies,
    medicalInfo: v.medicalInfo,
  };
}

async function getOwnerVehicle(vehicleId: string, ownerId: string) {
  return prisma.vehicle.findFirst({
    where: { id: vehicleId, ownerId },
    include: {
      sticker: true,
      _count: { select: { notifications: true, calls: true } },
    },
  });
}

router.get('/', async (req: AuthRequest, res) => {
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { ownerId: req.ownerId! },
      include: {
        sticker: { select: { code: true, themeId: true, customImageData: true, customization: true } },
        _count: { select: { notifications: true, calls: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json(vehicles.map(mapVehicle));
  } catch (error) {
    console.error('GET /api/vehicles:', error);
    res.status(500).json({ error: 'Failed to fetch vehicles' });
  }
});

router.post('/verify-rc', async (req: AuthRequest, res) => {
  try {
    if (!isGeminiConfigured()) {
      res.status(503).json({
        ok: false,
        reason: 'gemini_unavailable',
        message: 'Document verification is not configured. Add GEMINI_API_KEY to the server.',
      });
      return;
    }

    const { rcImageDataUrl } = req.body as { rcImageDataUrl?: string };

    if (!rcImageDataUrl?.startsWith('data:image/')) {
      res.status(400).json({
        ok: false,
        reason: 'unreadable',
        message: 'Upload an RC photo (JPEG or PNG).',
      });
      return;
    }

    const owner = await prisma.owner.findUnique({
      where: { id: req.ownerId! },
      select: { name: true },
    });
    if (!owner?.name?.trim()) {
      res.status(400).json({
        ok: false,
        reason: 'owner_mismatch',
        message: 'Complete your profile name before verifying a vehicle.',
      });
      return;
    }

    const result = await verifyRcDocument(req.ownerId!, owner.name, rcImageDataUrl);
    res.status(200).json(result);
  } catch (error) {
    console.error('POST /api/vehicles/verify-rc:', error);
    res.status(500).json({
      ok: false,
      reason: 'unreadable',
      message: 'Failed to read RC. Try again.',
    });
  }
});

router.post('/verify-plate', async (req: AuthRequest, res) => {
  try {
    if (!isGeminiConfigured()) {
      res.status(503).json({
        ok: false,
        reason: 'gemini_unavailable',
        message: 'Document verification is not configured. Add GEMINI_API_KEY to the server.',
      });
      return;
    }

    const { verificationId, plateImageDataUrl, typedPlate } = req.body as {
      verificationId?: string;
      plateImageDataUrl?: string;
      typedPlate?: string;
    };

    if (!verificationId?.trim()) {
      res.status(400).json({
        ok: false,
        reason: 'verification_not_found',
        message: 'RC verification required. Upload your RC first.',
      });
      return;
    }

    if (!plateImageDataUrl?.startsWith('data:image/')) {
      res.status(400).json({
        ok: false,
        reason: 'unreadable',
        message: 'Upload a plate photo (JPEG or PNG).',
      });
      return;
    }

    if (!typedPlate?.trim()) {
      res.status(400).json({
        ok: false,
        reason: 'typed_plate_mismatch',
        message: 'Type your plate number to confirm what we read.',
      });
      return;
    }

    const result = await verifyPlatePhoto(
      req.ownerId!,
      verificationId.trim(),
      plateImageDataUrl,
      typedPlate
    );

    res.status(200).json(result);
  } catch (error) {
    console.error('POST /api/vehicles/verify-plate:', error);
    res.status(500).json({
      ok: false,
      reason: 'unreadable',
      message: 'Failed to verify plate. Try again.',
    });
  }
});

router.post('/verify', async (req: AuthRequest, res) => {
  res.status(410).json({
    ok: false,
    reason: 'unreadable',
    message: 'Use /verify-rc then /verify-plate in separate steps.',
  });
});

router.post('/', async (req: AuthRequest, res) => {
  try {
    const { name, number, type, verificationId } = req.body as {
      name?: string;
      number?: string;
      type?: VehicleType;
      verificationId?: string;
    };

    if (!verificationId?.trim()) {
      res.status(400).json({
        error: 'Vehicle verification required. Upload your RC and plate photo first.',
      });
      return;
    }

    if (!name?.trim()) {
      res.status(400).json({ error: 'Vehicle name is required' });
      return;
    }

    if (type !== 'car' && type !== 'bike') {
      res.status(400).json({ error: 'Type must be car or bike' });
      return;
    }

    const consumed = await consumeVerification(verificationId.trim(), req.ownerId!, name.trim(), type);
    if ('error' in consumed) {
      res.status(400).json({ error: consumed.error });
      return;
    }

    const { verification } = consumed;
    const numberNormalized = verification.plateNormalized;
    const numberValue = verification.plateDisplay;

    const vehicle = await prisma.$transaction(async (tx) => {
      const created = await tx.vehicle.create({
        data: {
          ownerId: req.ownerId!,
          name: name.trim(),
          number: numberValue,
          numberNormalized,
          type,
          verified: true,
          verifiedAt: new Date(),
          sticker: { create: { code: nanoid(10), themeId: 'default' } },
        },
        include: {
          sticker: { select: { code: true, themeId: true, customImageData: true, customization: true } },
          _count: { select: { notifications: true, calls: true } },
        },
      });

      await tx.vehicleVerification.update({
        where: { id: verification.id },
        data: { status: 'CONSUMED', vehicleId: created.id },
      });

      return created;
    });

    res.status(201).json(mapVehicle(vehicle));
  } catch (error) {
    console.error('POST /api/vehicles:', error);
    res.status(500).json({ error: 'Failed to add vehicle' });
  }
});

router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const vehicle = await getOwnerVehicle(req.params.id, req.ownerId!);
    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }
    res.json(mapVehicle(vehicle));
  } catch (error) {
    console.error('GET /api/vehicles/:id:', error);
    res.status(500).json({ error: 'Failed to fetch vehicle' });
  }
});

router.get('/:id/activity', async (req: AuthRequest, res) => {
  try {
    const vehicle = await getOwnerVehicle(req.params.id, req.ownerId!);
    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    const activities = await prisma.activity.findMany({
      where: { vehicleId: vehicle.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json(
      activities.map((a) => ({
        id: a.id,
        type: a.type,
        reason: a.description,
        time: a.createdAt,
      }))
    );
  } catch (error) {
    console.error('GET /api/vehicles/:id/activity:', error);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

router.patch('/:id', async (req: AuthRequest, res) => {
  try {
    const { name, number, active, emergencyContactName, emergencyContactPhone, bloodGroup, allergies, medicalInfo } = req.body as {
      name?: string;
      number?: string;
      active?: boolean;
      emergencyContactName?: string | null;
      emergencyContactPhone?: string | null;
      bloodGroup?: string | null;
      allergies?: string | null;
      medicalInfo?: string | null;
    };

    const vehicle = await getOwnerVehicle(req.params.id, req.ownerId!);
    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    if (name !== undefined && !name.trim()) {
      res.status(400).json({ error: 'Name cannot be empty' });
      return;
    }

    let numberNormalized: string | undefined;
    let numberValue: string | undefined;
    if (number !== undefined) {
      if (!number.trim()) {
        res.status(400).json({ error: 'Vehicle number cannot be empty' });
        return;
      }
      numberNormalized = normalizePlate(number);
      numberValue = number.trim().toUpperCase();
      const existing = await prisma.vehicle.findFirst({
        where: { numberNormalized, NOT: { id: vehicle.id } },
      });
      if (existing) {
        res.status(409).json({ error: `This vehicle number is already registered with ${APP_NAME}` });
        return;
      }
    }

    if (active !== undefined && typeof active !== 'boolean') {
      res.status(400).json({ error: 'active must be a boolean' });
      return;
    }

    if (emergencyContactName !== undefined && emergencyContactName !== null) {
      if (typeof emergencyContactName !== 'string' || emergencyContactName.trim().length > 120) {
        res.status(400).json({ error: 'Emergency contact name must be 120 characters or fewer' });
        return;
      }
    }

    if (emergencyContactPhone !== undefined && emergencyContactPhone !== null) {
      if (typeof emergencyContactPhone !== 'string') {
        res.status(400).json({ error: 'Emergency contact phone must be a string' });
        return;
      }
      const digits = emergencyContactPhone.replace(/\D/g, '');
      if (emergencyContactPhone.trim() && (digits.length < 10 || digits.length > 15)) {
        res.status(400).json({ error: 'Enter a valid emergency contact phone number' });
        return;
      }
    }

    if (bloodGroup !== undefined && bloodGroup !== null && bloodGroup !== '') {
      if (typeof bloodGroup !== 'string' || !BLOOD_GROUPS.includes(bloodGroup as (typeof BLOOD_GROUPS)[number])) {
        res.status(400).json({ error: 'Select a valid blood group' });
        return;
      }
    }

    if (allergies !== undefined && allergies !== null) {
      if (typeof allergies !== 'string' || allergies.length > 500) {
        res.status(400).json({ error: 'Allergies must be 500 characters or fewer' });
        return;
      }
    }

    if (medicalInfo !== undefined && medicalInfo !== null) {
      if (typeof medicalInfo !== 'string' || medicalInfo.length > 2000) {
        res.status(400).json({ error: 'Medical info must be 2000 characters or fewer' });
        return;
      }
    }

    const updated = await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(numberValue !== undefined && { number: numberValue, numberNormalized }),
        ...(active !== undefined && { active }),
        ...(emergencyContactName !== undefined && {
          emergencyContactName: emergencyContactName?.trim() || null,
        }),
        ...(emergencyContactPhone !== undefined && {
          emergencyContactPhone: emergencyContactPhone?.trim() || null,
        }),
        ...(bloodGroup !== undefined && {
          bloodGroup: bloodGroup?.trim() || null,
        }),
        ...(allergies !== undefined && {
          allergies: allergies?.trim() || null,
        }),
        ...(medicalInfo !== undefined && {
          medicalInfo: medicalInfo?.trim() || null,
        }),
      },
      include: {
        sticker: { select: { code: true, themeId: true, customImageData: true, customization: true } },
        _count: { select: { notifications: true, calls: true } },
      },
    });

    res.json(mapVehicle(updated));
  } catch (error) {
    console.error('PATCH /api/vehicles/:id:', error);
    res.status(500).json({ error: 'Failed to update vehicle' });
  }
});

router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const vehicle = await getOwnerVehicle(req.params.id, req.ownerId!);
    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    await prisma.vehicle.delete({ where: { id: vehicle.id } });
    res.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/vehicles/:id:', error);
    res.status(500).json({ error: 'Failed to delete vehicle' });
  }
});

router.patch('/:id/theft-mode', async (req: AuthRequest, res) => {
  try {
    const { theftMode } = req.body as { theftMode?: boolean };
    if (typeof theftMode !== 'boolean') {
      res.status(400).json({ error: 'theftMode must be a boolean' });
      return;
    }

    const vehicle = await getOwnerVehicle(req.params.id, req.ownerId!);
    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    const updated = await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { theftMode },
    });

    res.json({ id: updated.id, theftMode: updated.theftMode });
  } catch (error) {
    console.error('PATCH /api/vehicles/:id/theft-mode:', error);
    res.status(500).json({ error: 'Failed to update theft mode' });
  }
});

function mapVaultDocument(doc: {
  id: string;
  type: VaultDocumentType;
  photoSlot: string;
  fileName: string;
  mimeType: string;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: doc.id,
    type: doc.type,
    photoSlot: doc.photoSlot || null,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    expiresAt: doc.expiresAt?.toISOString() ?? null,
    expiryStatus: getExpiryStatus(doc.expiresAt),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

const MAX_VAULT_BYTES = 4 * 1024 * 1024;

router.get('/:id/vault', async (req: AuthRequest, res) => {
  try {
    const vehicle = await getOwnerVehicle(req.params.id, req.ownerId!);
    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    const docs = await prisma.vehicleDocument.findMany({
      where: { vehicleId: vehicle.id },
      orderBy: [{ type: 'asc' }, { photoSlot: 'asc' }],
      select: {
        id: true,
        type: true,
        photoSlot: true,
        fileName: true,
        mimeType: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const uploaded = docs.length;
    const totalSlots = 4 + 4; // 4 single docs + 4 photo slots
    const expiringSoon = docs.filter((d) => getExpiryStatus(d.expiresAt) === 'soon').length;
    const expired = docs.filter((d) => getExpiryStatus(d.expiresAt) === 'expired').length;

    res.json({
      documents: docs.map(mapVaultDocument),
      summary: { uploaded, totalSlots, expiringSoon, expired },
    });
  } catch (error) {
    console.error('GET /api/vehicles/:id/vault:', error);
    res.status(500).json({ error: 'Failed to load vault' });
  }
});

router.get('/:id/vault/:docId/file', async (req: AuthRequest, res) => {
  try {
    const vehicle = await getOwnerVehicle(req.params.id, req.ownerId!);
    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    const doc = await prisma.vehicleDocument.findFirst({
      where: { id: req.params.docId, vehicleId: vehicle.id },
    });
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    res.json({
      id: doc.id,
      type: doc.type,
      photoSlot: doc.photoSlot || null,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      dataUrl: doc.fileData.startsWith('data:')
        ? doc.fileData
        : `data:${doc.mimeType};base64,${doc.fileData}`,
      expiresAt: doc.expiresAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error('GET /api/vehicles/:id/vault/:docId/file:', error);
    res.status(500).json({ error: 'Failed to load document' });
  }
});

router.post('/:id/vault', async (req: AuthRequest, res) => {
  try {
    const vehicle = await getOwnerVehicle(req.params.id, req.ownerId!);
    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    const { type, photoSlot, fileDataUrl, fileName, expiresAt } = req.body as {
      type?: string;
      photoSlot?: string | null;
      fileDataUrl?: string;
      fileName?: string;
      expiresAt?: string | null;
    };

    const docType = type ? parseVaultType(type) : null;
    if (!docType) {
      res.status(400).json({ error: 'Invalid document type' });
      return;
    }

    if (!fileDataUrl?.startsWith('data:image/') && !fileDataUrl?.startsWith('data:application/pdf')) {
      res.status(400).json({ error: 'Upload a JPEG, PNG, or PDF file' });
      return;
    }

    const mimeMatch = fileDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!mimeMatch) {
      res.status(400).json({ error: 'Invalid file data' });
      return;
    }

    const mimeType = mimeMatch[1];
    const base64 = mimeMatch[2];
    const byteLen = Math.ceil((base64.length * 3) / 4);
    if (byteLen > MAX_VAULT_BYTES) {
      res.status(400).json({ error: 'File too large. Use a photo under 4 MB.' });
      return;
    }

    let slot = '';
    if (docType === 'VEHICLE_PHOTO') {
      if (!photoSlot || !isPhotoSlot(photoSlot)) {
        res.status(400).json({ error: `photoSlot must be one of: ${VAULT_PHOTO_SLOTS.join(', ')}` });
        return;
      }
      slot = photoSlot;
    }

    let parsedExpiry: Date | null = null;
    if (expiresAt) {
      parsedExpiry = new Date(expiresAt);
      if (Number.isNaN(parsedExpiry.getTime())) {
        res.status(400).json({ error: 'Invalid expiry date' });
        return;
      }
    } else if (VAULT_EXPIRY_TYPES.includes(docType) && expiresAt === undefined) {
      parsedExpiry = null;
    }

    const safeName =
      fileName?.trim().slice(0, 120) ||
      `${docType.toLowerCase()}${slot ? `-${slot}` : ''}.${mimeType.includes('pdf') ? 'pdf' : 'jpg'}`;

    const doc = await prisma.vehicleDocument.upsert({
      where: {
        vehicleId_type_photoSlot: {
          vehicleId: vehicle.id,
          type: docType,
          photoSlot: slot,
        },
      },
      create: {
        vehicleId: vehicle.id,
        type: docType,
        photoSlot: slot,
        fileName: safeName,
        mimeType,
        fileData: fileDataUrl,
        expiresAt: parsedExpiry,
      },
      update: {
        fileName: safeName,
        mimeType,
        fileData: fileDataUrl,
        expiresAt: parsedExpiry,
      },
      select: {
        id: true,
        type: true,
        photoSlot: true,
        fileName: true,
        mimeType: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(201).json(mapVaultDocument(doc));
  } catch (error) {
    console.error('POST /api/vehicles/:id/vault:', error);
    res.status(500).json({ error: 'Failed to save document' });
  }
});

router.patch('/:id/vault/:docId', async (req: AuthRequest, res) => {
  try {
    const vehicle = await getOwnerVehicle(req.params.id, req.ownerId!);
    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    const { expiresAt } = req.body as { expiresAt?: string | null };
    const doc = await prisma.vehicleDocument.findFirst({
      where: { id: req.params.docId, vehicleId: vehicle.id },
    });
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    if (!VAULT_EXPIRY_TYPES.includes(doc.type)) {
      res.status(400).json({ error: 'This document type does not support expiry dates' });
      return;
    }

    let parsedExpiry: Date | null = null;
    if (expiresAt) {
      parsedExpiry = new Date(expiresAt);
      if (Number.isNaN(parsedExpiry.getTime())) {
        res.status(400).json({ error: 'Invalid expiry date' });
        return;
      }
    } else if (expiresAt === null) {
      parsedExpiry = null;
    } else {
      res.status(400).json({ error: 'expiresAt is required' });
      return;
    }

    const updated = await prisma.vehicleDocument.update({
      where: { id: doc.id },
      data: { expiresAt: parsedExpiry },
      select: {
        id: true,
        type: true,
        photoSlot: true,
        fileName: true,
        mimeType: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json(mapVaultDocument(updated));
  } catch (error) {
    console.error('PATCH /api/vehicles/:id/vault/:docId:', error);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

router.delete('/:id/vault/:docId', async (req: AuthRequest, res) => {
  try {
    const vehicle = await getOwnerVehicle(req.params.id, req.ownerId!);
    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    const doc = await prisma.vehicleDocument.findFirst({
      where: { id: req.params.docId, vehicleId: vehicle.id },
    });
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    await prisma.vehicleDocument.delete({ where: { id: doc.id } });
    res.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/vehicles/:id/vault/:docId:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

router.patch('/:id/sticker', async (req: AuthRequest, res) => {
  try {
    const { themeId, customImageData, customization } = req.body as {
      themeId?: string;
      customImageData?: string | null;
      customization?: unknown;
    };

    const vehicle = await getOwnerVehicle(req.params.id, req.ownerId!);
    if (!vehicle?.sticker) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    const parsedCustomization =
      customization !== undefined ? parseStickerCustomization(customization) : undefined;

    // If image is cleared, force imageMode back to none
    let nextCustomization = parsedCustomization;
    if (customImageData === null && parsedCustomization) {
      nextCustomization = { ...parsedCustomization, imageMode: 'none' };
    } else if (customImageData === null) {
      const current = parseStickerCustomization(vehicle.sticker.customization);
      nextCustomization = { ...current, imageMode: 'none' };
    }

    const sticker = await prisma.sticker.update({
      where: { vehicleId: vehicle.id },
      data: {
        ...(themeId !== undefined && { themeId }),
        ...(customImageData !== undefined && { customImageData }),
        ...(nextCustomization !== undefined && {
          customization: JSON.stringify(nextCustomization),
        }),
      },
    });

    res.json({
      code: sticker.code,
      themeId: sticker.themeId,
      customImageData: sticker.customImageData,
      customization: parseStickerCustomization(sticker.customization),
    });
  } catch (error) {
    console.error('PATCH /api/vehicles/:id/sticker:', error);
    res.status(500).json({ error: 'Failed to update sticker' });
  }
});

router.post('/:id/sticker/stylize', async (req: AuthRequest, res) => {
  try {
    if (!isGeminiConfigured()) {
      res.status(503).json({ error: 'AI is not configured. Add GEMINI_API_KEY to backend/.env and restart the server.' });
      return;
    }

    const { imageData, style, aiPrompt, headline, tagline } = req.body as {
      imageData?: string;
      style?: string;
      aiPrompt?: string;
      headline?: string;
      tagline?: string;
    };
    const artStyle = style ?? 'luxury-gold';

    const vehicle = await getOwnerVehicle(req.params.id, req.ownerId!);
    if (!vehicle?.sticker) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    let referenceBase64: string | undefined;
    let referenceMime: string | undefined;

    if (imageData?.startsWith('data:image/')) {
      const mimeMatch = imageData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
      referenceMime = mimeMatch?.[1] ?? 'image/png';
      referenceBase64 = imageData.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');

      if (referenceBase64.length > 6_000_000) {
        res.status(400).json({ error: 'Image too large. Use a smaller photo (under ~4 MB).' });
        return;
      }
    }

    const result = await generateFullStickerCard({
      style: artStyle,
      aiPrompt,
      headline,
      tagline,
      referenceBase64,
      referenceMime,
    });

    if (!result.dataUrl) {
      res.status(502).json({
        error: result.error ?? 'AI generation failed. Check GEMINI_API_KEY and try again.',
      });
      return;
    }

    res.json({ imageDataUrl: result.dataUrl });
  } catch (error) {
    console.error('POST /api/vehicles/:id/sticker/stylize:', error);
    res.status(500).json({ error: 'Failed to generate QR design' });
  }
});

export default router;
