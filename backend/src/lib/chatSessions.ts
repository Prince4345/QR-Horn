import { ContactReason, type ChatMessage, type ChatSession, type ChatSessionStatus } from '@prisma/client';
import { nanoid } from 'nanoid';
import { prisma } from './prisma.js';
import { checkRateLimit } from './rateLimit.js';

export const ACTIVE_WINDOW_MS = 60 * 60 * 1000;
export const READ_ONLY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const ACTIVITY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_MESSAGE_LENGTH = 280;
export const MESSAGE_RATE_LIMIT = 10;
export const MESSAGE_RATE_WINDOW_MS = 60 * 1000;

export const SCANNER_QUICK_REPLIES = [
  'Please move your vehicle',
  'Your lights are on',
  'Wrong parking spot',
  'Emergency — please respond',
  'Other',
] as const;

export const OWNER_QUICK_REPLIES = [
  'On my way',
  'Give me 5 minutes',
  'Car moved',
  'Not my vehicle',
  "Can't come right now",
] as const;

export type ChatMessageDto = {
  id: string;
  senderRole: 'SCANNER' | 'OWNER';
  body: string;
  isQuickReply: boolean;
  createdAt: string;
  readAt: string | null;
};

export type ChatSessionDto = {
  id: string;
  vehicleId: string;
  vehicleName: string;
  vehicleNumber: string;
  ownerName: string;
  scannerName: string | null;
  status: ChatSessionStatus;
  callRoomId: string | null;
  canSend: boolean;
  readOnly: boolean;
  activeUntil: string;
  readOnlyUntil: string | null;
  messages: ChatMessageDto[];
  scannerQuickReplies: readonly string[];
  ownerQuickReplies: readonly string[];
};

type SessionWithRelations = ChatSession & {
  vehicle: { id: string; name: string; number: string; owner: { name: string } };
  messages: ChatMessage[];
};

function toMessageDto(m: ChatMessage): ChatMessageDto {
  return {
    id: m.id,
    senderRole: m.senderRole,
    body: m.body,
    isQuickReply: m.isQuickReply,
    createdAt: m.createdAt.toISOString(),
    readAt: m.readAt?.toISOString() ?? null,
  };
}

export async function isScannerBlocked(vehicleId: string, scannerToken: string): Promise<boolean> {
  const row = await prisma.chatBlockedScanner.findUnique({
    where: { vehicleId_scannerToken: { vehicleId, scannerToken } },
  });
  return !!row;
}

/** Advance ACTIVE → READ_ONLY → CLOSED and purge expired message bodies. */
export async function refreshSessionLifecycle(session: ChatSession): Promise<ChatSession> {
  const now = new Date();

  if (session.status === 'BLOCKED' || session.status === 'CLOSED') {
    return session;
  }

  if (session.status === 'ACTIVE' && now > session.activeUntil) {
    return prisma.chatSession.update({
      where: { id: session.id },
      data: {
        status: 'READ_ONLY',
        readOnlyUntil: new Date(now.getTime() + READ_ONLY_WINDOW_MS),
      },
    });
  }

  if (session.status === 'READ_ONLY' && session.readOnlyUntil && now > session.readOnlyUntil) {
    await prisma.chatMessage.deleteMany({ where: { sessionId: session.id } });
    return prisma.chatSession.update({
      where: { id: session.id },
      data: { status: 'CLOSED', closedAt: now },
    });
  }

  return session;
}

async function loadSessionWithVehicle(sessionId: string): Promise<SessionWithRelations | null> {
  return prisma.chatSession.findUnique({
    where: { id: sessionId },
    include: {
      vehicle: {
        select: {
          id: true,
          name: true,
          number: true,
          owner: { select: { name: true } },
        },
      },
      messages: { orderBy: { createdAt: 'asc' } },
    },
  });
}

/** Mark the other party's unread messages as read. Returns true if any rows updated. */
export async function markMessagesRead(
  sessionId: string,
  readerRole: 'scanner' | 'owner'
): Promise<boolean> {
  const otherRole = readerRole === 'owner' ? 'SCANNER' : 'OWNER';
  const result = await prisma.chatMessage.updateMany({
    where: {
      sessionId,
      senderRole: otherRole,
      readAt: null,
    },
    data: { readAt: new Date() },
  });
  return result.count > 0;
}

export function formatSessionDto(
  session: SessionWithRelations,
  _role: 'scanner' | 'owner'
): ChatSessionDto {
  const readOnly = session.status === 'READ_ONLY';
  const canSend = session.status === 'ACTIVE';

  return {
    id: session.id,
    vehicleId: session.vehicleId,
    vehicleName: session.vehicle.name,
    vehicleNumber: session.vehicle.number,
    ownerName: session.vehicle.owner.name,
    scannerName: session.scannerName?.trim() || null,
    status: session.status,
    callRoomId: session.callRoomId,
    canSend,
    readOnly,
    activeUntil: session.activeUntil.toISOString(),
    readOnlyUntil: session.readOnlyUntil?.toISOString() ?? null,
    messages: session.messages.map(toMessageDto),
    scannerQuickReplies: SCANNER_QUICK_REPLIES,
    ownerQuickReplies: OWNER_QUICK_REPLIES,
  };
}

export async function getSessionDtoForRole(
  sessionId: string,
  role: 'scanner' | 'owner',
  opts?: { markRead?: boolean }
): Promise<ChatSessionDto | null> {
  const loaded = await loadSessionWithVehicle(sessionId);
  if (!loaded) return null;
  const session = await refreshSessionLifecycle(loaded);

  if (opts?.markRead !== false) {
    await markMessagesRead(session.id, role);
  }

  const refreshed = await loadSessionWithVehicle(session.id);
  if (!refreshed) return null;
  return formatSessionDto(refreshed, role);
}

/**
 * One open chat per (vehicle, scannerToken).
 * Multiple anonymous people scanning the same QR each get their own thread.
 */
export async function ensureChatSession(opts: {
  vehicleId: string;
  ownerId: string;
  callRoomId?: string | null;
  reason?: ContactReason | null;
  scannerToken?: string;
  scannerName?: string | null;
}): Promise<{ sessionId: string; scannerToken: string; created: boolean }> {
  const scannerToken = opts.scannerToken?.trim() || nanoid(32);

  if (await isScannerBlocked(opts.vehicleId, scannerToken)) {
    throw new Error('blocked');
  }

  const open = await prisma.chatSession.findFirst({
    where: {
      vehicleId: opts.vehicleId,
      scannerToken,
      status: { in: ['ACTIVE', 'READ_ONLY'] },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (open) {
    const refreshed = await refreshSessionLifecycle(open);
    if (refreshed.status === 'ACTIVE' || refreshed.status === 'READ_ONLY') {
      const updates: { callRoomId?: string; activeUntil?: Date; scannerName?: string } = {};
      if (opts.callRoomId && !refreshed.callRoomId) {
        updates.callRoomId = opts.callRoomId;
      }
      if (refreshed.status === 'ACTIVE') {
        updates.activeUntil = new Date(Date.now() + ACTIVE_WINDOW_MS);
      }
      if (opts.scannerName?.trim() && !refreshed.scannerName) {
        updates.scannerName = opts.scannerName.trim();
      }
      if (Object.keys(updates).length > 0) {
        await prisma.chatSession.update({ where: { id: refreshed.id }, data: updates });
      }
      return { sessionId: refreshed.id, scannerToken: refreshed.scannerToken, created: false };
    }
  }

  const scannerName = opts.scannerName?.trim() || null;

  const session = await prisma.chatSession.create({
    data: {
      vehicleId: opts.vehicleId,
      ownerId: opts.ownerId,
      scannerToken,
      scannerName,
      callRoomId: opts.callRoomId ?? null,
      reason: opts.reason ?? null,
      status: 'ACTIVE',
      activeUntil: new Date(Date.now() + ACTIVE_WINDOW_MS),
    },
  });

  await prisma.activity.create({
    data: {
      vehicleId: opts.vehicleId,
      type: 'chat',
      description: scannerName
        ? `Chat started by ${scannerName}`
        : 'Anonymous chat started',
    },
  });

  return { sessionId: session.id, scannerToken, created: true };
}

export function checkChatMessageRateLimit(sessionId: string, role: 'scanner' | 'owner') {
  return checkRateLimit(`chat:msg:${sessionId}:${role}`, MESSAGE_RATE_LIMIT, MESSAGE_RATE_WINDOW_MS);
}

export function validateMessageBody(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return 'Message cannot be empty';
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return `Message must be ${MAX_MESSAGE_LENGTH} characters or less`;
  }
  return null;
}

export async function appendChatMessage(opts: {
  sessionId: string;
  senderRole: 'SCANNER' | 'OWNER';
  body: string;
  isQuickReply?: boolean;
}): Promise<{ message: ChatMessageDto; session: ChatSessionDto; ownerId: string } | { error: string; status: number }> {
  const loaded = await loadSessionWithVehicle(opts.sessionId);
  if (!loaded) return { error: 'Chat session not found', status: 404 };

  const session = await refreshSessionLifecycle(loaded);
  if (session.status === 'BLOCKED') {
    return { error: 'This chat has been blocked', status: 403 };
  }
  if (session.status === 'CLOSED') {
    return { error: 'This chat session has ended', status: 410 };
  }
  if (session.status === 'READ_ONLY') {
    return { error: 'Chat is read-only — messages can no longer be sent', status: 403 };
  }

  const role = opts.senderRole === 'SCANNER' ? 'scanner' : 'owner';

  const bodyError = validateMessageBody(opts.body);
  if (bodyError) return { error: bodyError, status: 400 };

  const rate = checkChatMessageRateLimit(opts.sessionId, role);
  if (!rate.allowed) {
    return { error: `Too many messages. Try again in ${rate.retryAfterSec} seconds.`, status: 429 };
  }

  const message = await prisma.chatMessage.create({
    data: {
      sessionId: opts.sessionId,
      senderRole: opts.senderRole,
      body: opts.body.trim(),
      isQuickReply: !!opts.isQuickReply,
    },
  });

  const now = new Date();
  if (session.status === 'ACTIVE') {
    await prisma.chatSession.update({
      where: { id: session.id },
      data: { activeUntil: new Date(now.getTime() + ACTIVE_WINDOW_MS) },
    });
  }

  const dto = await getSessionDtoForRole(opts.sessionId, role, { markRead: false });
  if (!dto) return { error: 'Chat session not found', status: 404 };

  return {
    message: toMessageDto(message),
    session: dto,
    ownerId: session.ownerId,
  };
}

/** Purge old closed sessions' messages and drop activity older than 7 days. */
export async function runChatCleanup(): Promise<void> {
  const now = new Date();
  const activityCutoff = new Date(now.getTime() - ACTIVITY_RETENTION_MS);

  const staleSessions = await prisma.chatSession.findMany({
    where: {
      OR: [
        { status: 'CLOSED', updatedAt: { lt: new Date(now.getTime() - READ_ONLY_WINDOW_MS) } },
        {
          status: 'READ_ONLY',
          readOnlyUntil: { lt: now },
        },
        {
          status: 'ACTIVE',
          activeUntil: { lt: now },
        },
      ],
    },
    select: { id: true, status: true, activeUntil: true, readOnlyUntil: true },
  });

  for (const s of staleSessions) {
    await refreshSessionLifecycle(s as ChatSession);
  }

  await prisma.activity.deleteMany({
    where: { type: 'chat', createdAt: { lt: activityCutoff } },
  });
}
