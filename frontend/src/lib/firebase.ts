import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging';

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
      } else {
        swRegistration = await navigator.serviceWorker.register(buildSwUrl(config), { scope: '/' });
      }
      await navigator.serviceWorker.ready;
    }

    if (!onMessageBound) {
      onMessage(messaging, (payload) => {
        const data = payload.data ?? {};
        const title = data.title ?? payload.notification?.title ?? 'QRHorn';
        const body = data.body ?? payload.notification?.body ?? 'New vehicle contact';
        // Incoming calls already ring in-app (CallContext); only show a
        // notification for non-call alerts while the tab is in foreground.
        if (data.kind !== 'call' && Notification.permission === 'granted') {
          new Notification(title, { body });
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
