import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  type ChatSession,
  type IncomingChat,
  chatSessionIdFromLocation,
  joinChatAsOwner,
  navigateToOwnerChat,
  subscribeChatMessages,
  subscribeChatSessionUpdates,
  subscribeIncomingChat,
} from '../lib/chatClient';
import { registerOwnerSocket } from '../lib/voiceCall';
import { useVisibleInterval } from '../lib/useVisibleInterval';
import { useAuth } from './AuthContext';
import { api } from '../lib/api';
import { playMessageSound } from '../lib/messageSound';

interface ChatContextValue {
  incomingChat: IncomingChat | null;
  openSessionId: string | null;
  sessions: Awaited<ReturnType<typeof api.getChatSessions>>;
  activeSession: ChatSession | null;
  loadingSession: boolean;
  unreadCount: number;
  openChat: (sessionId: string, options?: { navigate?: boolean }) => Promise<void>;
  replyToChat: (sessionId: string) => void;
  dismissIncoming: () => void;
  refreshSessions: () => Promise<void>;
  sendOwnerMessage: (body: string, isQuickReply?: boolean) => Promise<void>;
  blockSession: (sessionId: string) => Promise<void>;
  closeOpenChat: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

const DISMISS_TTL_MS = 120_000;
const POLL_MS = 3000;

function rememberDismissed(dismissed: Set<string>, sessionId: string) {
  dismissed.add(sessionId);
  setTimeout(() => dismissed.delete(sessionId), DISMISS_TTL_MS);
}

function shouldShowPopup(sessionId: string, dismissed: Set<string>, openId: string | null) {
  if (openId === sessionId) return false;
  return !dismissed.has(sessionId);
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { owner } = useAuth();
  const [incomingChat, setIncomingChat] = useState<IncomingChat | null>(null);
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof api.getChatSessions>>>([]);
  const openSessionIdRef = useRef<string | null>(null);
  const dismissedRef = useRef<Set<string>>(new Set());
  const lastSeenRef = useRef<Map<string, string>>(new Map());

  openSessionIdRef.current = openSessionId;

  const unreadCount = sessions.filter(
    (s) =>
      s.lastMessage?.senderRole === 'SCANNER' &&
      s.id !== openSessionId &&
      lastSeenRef.current.get(s.id) !== s.lastMessage.createdAt
  ).length;

  const refreshSessions = useCallback(async () => {
    if (!owner?.id) {
      setSessions([]);
      return;
    }
    try {
      const list = await api.getChatSessions();
      setSessions(list);
    } catch {
      setSessions([]);
    }
  }, [owner?.id]);

  const showIncoming = useCallback((chat: IncomingChat) => {
    if (!shouldShowPopup(chat.sessionId, dismissedRef.current, openSessionIdRef.current)) return;
    setIncomingChat(chat);
    playMessageSound();
  }, []);

  const loadSession = useCallback(
    async (sessionId: string) => {
      if (!owner?.id) return;
      setLoadingSession(true);
      try {
        const session = await api.getChatSession(sessionId);
        setActiveSession(session);
        const last = session.messages[session.messages.length - 1];
        if (last) lastSeenRef.current.set(sessionId, last.createdAt);
        await joinChatAsOwner(sessionId, owner.id);
      } catch {
        setActiveSession(null);
      } finally {
        setLoadingSession(false);
      }
    },
    [owner?.id]
  );

  const openChat = useCallback(
    async (sessionId: string, options?: { navigate?: boolean }) => {
      if (options?.navigate !== false) {
        navigateToOwnerChat(sessionId);
        return;
      }
      setOpenSessionId(sessionId);
      setIncomingChat(null);
      await loadSession(sessionId);
    },
    [loadSession]
  );

  const replyToChat = useCallback((sessionId: string) => {
    setIncomingChat(null);
    navigateToOwnerChat(sessionId);
  }, []);

  const closeOpenChat = useCallback(() => {
    setOpenSessionId(null);
    setActiveSession(null);
  }, []);

  const dismissIncoming = useCallback(() => {
    if (incomingChat) rememberDismissed(dismissedRef.current, incomingChat.sessionId);
    setIncomingChat(null);
  }, [incomingChat]);

  const sendOwnerMessage = useCallback(
    async (body: string, isQuickReply?: boolean) => {
      if (!openSessionId) return;
      const result = await api.sendOwnerChatMessage(openSessionId, body, isQuickReply);
      setActiveSession(result.session);
      const last = result.session.messages[result.session.messages.length - 1];
      if (last) lastSeenRef.current.set(openSessionId, last.createdAt);
    },
    [openSessionId]
  );

  const blockSession = useCallback(
    async (sessionId: string) => {
      await api.blockChatSession(sessionId);
      if (openSessionId === sessionId) {
        closeOpenChat();
      }
      await refreshSessions();
    },
    [openSessionId, closeOpenChat, refreshSessions]
  );

  // Owner socket room (chat:incoming + chat:message on owner room)
  useEffect(() => {
    if (!owner?.id) return;
    registerOwnerSocket(owner.id);
  }, [owner?.id]);

  useVisibleInterval(() => void refreshSessions(), POLL_MS, !!owner?.id);

  // Poll open conversation as socket fallback
  useVisibleInterval(
    () => {
      if (!openSessionId) return;
      void api
        .getChatSession(openSessionId)
        .then((session) => setActiveSession(session))
        .catch(() => {});
    },
    POLL_MS,
    !!owner?.id && !!openSessionId
  );

  useEffect(() => {
    if (!owner?.id) return;

    const handleScannerMessage = (
      sessionId: string,
      message: { body: string; senderRole: string; createdAt: string },
      session: ChatSession
    ) => {
      if (openSessionIdRef.current === sessionId) {
        setActiveSession(session);
        lastSeenRef.current.set(sessionId, message.createdAt);
        return;
      }
      if (message.senderRole === 'SCANNER') {
        showIncoming({
          sessionId,
          vehicleName: session.vehicleName,
          vehicleNumber: session.vehicleNumber,
          preview: message.body,
        });
      }
      void refreshSessions();
    };

    const unsubIncoming = subscribeIncomingChat((chat) => showIncoming(chat));

    const unsubMsg = subscribeChatMessages(({ sessionId, message, session }) => {
      handleScannerMessage(sessionId, message, session);
    });

    const unsubSession = subscribeChatSessionUpdates((session) => {
      if (openSessionIdRef.current === session.id) {
        setActiveSession(session);
      }
      void refreshSessions();
    });

    const onIncomingChatPush = () => {
      void refreshSessions();
      const sessionId = chatSessionIdFromLocation();
      if (!sessionId) return;
      void api
        .getChatSession(sessionId)
        .then((session) => {
          const last = session.messages[session.messages.length - 1];
          if (last?.senderRole === 'SCANNER') {
            showIncoming({
              sessionId,
              vehicleName: session.vehicleName,
              vehicleNumber: session.vehicleNumber,
              preview: last.body,
            });
          }
        })
        .catch(() => {});
    };

    const onOpenChat = (event: Event) => {
      const sessionId = (event as CustomEvent<{ sessionId: string }>).detail?.sessionId;
      if (sessionId) void openChat(sessionId, { navigate: false });
    };

    window.addEventListener('qrhorn:incoming-chat', onIncomingChatPush);
    window.addEventListener('qrhorn:open-chat', onOpenChat);
    window.addEventListener('qrhorn:ping', onIncomingChatPush);

    return () => {
      unsubIncoming();
      unsubMsg();
      unsubSession();
      window.removeEventListener('qrhorn:incoming-chat', onIncomingChatPush);
      window.removeEventListener('qrhorn:open-chat', onOpenChat);
      window.removeEventListener('qrhorn:ping', onIncomingChatPush);
    };
  }, [owner?.id, refreshSessions, showIncoming, openChat]);

  return (
    <ChatContext.Provider
      value={{
        incomingChat,
        openSessionId,
        sessions,
        activeSession,
        loadingSession,
        unreadCount,
        openChat,
        replyToChat,
        dismissIncoming,
        refreshSessions,
        sendOwnerMessage,
        blockSession,
        closeOpenChat,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}
