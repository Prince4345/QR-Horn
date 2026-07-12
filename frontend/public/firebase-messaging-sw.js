/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/11.4.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.4.0/firebase-messaging-compat.js');

const params = new URL(self.location.href).searchParams;

firebase.initializeApp({
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
});

// Take over from any older worker version immediately
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const data = payload.data ?? {};
  const title = data.title ?? payload.notification?.title ?? 'QRHorn';
  const body = data.body ?? payload.notification?.body ?? 'New vehicle contact';
  const isCall = data.kind === 'call';

  self.registration.showNotification(title, {
    body,
    tag: isCall ? 'qrhorn-call' : 'qrhorn-alert',
    renotify: isCall,
    requireInteraction: isCall,
    vibrate: isCall ? [400, 200, 400, 200, 400] : [200],
    data: { url: data.url ?? '/?view=dashboard' },
    actions: isCall ? [{ action: 'answer', title: 'Answer' }] : [],
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/?view=dashboard';

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          client.postMessage({ type: 'qrhorn:open-dashboard' });
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })()
  );
});
