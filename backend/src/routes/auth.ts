import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthRequest } from '../lib/auth.js';
import { isPushConfigured } from '../lib/push.js';
import { isSmsConfigured } from '../lib/sms.js';
import { isVoiceConfigured } from '../lib/calls.js';
import { isGeminiConfigured } from '../lib/gemini.js';
import { getPendingCalls } from '../lib/voiceRooms.js';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();

router.get('/config', (_req, res) => {
  res.json({
    pushEnabled: isPushConfigured(),
    smsEnabled: isSmsConfigured(),
    voiceEnabled: isVoiceConfigured(),
    geminiEnabled: isGeminiConfigured(),
    firebase: {
      apiKey: process.env.FIREBASE_API_KEY ?? null,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN ?? null,
      projectId: process.env.FIREBASE_PROJECT_ID ?? null,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID ?? null,
      appId: process.env.FIREBASE_APP_ID ?? null,
      vapidKey: process.env.FIREBASE_VAPID_KEY ?? null,
    },
  });
});

router.get('/calls/pending', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.ownerId) {
      res.json([]);
      return;
    }
    res.json(getPendingCalls(req.ownerId));
  } catch (error) {
    console.error('GET /api/auth/calls/pending:', error);
    res.status(500).json({ error: 'Failed to fetch pending calls' });
  }
});

router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.ownerId) {
      res.json({ setupComplete: false, authUserId: req.authUserId });
      return;
    }

    const owner = await prisma.owner.findUnique({
      where: { id: req.ownerId },
      select: { id: true, name: true, email: true, phone: true, fcmToken: true },
    });

    res.json({ setupComplete: true, owner });
  } catch (error) {
    console.error('GET /api/auth/me:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

router.post('/setup', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!supabaseAdmin) {
      res.status(503).json({ error: 'Auth not configured' });
      return;
    }

    const { name, phone } = req.body as { name?: string; phone?: string };
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(req.authUserId!);
    const user = userData.user;

    const email =
      user?.email ??
      (user?.phone ? `${user.phone.replace(/\D/g, '')}@phone.qrhorn.app` : `${req.authUserId}@phone.qrhorn.app`);

    const userPhone = phone?.trim() || user?.phone || null;
    const displayName =
      name?.trim() ||
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      email.split('@')[0];

    const owner = await prisma.owner.upsert({
      where: { authUserId: req.authUserId! },
      create: {
        authUserId: req.authUserId!,
        name: displayName,
        email,
        phone: userPhone,
      },
      update: {
        ...(name?.trim() && { name: name.trim() }),
        ...(phone !== undefined && { phone: phone?.trim() || userPhone }),
      },
    });

    res.json({ setupComplete: true, owner });
  } catch (error) {
    console.error('POST /api/auth/setup:', error);
    res.status(500).json({ error: 'Failed to setup account' });
  }
});

router.patch('/fcm-token', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.ownerId) {
      res.status(403).json({ error: 'Complete account setup first' });
      return;
    }

    const { fcmToken, device } = req.body as { fcmToken?: string; device?: string };
    if (!fcmToken?.trim()) {
      res.status(400).json({ error: 'fcmToken is required' });
      return;
    }

    const token = fcmToken.trim();

    await prisma.owner.update({
      where: { id: req.ownerId },
      data: { fcmToken: token },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/auth/fcm-token:', error);
    res.status(500).json({ error: 'Failed to save push token' });
  }
});

export default router;
