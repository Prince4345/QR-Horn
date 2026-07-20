import { Capacitor } from '@capacitor/core';
import { PushNotifications, type ActionPerformed, type PushNotificationSchema, type Token } from '@capacitor/push-notifications';

export const PUSH_CHANNEL_CALLS = 'parkstag_calls';
export const PUSH_CHANNEL_MESSAGES = 'parkstag_messages';
export const PUSH_CHANNEL_ALERTS = 'parkstag_alerts';

let listenersBound = false;
let channelsReady = false;

function chatSessionIdFromUrl(url?: string): string | null {
  if (!url) return null;
  try {
    const parsed = url.startsWith('http') ? new URL(url) : new URL(url, window.location.origin);
    return parsed.searchParams.get('chat');
  } catch {
    return null;
  }
}

function asDataRecord(data: unknown): Record<string, string> {
  if (!data || typeof data !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (value == null) continue;
    out[key] = String(value);
  }
  return out;
}

/** Route push payload into existing app events (same as web FCM path). */
export function handleNativePushData(raw: Record<string, string>) {
  const data = asDataRecord(raw);
  const kind = data.kind;
  const url = data.url || '/?view=dashboard';

  if (kind === 'call') {
    if (url) window.history.replaceState(null, '', url);
    window.dispatchEvent(new CustomEvent('qrhorn:incoming-call'));
    window.dispatchEvent(new CustomEvent('qrhorn:ping'));
    return;
  }

  if (kind === 'chat') {
    if (url) window.history.replaceState(null, '', url);
    window.dispatchEvent(new CustomEvent('qrhorn:incoming-chat'));
    window.dispatchEvent(
      new CustomEvent('qrhorn:open-chat', {
        detail: { sessionId: data.sessionId || chatSessionIdFromUrl(url) },
      }),
    );
    window.dispatchEvent(new CustomEvent('qrhorn:ping'));
    return;
  }

  if (url) window.history.replaceState(null, '', url);
  window.dispatchEvent(new CustomEvent('qrhorn:ping'));
}

function handleNotification(notification: PushNotificationSchema) {
  const data = asDataRecord(notification.data);
  if (!data.title && notification.title) data.title = notification.title;
  if (!data.body && notification.body) data.body = notification.body;
  handleNativePushData(data);
}

function handleAction(action: ActionPerformed) {
  const data = asDataRecord(action.notification.data);
  if (!data.title && action.notification.title) data.title = action.notification.title;
  if (!data.body && action.notification.body) data.body = action.notification.body;
  handleNativePushData(data);
}

export async function ensureNativePushChannels(): Promise<void> {
  if (!Capacitor.isNativePlatform() || channelsReady) return;
  try {
    await PushNotifications.createChannel({
      id: PUSH_CHANNEL_CALLS,
      name: 'Incoming calls',
      description: 'Phone-style alerts when someone calls about your vehicle',
      importance: 5,
      visibility: 1,
      vibration: true,
      sound: 'default',
    });
    await PushNotifications.createChannel({
      id: PUSH_CHANNEL_MESSAGES,
      name: 'Messages',
      description: 'Chat messages about your vehicle',
      importance: 4,
      visibility: 1,
      vibration: true,
      sound: 'default',
    });
    await PushNotifications.createChannel({
      id: PUSH_CHANNEL_ALERTS,
      name: 'Vehicle alerts',
      description: 'Move vehicle, lights, parking, and theft alerts',
      importance: 4,
      visibility: 1,
      vibration: true,
      sound: 'default',
    });
    channelsReady = true;
  } catch (err) {
    console.warn('[push] createChannel failed:', err);
  }
}

/** Bind receive/tap handlers once (safe to call repeatedly). */
export async function bindNativePushHandlers(): Promise<void> {
  if (!Capacitor.isNativePlatform() || listenersBound) return;
  listenersBound = true;
  await ensureNativePushChannels();

  await PushNotifications.addListener('pushNotificationReceived', (notification) => {
    handleNotification(notification);
  });

  await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    handleAction(action);
  });
}

/**
 * Request permission, register with FCM, return native device token.
 * Requires google-services.json in android/app/.
 */
export async function requestNativePushToken(): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Native push is only available in the Android app');
  }

  await bindNativePushHandlers();
  await ensureNativePushChannels();

  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') {
    throw new Error('Notifications are blocked — enable them in Android settings');
  }

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      void regHandle.then((h) => h.remove());
      void errHandle.then((h) => h.remove());
      reject(new Error('Timed out waiting for FCM token — add google-services.json and rebuild'));
    }, 20000);

    const regHandle = PushNotifications.addListener('registration', (token: Token) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      void regHandle.then((h) => h.remove());
      void errHandle.then((h) => h.remove());
      if (!token.value) {
        reject(new Error('Empty FCM token from device'));
        return;
      }
      resolve(token.value);
    });

    const errHandle = PushNotifications.addListener('registrationError', (err) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      void regHandle.then((h) => h.remove());
      void errHandle.then((h) => h.remove());
      reject(new Error(err.error || 'FCM registration failed'));
    });

    void PushNotifications.register().catch((err) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      void regHandle.then((h) => h.remove());
      void errHandle.then((h) => h.remove());
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

export async function nativePushPermissionGranted(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const status = await PushNotifications.checkPermissions();
    return status.receive === 'granted';
  } catch {
    return false;
  }
}
