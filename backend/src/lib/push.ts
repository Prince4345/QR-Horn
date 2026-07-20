import admin from 'firebase-admin';
import { prisma } from './prisma.js';
import { APP_NAME } from './brand.js';

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

function androidChannelId(kind: string | undefined): string {
  if (kind === 'call') return 'parkstag_calls';
  if (kind === 'chat') return 'parkstag_messages';
  return 'parkstag_alerts';
}

function androidNotificationTag(data: Record<string, string>): string {
  if (data.kind === 'call') {
    return data.roomId ? `qrhorn-call-${data.roomId}` : 'qrhorn-call';
  }
  if (data.kind === 'chat') {
    return data.sessionId ? `qrhorn-chat-${data.sessionId}` : 'qrhorn-chat';
  }
  return 'qrhorn-alert';
}

function appPublicBase(): string {
  const keep = process.env.KEEP_ALIVE_URL?.trim()?.replace(/\/$/, '');
  if (keep) return keep;
  const cors = process.env.CORS_ORIGIN?.split(',')[0]?.trim()?.replace(/\/$/, '');
  if (cors?.startsWith('http')) return cors;
  return '';
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

  const title = webNotification?.title ?? data.title ?? APP_NAME;
  const body = webNotification?.body ?? data.body ?? 'New vehicle contact';
  const isCall = data.kind === 'call';

  let sent = 0;
  const errors: string[] = [];

  for (const token of tokens) {
    try {
      // Data payload for all clients. Android notification shows in the tray
      // for native tokens; webpush covers browsers (SW handles data-only notify).
      await admin.messaging().send({
        token,
        data,
        android: {
          priority: 'high',
          ttl: ttlSeconds * 1000,
          notification: {
            title,
            body,
            channelId: androidChannelId(data.kind),
            sound: 'default',
            defaultVibrateTimings: true,
            priority: isCall ? 'max' : 'high',
            visibility: 'public',
            tag: androidNotificationTag(data),
          },
        },
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
                  tag: androidNotificationTag(data),
                  requireInteraction: isCall,
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
  // WhatsApp-style: short title + clear body
  const title = isCall
    ? 'Incoming call'
    : payload.theftMode
      ? 'Theft alert'
      : 'Vehicle alert';
  const body = isCall
    ? `${payload.vehicleName} · ${payload.vehicleNumber} — tap to answer`
    : `${payload.vehicleName} (${payload.vehicleNumber}): ${REASON_TITLES[payload.reason] ?? payload.reason}`;

  const appBase = appPublicBase();
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

  // Always include notification payload so Android/web show a tray alert (like WhatsApp)
  const result = await sendDataToOwnerDevices(ownerId, data, isCall ? 60 : 3600, {
    title,
    body,
    link: appBase ? `${appBase}${relativeUrl}` : undefined,
  });

  return result.sent > 0;
}

/** Push when a scanner sends a chat message (WhatsApp-style message notification). */
export async function sendChatMessagePush(
  ownerId: string,
  payload: {
    sessionId: string;
    vehicleName: string;
    vehicleNumber: string;
    preview: string;
  }
): Promise<boolean> {
  const title = payload.vehicleName || payload.vehicleNumber || APP_NAME;
  const body =
    payload.preview.length > 120 ? `${payload.preview.slice(0, 117)}…` : payload.preview;
  const appBase = appPublicBase();
  const relativeUrl = `/?view=dashboard&chat=${encodeURIComponent(payload.sessionId)}`;

  const data: Record<string, string> = {
    title,
    body,
    kind: 'chat',
    url: relativeUrl,
    sessionId: payload.sessionId,
  };

  const result = await sendDataToOwnerDevices(ownerId, data, 3600, {
    title,
    body,
    link: appBase ? `${appBase}${relativeUrl}` : undefined,
  });

  return result.sent > 0;
}

/** Owner-triggered test push, with diagnostics they can act on. */
export async function sendTestPushToOwner(ownerId: string): Promise<PushSendResult> {
  return sendDataToOwnerDevices(
    ownerId,
    {
      title: `🔔 ${APP_NAME} test`,
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
