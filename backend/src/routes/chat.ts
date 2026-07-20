import { Router } from 'express';
import { ContactReason } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, tryAttachOwner, type AuthRequest } from '../lib/auth.js';
import {
  appendChatMessage,
  ensureChatSession,
  getSessionDtoForRole,
  refreshSessionLifecycle,
} from '../lib/chatSessions.js';
import { checkScanActionLimit } from '../lib/rateLimit.js';
import { emitChatMessage, emitChatSessionUpdate, emitIncomingChat } from '../socket.js';
import { sendChatMessagePush } from '../lib/push.js';

const router = Router();

function clientIp(req: { ip?: string; headers: Record<string, unknown> }): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || 'unknown';
}

const sessionInclude = {
  vehicle: {
    select: {
      id: true,
      name: true,
      number: true,
      owner: { select: { name: true } },
    },
  },
  messages: { orderBy: { createdAt: 'asc' as const } },
};

async function getOwnerSession(sessionId: string, ownerId: string) {
  const session = await prisma.chatSession.findFirst({
    where: { id: sessionId, ownerId },
    include: sessionInclude,
  });
  if (!session) return null;
  const refreshed = await refreshSessionLifecycle(session);
  return prisma.chatSession.findFirst({
    where: { id: refreshed.id, ownerId },
    include: sessionInclude,
  });
}

async function getScannerSession(sessionId: string, scannerToken: string) {
  const session = await prisma.chatSession.findFirst({
    where: { id: sessionId, scannerToken },
    include: sessionInclude,
  });
  if (!session) return null;
  const refreshed = await refreshSessionLifecycle(session);
  return prisma.chatSession.findFirst({
    where: { id: refreshed.id, scannerToken },
    include: sessionInclude,
  });
}

router.get('/sessions', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.ownerId) {
      res.json([]);
      return;
    }

    const sessions = await prisma.chatSession.findMany({
      where: {
        ownerId: req.ownerId,
        status: { in: ['ACTIVE', 'READ_ONLY'] },
      },
      include: {
        vehicle: {
          select: {
            id: true,
            name: true,
            number: true,
            owner: { select: { name: true } },
          },
        },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
      take: 30,
    });

    const result = [];
    for (const s of sessions) {
      const refreshed = await refreshSessionLifecycle(s);
      if (refreshed.status === 'CLOSED' || refreshed.status === 'BLOCKED') continue;
      // Use list query includes on `s` — lifecycle update may drop relations
      const last = s.messages[0] ?? null;
      result.push({
        id: refreshed.id,
        vehicleId: refreshed.vehicleId,
        vehicleName: s.vehicle.name,
        vehicleNumber: s.vehicle.number,
        ownerName: s.vehicle.owner.name,
        scannerName: refreshed.scannerName?.trim() || null,
        status: refreshed.status,
        callRoomId: refreshed.callRoomId,
        readOnly: refreshed.status === 'READ_ONLY',
        updatedAt: refreshed.updatedAt.toISOString(),
        lastMessage: last
          ? {
              body: last.body,
              senderRole: last.senderRole,
              createdAt: last.createdAt.toISOString(),
              readAt: last.readAt?.toISOString() ?? null,
            }
          : null,
      });
    }

    res.json(result);
  } catch (error) {
    console.error('GET /api/chat/sessions:', error);
    res.status(500).json({ error: 'Failed to list chat sessions' });
  }
});

router.get('/sessions/:sessionId', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.ownerId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const owned = await prisma.chatSession.findFirst({
      where: { id: req.params.sessionId, ownerId: req.ownerId },
    });
    if (!owned) {
      res.status(404).json({ error: 'Chat session not found' });
      return;
    }
    const markRead = req.query.markRead !== '0' && req.query.markRead !== 'false';
    const dto = await getSessionDtoForRole(req.params.sessionId, 'owner', { markRead });
    if (!dto) {
      res.status(404).json({ error: 'Chat session not found' });
      return;
    }
    // Let the scanner see double-ticks when the owner opens the thread
    if (markRead) emitChatSessionUpdate(req.ownerId, dto);
    res.json(dto);
  } catch (error) {
    console.error('GET /api/chat/sessions/:sessionId:', error);
    res.status(500).json({ error: 'Failed to load chat session' });
  }
});

router.post('/sessions/:sessionId/messages', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.ownerId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const owned = await prisma.chatSession.findFirst({
      where: { id: req.params.sessionId, ownerId: req.ownerId },
    });
    if (!owned) {
      res.status(404).json({ error: 'Chat session not found' });
      return;
    }

    const { body, isQuickReply } = req.body as { body?: string; isQuickReply?: boolean };
    if (!body || typeof body !== 'string') {
      res.status(400).json({ error: 'Message body required' });
      return;
    }

    const result = await appendChatMessage({
      sessionId: req.params.sessionId,
      senderRole: 'OWNER',
      body,
      isQuickReply,
    });

    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    emitChatMessage(req.params.sessionId, req.ownerId!, result.message, result.session);
    emitChatSessionUpdate(req.ownerId, result.session);

    res.json({ message: result.message, session: result.session });
  } catch (error) {
    console.error('POST /api/chat/sessions/:sessionId/messages:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

router.post('/sessions/:sessionId/block', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.ownerId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const session = await prisma.chatSession.findFirst({
      where: { id: req.params.sessionId, ownerId: req.ownerId },
    });
    if (!session) {
      res.status(404).json({ error: 'Chat session not found' });
      return;
    }

    await prisma.chatBlockedScanner.upsert({
      where: {
        vehicleId_scannerToken: { vehicleId: session.vehicleId, scannerToken: session.scannerToken },
      },
      create: { vehicleId: session.vehicleId, scannerToken: session.scannerToken },
      update: {},
    });

    await prisma.chatSession.update({
      where: { id: session.id },
      data: { status: 'BLOCKED', closedAt: new Date() },
    });

    const dto = await getSessionDtoForRole(session.id, 'owner');
    if (dto) emitChatSessionUpdate(req.ownerId, dto);

    res.json({ success: true });
  } catch (error) {
    console.error('POST /api/chat/sessions/:sessionId/block:', error);
    res.status(500).json({ error: 'Failed to block chat' });
  }
});

router.post('/sessions/:sessionId/close', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.ownerId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const session = await prisma.chatSession.findFirst({
      where: { id: req.params.sessionId, ownerId: req.ownerId },
    });
    if (!session) {
      res.status(404).json({ error: 'Chat session not found' });
      return;
    }

    await prisma.chatMessage.deleteMany({ where: { sessionId: session.id } });
    await prisma.chatSession.update({
      where: { id: session.id },
      data: { status: 'CLOSED', closedAt: new Date() },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('POST /api/chat/sessions/:sessionId/close:', error);
    res.status(500).json({ error: 'Failed to close chat' });
  }
});

/** Scanner — no login; token in query/body */
router.get('/scanner/:sessionId', async (req, res) => {
  try {
    const token = String(req.query.token ?? '');
    if (!token) {
      res.status(401).json({ error: 'Scanner token required' });
      return;
    }

    const session = await getScannerSession(req.params.sessionId, token);
    if (!session) {
      res.status(404).json({ error: 'Chat session not found' });
      return;
    }

    const markRead = req.query.markRead !== '0' && req.query.markRead !== 'false';
    const dto = await getSessionDtoForRole(req.params.sessionId, 'scanner', { markRead });
    if (!dto) {
      res.status(404).json({ error: 'Chat session not found' });
      return;
    }
    if (markRead) emitChatSessionUpdate(session.ownerId, dto);
    res.json(dto);
  } catch (error) {
    console.error('GET /api/chat/scanner/:sessionId:', error);
    res.status(500).json({ error: 'Failed to load chat' });
  }
});

router.post('/scanner/:sessionId/messages', async (req, res) => {
  try {
    const { token, body, isQuickReply } = req.body as {
      token?: string;
      body?: string;
      isQuickReply?: boolean;
    };

    if (!token || typeof token !== 'string') {
      res.status(401).json({ error: 'Scanner token required' });
      return;
    }
    if (!body || typeof body !== 'string') {
      res.status(400).json({ error: 'Message body required' });
      return;
    }

    const session = await getScannerSession(req.params.sessionId, token);
    if (!session) {
      res.status(404).json({ error: 'Chat session not found' });
      return;
    }

    const result = await appendChatMessage({
      sessionId: req.params.sessionId,
      senderRole: 'SCANNER',
      body,
      isQuickReply,
    });

    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    emitChatMessage(req.params.sessionId, result.ownerId, result.message, result.session);
    emitChatSessionUpdate(result.ownerId, result.session);
    emitIncomingChat(result.ownerId, {
      sessionId: req.params.sessionId,
      vehicleName: result.session.vehicleName,
      vehicleNumber: result.session.vehicleNumber,
      preview: result.message.body,
    });

    void sendChatMessagePush(result.ownerId, {
      sessionId: req.params.sessionId,
      vehicleName: result.session.vehicleName,
      vehicleNumber: result.session.vehicleNumber,
      preview: result.message.body,
    });

    res.json({ message: result.message, session: result.session });
  } catch (error) {
    console.error('POST /api/chat/scanner/:sessionId/messages:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

/** Anonymous scanner ends / leaves the chat (clears resume on their device). */
router.post('/scanner/:sessionId/leave', async (req, res) => {
  try {
    const token = String((req.body as { token?: string })?.token ?? req.query.token ?? '');
    if (!token) {
      res.status(401).json({ error: 'Scanner token required' });
      return;
    }

    const session = await getScannerSession(req.params.sessionId, token);
    if (!session) {
      // Already gone — treat as success so the client can clear local state
      res.json({ success: true });
      return;
    }

    if (session.status === 'ACTIVE' || session.status === 'READ_ONLY') {
      await prisma.chatSession.update({
        where: { id: session.id },
        data: { status: 'CLOSED', closedAt: new Date() },
      });
      const dto = await getSessionDtoForRole(session.id, 'owner');
      if (dto) emitChatSessionUpdate(session.ownerId, dto);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('POST /api/chat/scanner/:sessionId/leave:', error);
    res.status(500).json({ error: 'Failed to leave chat' });
  }
});

/** Start chat from scan flow (public) */
router.post('/start/:vehicleId', async (req, res) => {
  try {
    const { reason, callRoomId, scannerToken } = req.body as {
      reason?: ContactReason;
      callRoomId?: string;
      scannerToken?: string;
    };

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: req.params.vehicleId, active: true },
    });
    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    const ip = clientIp(req);
    const { allowed, retryAfterSec } = checkScanActionLimit(ip, vehicle.id);
    if (!allowed) {
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: `Too many requests for this vehicle. Try again in ${Math.ceil(retryAfterSec / 60)} minute(s).`,
      });
      return;
    }

    const validReasons: ContactReason[] = ['move', 'lights', 'parking', 'emergency', 'other'];
    const chatReason = reason && validReasons.includes(reason) ? reason : null;

    const registered = await tryAttachOwner(req as AuthRequest);
    // Don't label the vehicle owner as the scanner if they message their own car
    const scannerName =
      registered && registered.ownerId !== vehicle.ownerId ? registered.name : null;

    let created;
    try {
      created = await ensureChatSession({
        vehicleId: vehicle.id,
        ownerId: vehicle.ownerId,
        callRoomId: callRoomId ?? null,
        reason: chatReason,
        scannerToken,
        scannerName,
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'blocked') {
        res.status(403).json({ error: 'You have been blocked from chatting with this vehicle owner' });
        return;
      }
      throw err;
    }

    const dto = await getSessionDtoForRole(created.sessionId, 'scanner');
    if (!dto) {
      res.status(500).json({ error: 'Failed to start chat' });
      return;
    }

    if (created.created) {
      emitChatSessionUpdate(vehicle.ownerId, dto);
    }

    res.json({
      sessionId: created.sessionId,
      scannerToken: created.scannerToken,
      session: dto,
    });
  } catch (error) {
    console.error('POST /api/chat/start/:vehicleId:', error);
    res.status(500).json({ error: 'Failed to start chat' });
  }
});

export default router;
