import { getSharedSocket } from './voiceCall';

export type ChatMessage = {
  id: string;
  senderRole: 'SCANNER' | 'OWNER';
  body: string;
  isQuickReply: boolean;
  createdAt: string;
  readAt: string | null;
};

export type ChatSession = {
  id: string;
  vehicleId: string;
  vehicleName: string;
  vehicleNumber: string;
  ownerName: string;
  scannerName: string | null;
  status: 'ACTIVE' | 'READ_ONLY' | 'CLOSED' | 'BLOCKED';
  callRoomId: string | null;
  canSend: boolean;
  readOnly: boolean;
  activeUntil: string;
  readOnlyUntil: string | null;
  messages: ChatMessage[];
  scannerQuickReplies: readonly string[];
  ownerQuickReplies: readonly string[];
};

export type ChatSessionSummary = {
  id: string;
  vehicleId: string;
  vehicleName: string;
  vehicleNumber: string;
  ownerName?: string;
  scannerName?: string | null;
  status: string;
  callRoomId: string | null;
  readOnly: boolean;
  updatedAt: string;
  lastMessage: {
    body: string;
    senderRole: string;
    createdAt: string;
    readAt?: string | null;
  } | null;
};

export type IncomingChat = {
  sessionId: string;
  vehicleName: string;
  vehicleNumber: string;
  preview: string;
  /** WhatsApp-style sender label (name or Anonymous · XXXX) */
  senderName?: string;
};

/** True when `next` is older than `prev` and should be ignored (stale poll). */
export function isStaleChatSession(next: ChatSession, prev: ChatSession | null): boolean {
  if (!prev || prev.id !== next.id) return false;
  if (next.messages.length < prev.messages.length) return true;
  if (next.messages.length > prev.messages.length) return false;
  const prevLast = prev.messages[prev.messages.length - 1];
  const nextLast = next.messages[next.messages.length - 1];
  if (!prevLast || !nextLast) return false;
  if (prevLast.id === nextLast.id) return false; // same tip — allow read-receipt updates
  return new Date(nextLast.createdAt).getTime() < new Date(prevLast.createdAt).getTime();
}

const SCANNER_TOKEN_KEY = (sessionId: string) => `qrhorn-chat-token:${sessionId}`;
const SCANNER_LAST_SEEN_KEY = (sessionId: string) => `qrhorn-chat-seen:${sessionId}`;
const SCANNER_PENDING_KEY = 'qrhorn-scanner-pending-chat';
/** Stable per-browser identity so each anonymous scanner gets their own thread per vehicle. */
const SCANNER_DEVICE_TOKEN_KEY = 'qrhorn-scanner-device-token';

/** Short label so owners can tell multiple Anonymous chats apart. */
export function anonymousScannerLabel(sessionId: string): string {
  const short = sessionId.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase() || 'USER';
  return `Anonymous · ${short}`;
}

export function displayScannerLabel(session: {
  id: string;
  scannerName?: string | null;
}): string {
  const name = session.scannerName?.trim();
  if (name) return name;
  return anonymousScannerLabel(session.id);
}

/** Device-level token sent on startChat / call — isolates scanners on the same QR. */
export function getOrCreateDeviceScannerToken(): string {
  try {
    let token = localStorage.getItem(SCANNER_DEVICE_TOKEN_KEY);
    if (!token || token.length < 20) {
      const a = crypto.randomUUID().replace(/-/g, '');
      const b = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      token = `${a}${b}`;
      localStorage.setItem(SCANNER_DEVICE_TOKEN_KEY, token);
    }
    return token;
  } catch {
    return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

export type PendingScannerChat = {
  sessionId: string;
  returnPath: string;
  vehicleId: string;
  vehicleName: string;
  vehicleNumber: string;
  contactMethod?: 'qr' | 'plate';
  contactId?: string;
};

export function saveScannerToken(sessionId: string, token: string) {
  try {
    localStorage.setItem(SCANNER_TOKEN_KEY(sessionId), token);
  } catch {
    // private mode
  }
}

export function loadScannerToken(sessionId: string): string | null {
  try {
    return localStorage.getItem(SCANNER_TOKEN_KEY(sessionId));
  } catch {
    return null;
  }
}

export function clearScannerToken(sessionId: string) {
  try {
    localStorage.removeItem(SCANNER_TOKEN_KEY(sessionId));
    localStorage.removeItem(SCANNER_LAST_SEEN_KEY(sessionId));
  } catch {
    // private mode
  }
}

/** Wipe local anonymous chat resume state for this browser. */
export function clearScannerChatLocal(sessionId?: string | null) {
  clearPendingScannerChat();
  if (sessionId) clearScannerToken(sessionId);
}

export function buildChatUrl(sessionId: string, basePath?: string): string {
  const path = basePath ?? window.location.pathname;
  const url = new URL(path, window.location.origin);
  url.searchParams.set('chat', sessionId);
  return url.pathname + url.search;
}

/** Scanner home deep-link — keeps chat out of owner dashboard routing. */
export function buildScannerChatHomeUrl(sessionId: string): string {
  return `/?view=scanner&chat=${encodeURIComponent(sessionId)}`;
}

export function saveScannerLastSeen(sessionId: string, messages: ChatMessage[]) {
  const last = messages[messages.length - 1];
  if (!last) return;
  try {
    localStorage.setItem(SCANNER_LAST_SEEN_KEY(sessionId), last.createdAt);
  } catch {
    // private mode
  }
}

export function loadScannerLastSeen(sessionId: string): string | null {
  try {
    return localStorage.getItem(SCANNER_LAST_SEEN_KEY(sessionId));
  } catch {
    return null;
  }
}

export function getLatestOwnerMessage(session: ChatSession): ChatMessage | null {
  for (let i = session.messages.length - 1; i >= 0; i--) {
    if (session.messages[i].senderRole === 'OWNER') return session.messages[i];
  }
  return null;
}

export function countOwnerUnread(session: ChatSession, lastSeenAt: string | null): number {
  if (!lastSeenAt) {
    return session.messages.filter((m) => m.senderRole === 'OWNER').length;
  }
  return session.messages.filter((m) => m.senderRole === 'OWNER' && m.createdAt > lastSeenAt).length;
}

export function savePendingScannerChat(pending: PendingScannerChat) {
  try {
    localStorage.setItem(SCANNER_PENDING_KEY, JSON.stringify(pending));
  } catch {
    // private mode
  }
}

export function loadPendingScannerChat(): PendingScannerChat | null {
  try {
    const raw = localStorage.getItem(SCANNER_PENDING_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingScannerChat;
  } catch {
    return null;
  }
}

export function clearPendingScannerChat() {
  try {
    localStorage.removeItem(SCANNER_PENDING_KEY);
  } catch {
    // private mode
  }
}

export async function requestScannerNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

export function notifyScannerOwnerReply(payload: {
  sessionId: string;
  vehicleName: string;
  preview: string;
  url?: string;
}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!document.hidden) return;

  const body = payload.preview.length > 120 ? `${payload.preview.slice(0, 117)}…` : payload.preview;
  const targetUrl = payload.url ?? buildScannerChatHomeUrl(payload.sessionId);

  try {
    const notification = new Notification(`${payload.vehicleName} replied`, {
      body,
      tag: `scanner-chat-${payload.sessionId}`,
      icon: '/app-icon-192.png?v=8',
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
      if (window.location.pathname + window.location.search !== targetUrl) {
        window.history.replaceState(null, '', targetUrl);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    };
  } catch {
    // ignored
  }
}

/** Owner dashboard deep-link — switches view + opens Messages tab. */
export function navigateToOwnerChat(sessionId: string) {
  const url = `/?view=dashboard&chat=${encodeURIComponent(sessionId)}`;
  window.history.replaceState(null, '', url);
  window.dispatchEvent(new CustomEvent('qrhorn:open-chat', { detail: { sessionId } }));
}

export function chatSessionIdFromLocation(): string | null {
  return new URLSearchParams(window.location.search).get('chat');
}

export function joinChatAsScanner(sessionId: string, token: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = getSharedSocket();
    socket.emit('chat:join', { sessionId, role: 'scanner', token }, (ack?: { ok?: boolean }) => {
      resolve(!!ack?.ok);
    });
  });
}

export function joinChatAsOwner(sessionId: string, ownerId: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = getSharedSocket();
    socket.emit('chat:join', { sessionId, role: 'owner', ownerId }, (ack?: { ok?: boolean }) => {
      resolve(!!ack?.ok);
    });
  });
}

export function subscribeChatMessages(
  cb: (payload: { sessionId: string; message: ChatMessage; session: ChatSession }) => void
) {
  const socket = getSharedSocket();
  const handler = (payload: { sessionId: string; message: ChatMessage; session: ChatSession }) =>
    cb(payload);
  socket.on('chat:message', handler);
  return () => socket.off('chat:message', handler);
}

export function subscribeChatSessionUpdates(cb: (session: ChatSession) => void) {
  const socket = getSharedSocket();
  const handler = (payload: { session: ChatSession }) => cb(payload.session);
  socket.on('chat:session', handler);
  return () => socket.off('chat:session', handler);
}

export function subscribeIncomingChat(cb: (chat: IncomingChat) => void) {
  const socket = getSharedSocket();
  const handler = (payload: IncomingChat) => cb(payload);
  socket.on('chat:incoming', handler);
  return () => socket.off('chat:incoming', handler);
}
