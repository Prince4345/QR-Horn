import { getSharedSocket } from './voiceCall';

export type ChatMessage = {
  id: string;
  senderRole: 'SCANNER' | 'OWNER';
  body: string;
  isQuickReply: boolean;
  createdAt: string;
};

export type ChatSession = {
  id: string;
  vehicleId: string;
  vehicleName: string;
  vehicleNumber: string;
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
  status: string;
  callRoomId: string | null;
  readOnly: boolean;
  updatedAt: string;
  lastMessage: { body: string; senderRole: string; createdAt: string } | null;
};

export type IncomingChat = {
  sessionId: string;
  vehicleName: string;
  vehicleNumber: string;
  preview: string;
};

const SCANNER_TOKEN_KEY = (sessionId: string) => `qrhorn-chat-token:${sessionId}`;
const SCANNER_LAST_SEEN_KEY = (sessionId: string) => `qrhorn-chat-seen:${sessionId}`;
const SCANNER_PENDING_KEY = 'qrhorn-scanner-pending-chat';

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
      icon: '/favicon.ico',
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
