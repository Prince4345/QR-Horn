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

export async function sendPushToOwner(
  ownerId: string,
  payload: { reason: string; vehicleName: string; vehicleNumber: string; theftMode: boolean; kind?: 'notify' | 'call' }
): Promise<boolean> {
  if (!initFirebase()) {
    console.warn('Firebase not configured — push notification skipped');
    return false;
  }

  const owner = await prisma.owner.findUnique({
    where: { id: ownerId },
    select: { fcmToken: true },
  });

  const tokenSet = new Set<string>();
  if (owner?.fcmToken) tokenSet.add(owner.fcmToken);

  if (tokenSet.size === 0) {
    console.warn(`No FCM tokens for owner ${ownerId}`);
    return false;
  }

  const isCall = payload.kind === 'call';
  const title = isCall
    ? `📞 Incoming call — ${payload.vehicleName}`
    : payload.theftMode
      ? '⚠ Theft Alert'
      : 'Vehicle Contact';
  const body = isCall
    ? `Someone at ${payload.vehicleNumber} wants to talk. Tap to answer.`
    : `${payload.vehicleName} (${payload.vehicleNumber}): ${REASON_TITLES[payload.reason] ?? payload.reason}`;

  let anySent = false;

  for (const token of tokenSet) {
    try {
      // Data-only message: the service worker displays it (avoids duplicate
      // notifications) and handles clicks to open the dashboard.
      await admin.messaging().send({
        token,
        data: {
          title,
          body,
          kind: payload.kind ?? 'notify',
          url: '/?view=dashboard',
        },
        webpush: {
          headers: {
            Urgency: 'high',
            // A ring is pointless after the 60s timeout; alerts can wait longer
            TTL: isCall ? '60' : '3600',
          },
        },
      });
      anySent = true;
    } catch (err) {
      console.error('FCM send failed:', err);
      if (isInvalidFcmToken(err) && owner?.fcmToken === token) {
        await prisma.owner.update({ where: { id: ownerId }, data: { fcmToken: null } }).catch(() => {});
      }
    }
  }

  return anySent;
}

export function isPushConfigured(): boolean {
  return !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
}
