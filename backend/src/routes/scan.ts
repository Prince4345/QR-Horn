import { Router } from 'express';
import { ContactReason } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { normalizePlate } from '../lib/plates.js';
import { sendOwnerAlert } from '../lib/alerts.js';
import { createVoiceRoom, setRoomCallId } from '../lib/voiceRooms.js';
import { emitIncomingCall } from '../socket.js';
import { checkScanActionLimit } from '../lib/rateLimit.js';
import { nanoid } from 'nanoid';

const router = Router();

const REASON_LABELS: Record<ContactReason, string> = {
  move: 'Please move your vehicle',
  lights: 'Lights are ON',
  parking: 'Wrong parking',
  emergency: 'Emergency contact',
  other: 'Other request',
};

function clientIp(req: { ip?: string; headers: Record<string, unknown> }): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || 'unknown';
}

function enforceRateLimit(
  res: { status: (code: number) => { json: (body: object) => void }; setHeader: (k: string, v: string) => void },
  ip: string,
  vehicleKey: string
): boolean {
  const { allowed, retryAfterSec } = checkScanActionLimit(ip, vehicleKey);
  if (!allowed) {
    res.setHeader('Retry-After', String(retryAfterSec));
    res.status(429).json({
      error: `Too many alerts for this vehicle. Try again in ${Math.ceil(retryAfterSec / 60)} minute(s).`,
    });
    return false;
  }
  return true;
}

async function notifyOwner(
  vehicle: { id: string; ownerId: string; name: string; number: string; theftMode: boolean },
  reason: ContactReason
) {
  const description = REASON_LABELS[reason];

  await prisma.$transaction([
    prisma.notification.create({ data: { vehicleId: vehicle.id, reason } }),
    prisma.activity.create({
      data: { vehicleId: vehicle.id, type: 'notification', description },
    }),
  ]);

  return sendOwnerAlert(vehicle.ownerId, {
    reason,
    vehicleName: vehicle.name,
    vehicleNumber: vehicle.number,
    theftMode: vehicle.theftMode,
    kind: 'notify',
  });
}

/**
 * Create the Call record at initiation. The activity-feed entry (with outcome
 * and duration) is written when the room closes — see lib/callLog.ts.
 */
async function recordCall(
  vehicleId: string,
  status: 'CONNECTING' | 'COMPLETED' | 'FAILED'
): Promise<string> {
  const call = await prisma.call.create({ data: { vehicleId, status } });
  return call.id;
}

function formatVehicleResponse(vehicle: {
  id: string;
  name: string;
  number: string;
  theftMode: boolean;
  sticker: { code: string } | null;
}) {
  return {
    vehicleId: vehicle.id,
    vehicleName: vehicle.name,
    vehicleNumber: vehicle.number,
    ownerName: 'Vehicle owner',
    theftMode: vehicle.theftMode,
    stickerCode: vehicle.sticker?.code ?? null,
    registered: true,
  };
}

async function findActiveVehicleByPlate(plate: string) {
  const normalized = normalizePlate(plate);
  if (!normalized) return null;

  return prisma.vehicle.findFirst({
    where: { active: true, numberNormalized: normalized },
    include: {
      sticker: { select: { code: true } },
    },
  });
}

async function findActiveVehicleByStickerCode(code: string) {
  const sticker = await prisma.sticker.findUnique({
    where: { code },
    include: {
      vehicle: {
        include: {
          sticker: { select: { code: true } },
        },
      },
    },
  });

  if (!sticker || !sticker.vehicle.active) return null;
  return sticker.vehicle;
}

// Vehicle number lookup — must be before /:code routes
router.get('/by-number/:number', async (req, res) => {
  try {
    const vehicle = await findActiveVehicleByPlate(req.params.number);

    if (!vehicle) {
      res.status(404).json({
        error: 'This vehicle is not registered with QRHorn',
        registered: false,
      });
      return;
    }

    res.json(formatVehicleResponse(vehicle));
  } catch (error) {
    console.error('GET /api/scan/by-number/:number:', error);
    res.status(500).json({ error: 'Failed to look up vehicle' });
  }
});

router.post('/by-number/:number/notify', async (req, res) => {
  try {
    const { reason } = req.body as { reason?: ContactReason };
    const validReasons: ContactReason[] = ['move', 'lights', 'parking', 'emergency', 'other'];

    if (!reason || !validReasons.includes(reason)) {
      res.status(400).json({ error: 'Invalid reason' });
      return;
    }

    const vehicle = await findActiveVehicleByPlate(req.params.number);
    if (!vehicle) {
      res.status(404).json({ error: 'This vehicle is not registered with QRHorn' });
      return;
    }

    if (!enforceRateLimit(res, clientIp(req), vehicle.id)) return;

    const { pushDelivered, smsDelivered, alertDelivered } = await notifyOwner(vehicle, reason);

    res.json({
      success: true,
      pushDelivered,
      smsDelivered,
      alertDelivered,
      message: alertDelivered
        ? smsDelivered
          ? 'Owner notified via SMS'
          : 'Owner notified via push'
        : 'Request logged — owner has no phone alerts set up yet',
    });
  } catch (error) {
    console.error('POST /api/scan/by-number/:number/notify:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

router.post('/by-number/:number/call', async (req, res) => {
  try {
    const vehicle = await findActiveVehicleByPlate(req.params.number);
    if (!vehicle) {
      res.status(404).json({ error: 'This vehicle is not registered with QRHorn' });
      return;
    }

    if (!enforceRateLimit(res, clientIp(req), vehicle.id)) return;

    const roomId = nanoid(12);
    const created = createVoiceRoom({
      vehicleId: vehicle.id,
      ownerId: vehicle.ownerId,
      vehicleName: vehicle.name,
      vehicleNumber: vehicle.number,
      roomId,
    });

    if (created.error || !created.room) {
      res.status(409).json({ error: created.error ?? 'Owner is already on a call. Try again in a moment.' });
      return;
    }

    const alert = await sendOwnerAlert(vehicle.ownerId, {
      reason: 'call',
      vehicleName: vehicle.name,
      vehicleNumber: vehicle.number,
      theftMode: vehicle.theftMode,
      kind: 'call',
    });

    const callId = await recordCall(vehicle.id, 'CONNECTING');
    setRoomCallId(roomId, callId);
    emitIncomingCall(vehicle.ownerId, {
      roomId,
      vehicleName: vehicle.name,
      vehicleNumber: vehicle.number,
    });

    res.json({
      success: true,
      roomId,
      callInitiated: true,
      alertDelivered: alert.alertDelivered,
      pushDelivered: alert.pushDelivered,
      smsDelivered: alert.smsDelivered,
      message: 'Ringing owner in the app — no phone number needed.',
    });
  } catch (error) {
    console.error('POST /api/scan/by-number/:number/call:', error);
    res.status(500).json({ error: 'Failed to start call' });
  }
});

router.get('/:code', async (req, res) => {
  try {
    const vehicle = await findActiveVehicleByStickerCode(req.params.code);

    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found or inactive', registered: false });
      return;
    }

    res.json(formatVehicleResponse(vehicle));
  } catch (error) {
    console.error('GET /api/scan/:code:', error);
    res.status(500).json({ error: 'Failed to load scan data' });
  }
});

router.post('/:code/notify', async (req, res) => {
  try {
    const { reason } = req.body as { reason?: ContactReason };
    const validReasons: ContactReason[] = ['move', 'lights', 'parking', 'emergency', 'other'];

    if (!reason || !validReasons.includes(reason)) {
      res.status(400).json({ error: 'Invalid reason' });
      return;
    }

    const vehicle = await findActiveVehicleByStickerCode(req.params.code);
    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found or inactive' });
      return;
    }

    if (!enforceRateLimit(res, clientIp(req), vehicle.id)) return;

    const { pushDelivered, smsDelivered, alertDelivered } = await notifyOwner(vehicle, reason);

    res.json({
      success: true,
      pushDelivered,
      smsDelivered,
      alertDelivered,
      message: alertDelivered
        ? smsDelivered
          ? 'Owner notified via SMS'
          : 'Owner notified via push'
        : 'Request logged — owner has no phone alerts set up yet',
    });
  } catch (error) {
    console.error('POST /api/scan/:code/notify:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

router.post('/:code/call', async (req, res) => {
  try {
    const vehicle = await findActiveVehicleByStickerCode(req.params.code);
    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found or inactive' });
      return;
    }

    if (!enforceRateLimit(res, clientIp(req), vehicle.id)) return;

    const roomId = nanoid(12);
    const created = createVoiceRoom({
      vehicleId: vehicle.id,
      ownerId: vehicle.ownerId,
      vehicleName: vehicle.name,
      vehicleNumber: vehicle.number,
      roomId,
    });

    if (created.error || !created.room) {
      res.status(409).json({ error: created.error ?? 'Owner is already on a call. Try again in a moment.' });
      return;
    }

    const alert = await sendOwnerAlert(vehicle.ownerId, {
      reason: 'call',
      vehicleName: vehicle.name,
      vehicleNumber: vehicle.number,
      theftMode: vehicle.theftMode,
      kind: 'call',
    });

    const callId = await recordCall(vehicle.id, 'CONNECTING');
    setRoomCallId(roomId, callId);
    emitIncomingCall(vehicle.ownerId, {
      roomId,
      vehicleName: vehicle.name,
      vehicleNumber: vehicle.number,
    });

    res.json({
      success: true,
      roomId,
      callInitiated: true,
      alertDelivered: alert.alertDelivered,
      pushDelivered: alert.pushDelivered,
      smsDelivered: alert.smsDelivered,
      message: 'Ringing owner in the app — no phone number needed.',
    });
  } catch (error) {
    console.error('POST /api/scan/:code/call:', error);
    res.status(500).json({ error: 'Failed to start call' });
  }
});

export default router;
