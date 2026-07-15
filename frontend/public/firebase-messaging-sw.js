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

function showCallOrAlert(data) {
  const isCall = data.kind === 'call';
  const isChat = data.kind === 'chat';
  return self.registration.showNotification(data.title ?? 'QRHorn', {
    body: data.body ?? 'New vehicle contact',
    tag: isCall ? 'qrhorn-call' : isChat ? 'qrhorn-chat' : 'qrhorn-alert',
    renotify: isCall || isChat,
    requireInteraction: isCall,
    vibrate: isCall ? [400, 200, 400, 200, 400] : isChat ? [200, 100, 200] : [200],
    data: {
      url: data.url ?? '/?view=dashboard',
      roomId: data.roomId ?? null,
      sessionId: data.sessionId ?? null,
    },
    actions: isCall
      ? [
          { action: 'answer', title: '✅ Answer' },
          { action: 'decline', title: '✖️ Decline' },
        ]
      : [],
  });
}

messaging.onBackgroundMessage((payload) => {
  showCallOrAlert(payload.data ?? {});
});

self.addEventListener('notificationclick', (event) => {
  const roomId = event.notification.data?.roomId;
  const url = event.notification.data?.url ?? '/?view=dashboard';

  if (event.action === 'decline' && roomId) {
    event.notification.close();
    // Decline directly from the service worker — works even if the app
    // (and its in-memory auth token) is fully closed. See routes/calls.ts.
    event.waitUntil(
      fetch(`${self.location.origin}/api/calls/${encodeURIComponent(roomId)}/decline`, {
        method: 'POST',
      }).catch(() => {})
    );
    return;
  }

  event.notification.close();

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          client.postMessage({
            type: 'qrhorn:open-dashboard',
            roomId: event.notification.data?.roomId ?? null,
            url,
          });
          return client.focus();
        }
      }
      return self.clients.openWindow(url.startsWith('http') ? url : self.location.origin + url);
    })()
  );
});
