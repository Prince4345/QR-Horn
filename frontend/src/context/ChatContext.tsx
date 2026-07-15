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
  joinChatAsOwner,
  subscribeChatMessages,
  subscribeChatSessionUpdates,
  subscribeIncomingChat,
} from '../lib/chatClient';
import { useAuth } from './AuthContext';
import { api } from '../lib/api';
import { playMessageSound } from '../lib/messageSound';

interface ChatContextValue {
  incomingChat: IncomingChat | null;
  openSessionId: string | null;
  sessions: Awaited<ReturnType<typeof api.getChatSessions>>;
  activeSession: ChatSession | null;
  loadingSession: boolean;
  openChat: (sessionId: string) => Promise<void>;
  dismissIncoming: () => void;
  refreshSessions: () => Promise<void>;
  sendOwnerMessage: (body: string, isQuickReply?: boolean) => Promise<void>;
  blockSession: (sessionId: string) => Promise<void>;
  closeOpenChat: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const { owner } = useAuth();
  const [incomingChat, setIncomingChat] = useState<IncomingChat | null>(null);
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof api.getChatSessions>>>([]);
  const openSessionIdRef = useRef<string | null>(null);
  const dismissedRef = useRef<Set<string>>(new Set());

  openSessionIdRef.current = openSessionId;

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

  const loadSession = useCallback(
    async (sessionId: string) => {
      if (!owner?.id) return;
      setLoadingSession(true);
      try {
        const session = await api.getChatSession(sessionId);
        setActiveSession(session);
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
    async (sessionId: string) => {
      setOpenSessionId(sessionId);
      setIncomingChat(null);
      dismissedRef.current.add(sessionId);
      await loadSession(sessionId);
    },
    [loadSession]
  );

  const closeOpenChat = useCallback(() => {
    setOpenSessionId(null);
    setActiveSession(null);
  }, []);

  const dismissIncoming = useCallback(() => {
    if (incomingChat) dismissedRef.current.add(incomingChat.sessionId);
    setIncomingChat(null);
  }, [incomingChat]);

  const sendOwnerMessage = useCallback(
    async (body: string, isQuickReply?: boolean) => {
      if (!openSessionId) return;
      const result = await api.sendOwnerChatMessage(openSessionId, body, isQuickReply);
      setActiveSession(result.session);
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

  useEffect(() => {
    if (!owner?.id) return;
    void refreshSessions();
  }, [owner?.id, refreshSessions]);

  useEffect(() => {
    if (!owner?.id) return;

    const unsubIncoming = subscribeIncomingChat((chat) => {
      if (dismissedRef.current.has(chat.sessionId)) return;
      if (openSessionIdRef.current === chat.sessionId) return;
      setIncomingChat(chat);
      playMessageSound();
    });

    const unsubMsg = subscribeChatMessages(({ sessionId, message, session }) => {
      if (openSessionIdRef.current === sessionId) {
        setActiveSession(session);
      }
      if (message.senderRole === 'SCANNER' && openSessionIdRef.current !== sessionId) {
        if (!dismissedRef.current.has(sessionId)) {
          setIncomingChat({
            sessionId,
            vehicleName: session.vehicleName,
            vehicleNumber: session.vehicleNumber,
            preview: message.body,
          });
        }
        playMessageSound();
      }
      void refreshSessions();
    });

    const unsubSession = subscribeChatSessionUpdates((session) => {
      if (openSessionIdRef.current === session.id) {
        setActiveSession(session);
      }
      void refreshSessions();
    });

    const onPush = () => void refreshSessions();
    window.addEventListener('qrhorn:incoming-chat', onPush);
    window.addEventListener('qrhorn:ping', onPush);

    return () => {
      unsubIncoming();
      unsubMsg();
      unsubSession();
      window.removeEventListener('qrhorn:incoming-chat', onPush);
      window.removeEventListener('qrhorn:ping', onPush);
    };
  }, [owner?.id, refreshSessions]);

  return (
    <ChatContext.Provider
      value={{
        incomingChat,
        openSessionId,
        sessions,
        activeSession,
        loadingSession,
        openChat,
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
