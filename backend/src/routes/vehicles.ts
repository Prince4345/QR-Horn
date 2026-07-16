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

const router = Router();

router.use(requireAuth, requireOwner);

function mapVehicle(v: {
  id: string;
  name: string;
  number: string;
  type: VehicleType;
  active: boolean;
  theftMode: boolean;
  verified: boolean;
  verifiedAt: Date | null;
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
    const { name, number, active } = req.body as {
      name?: string;
      number?: string;
      active?: boolean;
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

    const updated = await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(numberValue !== undefined && { number: numberValue, numberNormalized }),
        ...(active !== undefined && { active }),
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
