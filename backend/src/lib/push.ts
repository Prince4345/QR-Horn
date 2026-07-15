import admin from 'firebase-admin';
import { prisma } from './prisma.js';

let initialized = false;

function initFirebase() {
  if (initialized) return !!admin.apps.length;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    return false;
  }

  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
  initialized = true;
  return true;
}

const REASON_TITLES: Record<string, string> = {
  move: 'Move your vehicle',
  lights: 'Lights are ON',
  parking: 'Wrong parking',
  emergency: 'Emergency contact',
  other: 'Someone needs to reach you',
  call: 'Incoming call request',
};

function isInvalidFcmToken(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  return code === 'messaging/invalid-registration-token' || code === 'messaging/registration-token-not-registered';
}

/** All registered device tokens for an owner (multi-device table + legacy field). */
async function collectTokens(ownerId: string): Promise<Set<string>> {
  const [owner, rows] = await Promise.all([
    prisma.owner.findUnique({ where: { id: ownerId }, select: { fcmToken: true } }),
    prisma.ownerPushToken.findMany({ where: { ownerId }, select: { token: true } }),
  ]);

  const tokenSet = new Set<string>();
  if (owner?.fcmToken) tokenSet.add(owner.fcmToken);
  for (const row of rows) tokenSet.add(row.token);
  return tokenSet;
}

async function removeToken(ownerId: string, token: string) {
  await prisma.ownerPushToken.deleteMany({ where: { token } }).catch(() => {});
  await prisma.owner
    .updateMany({ where: { id: ownerId, fcmToken: token }, data: { fcmToken: null } })
    .catch(() => {});
}

interface PushSendResult {
  sent: number;
  total: number;
  errors: string[];
}

async function sendDataToOwnerDevices(
  ownerId: string,
  data: Record<string, string>,
  ttlSeconds: number,
  webNotification?: { title: string; body: string; link?: string }
): Promise<PushSendResult> {
  if (!initFirebase()) {
    return { sent: 0, total: 0, errors: ['Push is not configured on the server'] };
  }

  const tokens = await collectTokens(ownerId);
  if (tokens.size === 0) {
    return { sent: 0, total: 0, errors: ['No devices have notifications enabled'] };
  }

  let sent = 0;
  const errors: string[] = [];

  for (const token of tokens) {
    try {
      // Data-only message: the service worker displays it (avoids duplicate
      // notifications) and handles clicks to open the dashboard.
      await admin.messaging().send({
        token,
        data,
        ...(webNotification
          ? {
              webpush: {
                headers: {
                  Urgency: 'high',
                  TTL: String(ttlSeconds),
                },
                notification: {
                  title: webNotification.title,
                  body: webNotification.body,
                  tag: data.kind === 'call' ? 'qrhorn-call' : data.kind === 'chat' ? 'qrhorn-chat' : 'qrhorn-alert',
                  requireInteraction: data.kind === 'call',
                },
                ...(webNotification.link ? { fcmOptions: { link: webNotification.link } } : {}),
              },
            }
          : {
              webpush: {
                headers: {
                  Urgency: 'high',
                  TTL: String(ttlSeconds),
                },
              },
            }),
      });
      sent += 1;
    } catch (err) {
      console.error('FCM send failed:', err);
      errors.push((err as Error).message ?? 'Unknown FCM error');
      if (isInvalidFcmToken(err)) {
        await removeToken(ownerId, token);
      }
    }
  }

  return { sent, total: tokens.size, errors };
}

export async function sendPushToOwner(
  ownerId: string,
  payload: {
    reason: string;
    vehicleName: string;
    vehicleNumber: string;
    theftMode: boolean;
    kind?: 'notify' | 'call';
    roomId?: string;
  }
): Promise<boolean> {
  const isCall = payload.kind === 'call';
  const title = isCall
    ? `📞 Incoming call — ${payload.vehicleName}`
    : payload.theftMode
      ? '⚠ Theft Alert'
      : 'Vehicle Contact';
  const body = isCall
    ? `Someone at ${payload.vehicleNumber} wants to talk. Tap to answer.`
    : `${payload.vehicleName} (${payload.vehicleNumber}): ${REASON_TITLES[payload.reason] ?? payload.reason}`;

  const appBase = process.env.KEEP_ALIVE_URL?.trim()?.replace(/\/$/, '') ?? '';
  const relativeUrl =
    isCall && payload.roomId
      ? `/?view=dashboard&call=${encodeURIComponent(payload.roomId)}`
      : '/?view=dashboard';

  const data: Record<string, string> = {
    title,
    body,
    kind: payload.kind ?? 'notify',
    url: relativeUrl,
  };
  if (payload.roomId) data.roomId = payload.roomId;

  const result = await sendDataToOwnerDevices(
    ownerId,
    data,
    isCall ? 60 : 3600,
    isCall ? { title, body, link: appBase ? `${appBase}${relativeUrl}` : undefined } : undefined
  );

  return result.sent > 0;
}

/** Push when a scanner sends a chat message (no SMS). */
export async function sendChatMessagePush(
  ownerId: string,
  payload: {
    sessionId: string;
    vehicleName: string;
    vehicleNumber: string;
    preview: string;
  }
): Promise<boolean> {
  const title = `💬 ${payload.vehicleName}`;
  const body =
    payload.preview.length > 80 ? `${payload.preview.slice(0, 77)}…` : payload.preview;
  const appBase = process.env.KEEP_ALIVE_URL?.trim()?.replace(/\/$/, '') ?? '';
  const relativeUrl = `/?view=dashboard&chat=${encodeURIComponent(payload.sessionId)}`;

  const data: Record<string, string> = {
    title,
    body,
    kind: 'chat',
    url: relativeUrl,
    sessionId: payload.sessionId,
  };

  const result = await sendDataToOwnerDevices(
    ownerId,
    data,
    3600,
    { title, body, link: appBase ? `${appBase}${relativeUrl}` : undefined }
  );

  return result.sent > 0;
}

/** Owner-triggered test push, with diagnostics they can act on. */
export async function sendTestPushToOwner(ownerId: string): Promise<PushSendResult> {
  return sendDataToOwnerDevices(
    ownerId,
    {
      title: '🔔 QRHorn test',
      body: 'Push notifications are working on this device.',
      kind: 'notify',
      url: '/?view=dashboard',
    },
    300
  );
}

export function isPushConfigured(): boolean {
  return !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
}
