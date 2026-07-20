import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const CHANNEL_CALLS = 'parkstag_calls';
const CHANNEL_MESSAGES = 'parkstag_messages';
const CHANNEL_ALERTS = 'parkstag_alerts';

let channelsReady = false;
let tapListenerReady = false;

function channelForKind(kind?: string): string {
  if (kind === 'call') return CHANNEL_CALLS;
  if (kind === 'chat') return CHANNEL_MESSAGES;
  return CHANNEL_ALERTS;
}

async function ensureLocalChannels(): Promise<void> {
  if (!Capacitor.isNativePlatform() || channelsReady) return;
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_CALLS,
      name: 'Incoming calls',
      importance: 5,
      visibility: 1,
      vibration: true,
      sound: 'default',
    });
    await LocalNotifications.createChannel({
      id: CHANNEL_MESSAGES,
      name: 'Messages',
      importance: 5,
      visibility: 1,
      vibration: true,
      sound: 'default',
    });
    await LocalNotifications.createChannel({
      id: CHANNEL_ALERTS,
      name: 'Vehicle alerts',
      importance: 4,
      visibility: 1,
      vibration: true,
      sound: 'default',
    });
    channelsReady = true;
  } catch {
    // ignore
  }
}

/** Handle taps on local notifications (foreground heads-up). */
export async function initLocalNotificationTaps(): Promise<void> {
  if (!Capacitor.isNativePlatform() || tapListenerReady) return;
  tapListenerReady = true;
  await LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    const extra = (event.notification.extra ?? {}) as Record<string, string>;
    const kind = extra.kind;
    const url = extra.url || '/?view=dashboard';
    if (url) window.history.replaceState(null, '', url);
    if (kind === 'call') {
      window.dispatchEvent(new CustomEvent('qrhorn:incoming-call'));
    } else if (kind === 'chat') {
      window.dispatchEvent(new CustomEvent('qrhorn:incoming-chat'));
      window.dispatchEvent(
        new CustomEvent('qrhorn:open-chat', { detail: { sessionId: extra.sessionId || null } }),
      );
    }
    window.dispatchEvent(new CustomEvent('qrhorn:ping'));
  });
}

/**
 * WhatsApp-style OS notification (tray / heads-up).
 * Native: Local Notifications. Web: Notification API.
 */
export async function showOsNotification(opts: {
  title: string;
  body: string;
  kind?: 'chat' | 'call' | 'notify';
  url?: string;
  sessionId?: string;
  roomId?: string;
  /** Stable id so the same chat updates one notification instead of spamming */
  tag?: string;
}): Promise<void> {
  const kind = opts.kind ?? 'notify';
  const tag =
    opts.tag ||
    (kind === 'chat' && opts.sessionId
      ? `qrhorn-chat-${opts.sessionId}`
      : kind === 'call' && opts.roomId
        ? `qrhorn-call-${opts.roomId}`
        : `qrhorn-${kind}`);

  if (Capacitor.isNativePlatform()) {
    try {
      await ensureLocalChannels();
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display !== 'granted') return;

      // Derive numeric id from tag for replace/update behavior
      let id = Math.abs(
        Array.from(tag).reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 0),
      );
      if (id === 0) id = Date.now() % 100000;

      await LocalNotifications.schedule({
        notifications: [
          {
            id,
            title: opts.title,
            body: opts.body,
            channelId: channelForKind(kind),
            extra: {
              kind,
              url: opts.url ?? '',
              sessionId: opts.sessionId ?? '',
              roomId: opts.roomId ?? '',
              tag,
            },
          },
        ],
      });
    } catch (err) {
      console.warn('[notify] local notification failed:', err);
    }
    return;
  }

  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch {
      return;
    }
  }
  if (Notification.permission !== 'granted') return;

  try {
    const n = new Notification(opts.title, {
      body: opts.body,
      tag,
      renotify: true,
      icon: '/app-icon-192.png?v=8',
      badge: '/app-icon-192.png?v=8',
      requireInteraction: kind === 'call',
      data: { url: opts.url, sessionId: opts.sessionId, roomId: opts.roomId, kind },
    } as NotificationOptions);
    n.onclick = () => {
      window.focus();
      n.close();
      if (opts.url) {
        window.history.replaceState(null, '', opts.url);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
      if (kind === 'chat' && opts.sessionId) {
        window.dispatchEvent(
          new CustomEvent('qrhorn:open-chat', { detail: { sessionId: opts.sessionId } }),
        );
      }
      if (kind === 'call') {
        window.dispatchEvent(new CustomEvent('qrhorn:incoming-call'));
      }
    };
  } catch {
    // ignored
  }
}
