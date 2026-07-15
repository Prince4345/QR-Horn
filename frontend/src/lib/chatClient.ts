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
