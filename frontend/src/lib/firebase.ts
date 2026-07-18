import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging';
import { APP_NAME } from './brand';

function chatSessionIdFromUrl(url?: string): string | null {
  if (!url) return null;
  try {
    const parsed = url.startsWith('http') ? new URL(url) : new URL(url, window.location.origin);
    return parsed.searchParams.get('chat');
  } catch {
    return null;
  }
}

export interface FirebasePublicConfig {
  apiKey: string | null;
  authDomain: string | null;
  projectId: string | null;
  messagingSenderId: string | null;
  appId: string | null;
  vapidKey: string | null;
}

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;
let onMessageBound = false;
let initPromise: Promise<Messaging | null> | null = null;

function buildSwUrl(config: FirebasePublicConfig): string {
  const params = new URLSearchParams();
  if (config.apiKey) params.set('apiKey', config.apiKey);
  if (config.authDomain) params.set('authDomain', config.authDomain);
  if (config.projectId) params.set('projectId', config.projectId);
  if (config.messagingSenderId) params.set('messagingSenderId', config.messagingSenderId);
  if (config.appId) params.set('appId', config.appId);
  return `/firebase-messaging-sw.js?${params.toString()}`;
}

export async function initFirebaseMessaging(config: FirebasePublicConfig): Promise<Messaging | null> {
  if (!config.apiKey || !config.projectId || !config.messagingSenderId || !config.appId) {
    return null;
  }

  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return null;
  }

  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (!app) {
      app = initializeApp({
        apiKey: config.apiKey!,
        authDomain: config.authDomain ?? undefined,
        projectId: config.projectId!,
        messagingSenderId: config.messagingSenderId!,
        appId: config.appId!,
      });
    }

    if (!messaging) {
      messaging = getMessaging(app);
    }

    if (!swRegistration) {
      const existing = await navigator.serviceWorker.getRegistration('/');
      if (existing?.active?.scriptURL.includes('firebase-messaging-sw')) {
        swRegistration = existing;
        // Pick up new worker code after deploys (stale SW = missed pushes)
        existing.update().catch(() => {});
      } else {
        swRegistration = await navigator.serviceWorker.register(buildSwUrl(config), { scope: '/' });
      }
      await navigator.serviceWorker.ready;
    }

    if (!onMessageBound) {
      onMessage(messaging, (payload) => {
        const data = payload.data ?? {};
        const title = data.title ?? payload.notification?.title ?? APP_NAME;
        const body = data.body ?? payload.notification?.body ?? 'New vehicle contact';
        const isCall = data.kind === 'call';
        const isChat = data.kind === 'chat';
        // "Foreground" per FCM just means the tab's JS is alive — that still
        // happens while the screen is off/another app is in front. In that
        // case the in-app ring (CallContext) is invisible, so surface a real
        // OS notification with Answer/Decline actions, same as the SW path.
        const tabHidden = document.visibilityState !== 'visible';

        if (isCall && tabHidden) {
          // TS's lib.dom NotificationOptions predates several spec fields
          // (renotify/vibrate/actions) that are well-supported and used by
          // the service worker's showNotification calls too.
          const options = {
            body,
            icon: '/app-icon-192.png',
            badge: '/app-icon-192.png',
            tag: 'qrhorn-call',
            renotify: true,
            requireInteraction: true,
            vibrate: [400, 200, 400, 200, 400],
            data: { url: data.url ?? '/?view=dashboard', roomId: data.roomId ?? null },
            actions: [
              { action: 'answer', title: '✅ Answer' },
              { action: 'decline', title: '✖️ Decline' },
            ],
          } as NotificationOptions;
          (swRegistration ? Promise.resolve(swRegistration) : navigator.serviceWorker.ready).then((reg) => {
            reg.showNotification(title, options);
          });
        } else if (!isCall && Notification.permission === 'granted') {
          // Incoming calls that ARE visible already ring in-app; only
          // non-call alerts get a plain notification while foreground.
          new Notification(title, { body, icon: '/app-icon-192.png' });
        }
        if (isCall) {
          if (data.url) {
            window.history.replaceState(null, '', data.url);
          }
          window.dispatchEvent(new CustomEvent('qrhorn:incoming-call'));
        }
        if (isChat) {
          if (data.url) {
            window.history.replaceState(null, '', data.url);
          }
          window.dispatchEvent(new CustomEvent('qrhorn:incoming-chat'));
          if (document.visibilityState === 'visible') {
            window.dispatchEvent(new CustomEvent('qrhorn:open-chat', {
              detail: { sessionId: data.sessionId ?? chatSessionIdFromUrl(data.url) },
            }));
          }
        }
        window.dispatchEvent(new CustomEvent('qrhorn:ping'));
      });
      onMessageBound = true;
    }

    return messaging;
  })();

  return initPromise;
}

export async function requestFcmToken(config: FirebasePublicConfig): Promise<string> {
  const msg = await initFirebaseMessaging(config);
  if (!msg) {
    throw new Error('Push notifications are not supported in this browser');
  }
  if (!config.vapidKey) {
    throw new Error('Push notifications are not configured on the server');
  }

  const permission = await Notification.requestPermission();
  if (permission === 'denied') {
    throw new Error('Notifications are blocked — enable them in your browser site settings');
  }
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted');
  }

  const registration = swRegistration ?? (await navigator.serviceWorker.ready);
  const token = await getToken(msg, { vapidKey: config.vapidKey, serviceWorkerRegistration: registration });

  if (!token) {
    throw new Error('Could not get push token — check Firebase web app and VAPID key');
  }

  return token;
}
