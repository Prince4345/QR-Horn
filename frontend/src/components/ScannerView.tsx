import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Car,
  Phone,
  AlertTriangle,
  Lightbulb,
  ParkingCircle,
  HelpCircle,
  CheckCircle2,
  MessageSquare,
  Loader2,
  QrCode,
  Search,
  XCircle,
  Camera,
  ArrowLeft,
  Mic,
  MicOff,
} from 'lucide-react';
import { api, type ContactReason, type ContactMethod, type ScanData } from '../lib/api';
import { VoiceCallSession, type CallPhase, advanceCallPhase, preflightMicPermission } from '../lib/voiceCall';
import QrCameraScanner from './QrCameraScanner';
import CallTimer from './CallTimer';
import ChatPanel from './ChatPanel';
import {
  type ChatSession,
  buildChatUrl,
  buildScannerChatHomeUrl,
  chatSessionIdFromLocation,
  countOwnerUnread,
  getLatestOwnerMessage,
  isStaleChatSession,
  joinChatAsScanner,
  clearScannerChatLocal,
  getOrCreateDeviceScannerToken,
  loadPendingScannerChat,
  loadScannerLastSeen,
  loadScannerToken,
  requestScannerNotificationPermission,
  savePendingScannerChat,
  saveScannerLastSeen,
  saveScannerToken,
  subscribeChatMessages,
  subscribeChatSessionUpdates,
} from '../lib/chatClient';
import { playMessageSound } from '../lib/messageSound';
import { APP_NAME } from '../lib/brand';
import BrandLogo from './BrandLogo';
import ScannerLandingPage from './ScannerLandingPage';
import PlateLookupLoading from './PlateLookupLoading';
import ScannerSafetyPanel from './ScannerSafetyPanel';

const PLATE_REVEAL_CONTAINER = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.11, delayChildren: 0.06 },
  },
} as const;

const PLATE_REVEAL_ITEM = {
  hidden: { opacity: 0, y: 14, filter: 'blur(6px)' },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
  },
} as const;

const REASONS: { id: ContactReason; label: string; icon: typeof Car; color: string; bg: string }[] = [
  { id: 'move', label: 'Move Vehicle', icon: Car, color: 'text-brand', bg: 'bg-brand/10' },
  { id: 'lights', label: 'Lights are ON', icon: Lightbulb, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  { id: 'parking', label: 'Wrong Parking', icon: ParkingCircle, color: 'text-orange-400', bg: 'bg-orange-500/10' },
  { id: 'emergency', label: 'Emergency', icon: AlertTriangle, color: 'text-brand', bg: 'bg-brand/10' },
  { id: 'other', label: 'Other', icon: HelpCircle, color: 'text-muted', bg: 'bg-soft' },
];

interface ScannerViewProps {
  scanCode?: string;
  onOpenJoin?: () => void;
}

export default function ScannerView({ scanCode, onOpenJoin }: ScannerViewProps) {
  const [scanData, setScanData] = useState<ScanData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedReason, setSelectedReason] = useState<ContactReason | null>(null);
  const [status, setStatus] = useState<'idle' | 'calling' | 'notifying' | 'success'>('idle');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [contactMethod, setContactMethod] = useState<ContactMethod | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [plateInput, setPlateInput] = useState('');
  const [entryTab, setEntryTab] = useState<'qr' | 'plate'>('qr');
  const [showCamera, setShowCamera] = useState(false);
  const [callPhase, setCallPhase] = useState<CallPhase>('idle');
  const [muted, setMuted] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatSession, setChatSession] = useState<ChatSession | null>(null);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [scannerToken, setScannerToken] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [activeCallRoomId, setActiveCallRoomId] = useState<string | null>(null);
  const [ownerReplyBanner, setOwnerReplyBanner] = useState<{ preview: string; count: number } | null>(null);
  const [landingChatRestore, setLandingChatRestore] = useState<ChatSession | null>(null);
  const [landingChatLoading, setLandingChatLoading] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const callSessionRef = useRef<VoiceCallSession | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const chatOpenRef = useRef(false);
  const chatSessionIdRef = useRef<string | null>(null);
  const lastSeenRef = useRef<string | null>(null);

  chatOpenRef.current = chatOpen;
  chatSessionIdRef.current = chatSessionId;

  const markChatSeen = useCallback((session: ChatSession) => {
    saveScannerLastSeen(session.id, session.messages);
    const seen = loadScannerLastSeen(session.id);
    lastSeenRef.current = seen;
    setLastSeenAt(seen);
    if (countOwnerUnread(session, seen) === 0) {
      setOwnerReplyBanner(null);
    }
  }, []);

  const openChatPanel = useCallback(() => {
    if (chatSession) markChatSeen(chatSession);
    setChatOpen(true);
    setOwnerReplyBanner(null);
  }, [chatSession, markChatSeen]);

  const closeChatPanel = useCallback(() => {
    setChatOpen(false);
    if (chatSessionId) {
      window.history.replaceState(null, '', buildChatUrl(chatSessionId));
    }
  }, [chatSessionId]);

  const handleIncomingSession = useCallback((session: ChatSession, fromOwnerMessage?: boolean) => {
    if (session.id !== chatSessionIdRef.current) return;
    setChatSession((prev) => (isStaleChatSession(session, prev) ? prev : session));

    const unread = countOwnerUnread(session, lastSeenRef.current);
    if (unread <= 0 || chatOpenRef.current) return;

    const latest = getLatestOwnerMessage(session);
    if (!latest) return;

    setOwnerReplyBanner({ preview: latest.body, count: unread });

    // WhatsApp-style notify when chat drawer is closed (background or other screen)
    if (!chatOpenRef.current) {
      void import('../lib/alertNotify').then(({ showOsNotification }) =>
        showOsNotification({
          title: `${session.vehicleName} replied`,
          body: latest.body,
          kind: 'chat',
          sessionId: session.id,
          url: buildChatUrl(session.id),
        }),
      );
      if (fromOwnerMessage && !document.hidden) playMessageSound();
    } else if (fromOwnerMessage) {
      playMessageSound();
    }
  }, []);

  const toggleMute = () => {
    const session = callSessionRef.current;
    if (!session) return;
    const next = !session.isMuted();
    session.setMuted(next);
    setMuted(next);
  };

  const resetVehicleContact = () => {
    setScanData(null);
    setError(null);
    setStatus('idle');
    setSuccessMessage(null);
    setSelectedReason(null);
    setContactMethod(null);
    setContactId(null);
    callSessionRef.current?.end();
    callSessionRef.current = null;
    setCallPhase('idle');
    setChatOpen(false);
    setActiveCallRoomId(null);
  };

  const resetContact = () => {
    resetVehicleContact();
    setChatSession(null);
    setChatSessionId(null);
    setScannerToken(null);
    setOwnerReplyBanner(null);
    setLandingChatRestore(null);
    lastSeenRef.current = null;
  };

  /** Anonymous scanner: end chat, clear resume sticky state + URL. */
  const endScannerChat = useCallback(async () => {
    const sessionId = chatSessionIdRef.current ?? chatSessionId;
    const token = scannerToken ?? (sessionId ? loadScannerToken(sessionId) : null);
    if (sessionId && token) {
      try {
        await api.leaveScannerChat(sessionId, token);
      } catch {
        // still clear local so the user isn't stuck
      }
    }
    clearScannerChatLocal(sessionId);
    setChatOpen(false);
    setChatSession(null);
    setChatSessionId(null);
    setScannerToken(null);
    setOwnerReplyBanner(null);
    setLandingChatRestore(null);
    lastSeenRef.current = null;
    setLastSeenAt(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('chat');
    window.history.replaceState(null, '', url.pathname + url.search || '/');
  }, [chatSessionId, scannerToken]);

  const attachChatSession = (
    sessionId: string,
    token: string,
    session: ChatSession,
    opts?: { open?: boolean; contactMethod?: ContactMethod; contactId?: string }
  ) => {
    saveScannerToken(sessionId, token);
    savePendingScannerChat({
      sessionId,
      returnPath: window.location.pathname + window.location.search,
      vehicleId: session.vehicleId,
      vehicleName: session.vehicleName,
      vehicleNumber: session.vehicleNumber,
      contactMethod: opts?.contactMethod ?? contactMethod ?? undefined,
      contactId: opts?.contactId ?? contactId ?? undefined,
    });
    setChatSessionId(sessionId);
    setScannerToken(token);
    setChatSession(session);
    lastSeenRef.current = loadScannerLastSeen(sessionId);
    setLastSeenAt(lastSeenRef.current);
    const shouldOpen = opts?.open !== false;
    setChatOpen(shouldOpen);
    if (shouldOpen) markChatSeen(session);
    else {
      const unread = countOwnerUnread(session, lastSeenRef.current);
      if (unread > 0) {
        const latest = getLatestOwnerMessage(session);
        setOwnerReplyBanner({
          preview: latest?.body ?? 'New message from owner',
          count: unread,
        });
      }
    }
    window.history.replaceState(null, '', buildChatUrl(sessionId));
    void joinChatAsScanner(sessionId, token);
    void requestScannerNotificationPermission();
  };

  const restoreChatFromUrl = async (vehicleId: string) => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('chat');
    if (!sessionId) return;
    if (chatSessionIdRef.current === sessionId) return;
    const token = loadScannerToken(sessionId);
    if (!token) return;
    setChatLoading(true);
    try {
      const session = await api.getScannerChat(sessionId, token);
      if (session.vehicleId !== vehicleId) return;
      attachChatSession(sessionId, token, session, { open: false });
    } catch {
      // expired or invalid
    } finally {
      setChatLoading(false);
    }
  };

  const resumeLandingChat = async () => {
    const session = landingChatRestore ?? chatSession;
    if (!session || !chatSessionId || !scannerToken) return;
    setLandingChatLoading(true);
    try {
      const pending = loadPendingScannerChat();
      if (pending?.contactMethod === 'qr' && pending.contactId) {
        window.history.replaceState(null, '', buildChatUrl(chatSessionId, `/scan/${encodeURIComponent(pending.contactId)}`));
        await loadByQr(pending.contactId);
      } else if (pending?.contactMethod === 'plate' && pending.contactId) {
        setPlateInput(pending.contactId);
        await loadByPlate(pending.contactId);
      } else {
        window.history.replaceState(null, '', buildChatUrl(chatSessionId));
      }
      openChatPanel();
      setLandingChatRestore(null);
    } finally {
      setLandingChatLoading(false);
    }
  };

  const startChat = async (opts?: { reason?: ContactReason; callRoomId?: string }) => {
    if (!scanData) return;
    setChatLoading(true);
    setError(null);
    try {
      // Always use this browser's device token so each anonymous scanner is isolated
      const deviceToken =
        (chatSessionId ? loadScannerToken(chatSessionId) : null) ||
        scannerToken ||
        getOrCreateDeviceScannerToken();
      const result = await api.startChat(scanData.vehicleId, {
        reason: opts?.reason ?? selectedReason ?? undefined,
        callRoomId: opts?.callRoomId ?? activeCallRoomId ?? undefined,
        scannerToken: deviceToken,
      });
      attachChatSession(result.sessionId, result.scannerToken, result.session, {
        contactMethod: contactMethod ?? undefined,
        contactId: contactId ?? undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start chat');
    } finally {
      setChatLoading(false);
    }
  };

  const sendScannerMessage = async (body: string, isQuickReply?: boolean) => {
    if (!chatSessionId || !scannerToken) throw new Error('Chat not ready');
    const result = await api.sendScannerChatMessage(chatSessionId, scannerToken, body, isQuickReply);
    setChatSession(result.session);
    markChatSeen(result.session);
  };

  const loadByQr = async (code: string) => {
    setLoading(true);
    setError(null);
    setScanData(null);
    setStatus('idle');
    setSelectedReason(null);
    setContactMethod('qr');
    setContactId(code);

    try {
      const data = await api.getScanData(code);
      setScanData(data);
      // Theft mode → default to Emergency so ICE / medical info is revealed
      setSelectedReason(data.theftMode ? 'emergency' : null);
    } catch (err) {
      setScanData(null);
      setError(err instanceof Error ? err.message : 'This QR sticker is invalid or no longer active');
    } finally {
      setLoading(false);
    }
  };

  const loadByPlate = async (plate: string) => {
    if (!plate.trim()) return;
    setLoading(true);
    setError(null);
    setScanData(null);
    setStatus('idle');
    setSelectedReason(null);
    setContactMethod('plate');
    setContactId(plate.trim());

    try {
      const data = await api.lookupByVehicleNumber(plate.trim());
      setScanData(data);
      setSelectedReason(data.theftMode ? 'emergency' : null);
    } catch (err) {
      setScanData(null);
      setError(
        err instanceof Error
          ? err.message
          : `This vehicle is not registered with ${APP_NAME}`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCameraScan = (code: string) => {
    setShowCamera(false);
    window.history.pushState(null, '', `/scan/${encodeURIComponent(code)}`);
    loadByQr(code);
  };

  useEffect(() => {
    if (scanCode) {
      loadByQr(scanCode);
    } else if (!contactId) {
      resetContact();
    }
  }, [scanCode]);

  useEffect(() => {
    if (scanData?.vehicleId) {
      void restoreChatFromUrl(scanData.vehicleId);
    }
  }, [scanData?.vehicleId]);

  useEffect(() => {
    if (scanData || scanCode || loading) return;
    const sessionId = chatSessionIdFromLocation();
    if (!sessionId) {
      setLandingChatRestore(null);
      return;
    }
    const token = loadScannerToken(sessionId);
    if (!token) return;

    let cancelled = false;
    setLandingChatLoading(true);
    void api
      .getScannerChat(sessionId, token)
      .then((session) => {
        if (cancelled) return;
        // Dead sessions should not keep offering “resume”
        if (session.status === 'CLOSED' || session.status === 'BLOCKED' || session.readOnly) {
          clearScannerChatLocal(sessionId);
          setChatSession(null);
          setChatSessionId(null);
          setScannerToken(null);
          setLandingChatRestore(null);
          setOwnerReplyBanner(null);
          const url = new URL(window.location.href);
          url.searchParams.delete('chat');
          window.history.replaceState(null, '', url.pathname + url.search || '/');
          return;
        }
        setChatSessionId(sessionId);
        setScannerToken(token);
        setChatSession(session);
        setLandingChatRestore(session);
        lastSeenRef.current = loadScannerLastSeen(sessionId);
        setLastSeenAt(lastSeenRef.current);
        void joinChatAsScanner(sessionId, token);
        const unread = countOwnerUnread(session, lastSeenRef.current);
        if (unread > 0) {
          const latest = getLatestOwnerMessage(session);
          setOwnerReplyBanner({
            preview: latest?.body ?? 'New message from owner',
            count: unread,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          clearScannerChatLocal(sessionId);
          setLandingChatRestore(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLandingChatLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [scanData, scanCode, loading]);

  useEffect(() => {
    if (!chatSessionId || !scannerToken) return;
    let lastMsgId: string | null = null;
    const unsubMsg = subscribeChatMessages(({ sessionId, message, session }) => {
      if (sessionId !== chatSessionId) return;
      if (lastMsgId === message.id) return;
      lastMsgId = message.id;
      handleIncomingSession(session, message.senderRole === 'OWNER');
    });
    const unsubSession = subscribeChatSessionUpdates((session) => {
      if (session.id !== chatSessionId) return;
      handleIncomingSession(session);
    });
    const poll = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void api
        .getScannerChat(chatSessionId, scannerToken, { markRead: false })
        .then((session) => handleIncomingSession(session))
        .catch(() => {});
    }, 3000);
    return () => {
      unsubMsg();
      unsubSession();
      clearInterval(poll);
    };
  }, [chatSessionId, scannerToken, handleIncomingSession]);

  const handleNotify = async () => {
    if (!selectedReason || !contactMethod || !contactId) return;
    setStatus('notifying');
    try {
      const result = await api.sendNotification(contactMethod, contactId, selectedReason);
      setSuccessMessage(
        result.smsDelivered
          ? 'The owner was texted on their phone.'
          : result.pushDelivered
            ? 'The owner received a push alert on their device.'
            : 'Request saved. The owner has no phone alerts set up yet.'
      );
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Notification failed');
      setStatus('idle');
    }
  };

  const handleCall = async () => {
    if (!contactMethod || !contactId) return;

    setStatus('calling');
    setError(null);
    setCallPhase('ringing');
    setMuted(false);

    try {
      await preflightMicPermission();
      const deviceToken =
        (chatSessionId ? loadScannerToken(chatSessionId) : null) ||
        scannerToken ||
        getOrCreateDeviceScannerToken();
      const result = await api.initiateCall(contactMethod, contactId, { scannerToken: deviceToken });
      setActiveCallRoomId(result.roomId);
      if (result.chatSessionId && result.scannerToken) {
        const chat = await api.getScannerChat(result.chatSessionId, result.scannerToken);
        attachChatSession(result.chatSessionId, result.scannerToken, chat, {
          contactMethod: contactMethod ?? undefined,
          contactId: contactId ?? undefined,
        });
      }
      const session = await VoiceCallSession.beginOutgoing(result.roomId, {
        onPhase: (phase) => {
          setCallPhase((current) => advanceCallPhase(current, phase));
          if (phase === 'failed') {
            setError('Could not connect the call. This usually means the network needs a TURN relay — try again, or use the same Wi‑Fi to test.');
            callSessionRef.current = null;
            setStatus('idle');
            setCallPhase('idle');
          }
          if (phase === 'declined' || phase === 'ended') {
            setSuccessMessage(phase === 'declined' ? 'Owner declined the call.' : 'Call ended.');
            callSessionRef.current = null;
            setStatus('success');
          }
        },
        onRemote: (stream) => {
          const el = remoteAudioRef.current;
          if (!el) return;
          el.srcObject = stream;
          el.muted = false;
          el.volume = 1;
          void el.play().catch(() => {});
          setCallPhase('active');
        },
      });
      callSessionRef.current = session;

      await session.waitUntilAccepted();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Call failed';
      setError(message);
      callSessionRef.current?.end();
      callSessionRef.current = null;
      setStatus('idle');
      setCallPhase('idle');
    }
  };

  const handleEndCall = () => {
    callSessionRef.current?.end();
    callSessionRef.current = null;
    setCallPhase('idle');
    setStatus('idle');
    setMuted(false);
  };

  const handleBack = () => {
    if (chatSession && chatSessionId) {
      savePendingScannerChat({
        sessionId: chatSessionId,
        returnPath: window.location.pathname + window.location.search,
        vehicleId: chatSession.vehicleId,
        vehicleName: chatSession.vehicleName,
        vehicleNumber: chatSession.vehicleNumber,
        contactMethod: contactMethod ?? undefined,
        contactId: contactId ?? undefined,
      });
      window.history.replaceState(null, '', buildScannerChatHomeUrl(chatSessionId));
    } else if (scanCode) {
      window.history.replaceState(null, '', '/');
    }
    resetVehicleContact();
    setPlateInput('');
  };

  const scannerUnreadCount =
    chatSession && !chatOpen ? countOwnerUnread(chatSession, lastSeenAt) : 0;
  const landingUnreadCount =
    landingChatRestore && !scanData
      ? countOwnerUnread(landingChatRestore, lastSeenAt ?? loadScannerLastSeen(landingChatRestore.id))
      : 0;

  // Landing — full-page hero + bottom action dock
  if (!scanData && !loading && !scanCode) {
    return (
      <ScannerLandingPage
        entryTab={entryTab}
        setEntryTab={setEntryTab}
        setError={setError}
        plateInput={plateInput}
        setPlateInput={setPlateInput}
        loadByPlate={loadByPlate}
        error={error}
        showCamera={showCamera}
        setShowCamera={setShowCamera}
        handleCameraScan={handleCameraScan}
        landingChatRestore={landingChatRestore}
        landingChatLoading={landingChatLoading}
        landingUnreadCount={landingUnreadCount}
        ownerReplyBanner={ownerReplyBanner}
        resumeLandingChat={resumeLandingChat}
        endLandingChat={() => void endScannerChat()}
        onOpenJoin={onOpenJoin}
      />
    );
  }

  if (loading) {
    if (contactMethod === 'plate' && contactId) {
      return <PlateLookupLoading plate={contactId} />;
    }

    return (
      <div className="flex flex-col items-center md:items-stretch w-full px-4 md:px-8 lg:px-12 pt-4 md:pt-8 pb-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md md:max-w-none bg-surface border border-line rounded-2xl md:rounded-3xl p-8 md:p-16 flex flex-col items-center min-h-[40vh] md:min-h-[calc(100dvh-8rem)] justify-center"
      >
        <Loader2 className="w-8 h-8 animate-spin text-brand mb-4" />
        <p className="text-muted text-sm">Loading vehicle...</p>
      </motion.div>
      </div>
    );
  }

  if (error || !scanData) {
    return (
      <div className="flex flex-col items-center md:items-stretch w-full px-4 md:px-8 lg:px-12 pt-4 md:pt-8 pb-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md md:max-w-none bg-surface border border-line rounded-2xl md:rounded-3xl p-6 md:p-16 text-center min-h-[40vh] md:min-h-[calc(100dvh-8rem)] flex flex-col items-center justify-center"
      >
        <div className="w-16 h-16 bg-brand/5 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-8 h-8 text-brand" />
        </div>
        <h2 className="text-xl md:text-3xl font-semibold mb-2">Not Registered</h2>
        <p className="text-muted text-sm md:text-base mb-6 max-w-lg">{error ?? `This vehicle is not registered with ${APP_NAME}.`}</p>
        <button onClick={handleBack} className="px-6 py-2 rounded-full bg-soft hover:bg-soft text-ink text-sm">
          Try Again
        </button>
      </motion.div>
      </div>
    );
  }

  const isChatFullscreen = chatOpen && chatSession && status === 'idle';
  const isIdleScan = status === 'idle' && !isChatFullscreen;

  return (
    <div
      className={`flex flex-col w-full ${
        isIdleScan || status === 'calling' || isChatFullscreen
          ? 'px-4 pt-4 pb-4 md:px-0 md:pt-0 md:pb-0'
          : 'px-4 md:px-8 lg:px-12 pt-4 md:pt-8'
      }`}
    >
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className={`w-full relative bg-surface overflow-hidden flex flex-col ${
        status === 'calling'
          ? 'max-w-md mx-auto md:max-w-none border border-line md:border-x-0 md:border-t-0 rounded-2xl sm:rounded-[40px] md:rounded-none shadow-2xl md:shadow-none min-h-[calc(100dvh-5.5rem)] md:min-h-[calc(100dvh-4.5rem)]'
          : isChatFullscreen
            ? 'max-w-md mx-auto md:max-w-none border border-line md:border-x-0 md:border-t-0 rounded-2xl md:rounded-none shadow-2xl md:shadow-none h-[calc(100dvh-5.5rem)] md:h-[calc(100dvh-4.5rem)]'
            : 'max-w-md mx-auto md:max-w-none border border-line md:border-x-0 md:border-t-0 rounded-2xl sm:rounded-[40px] md:rounded-none shadow-2xl md:shadow-none min-h-[calc(100dvh-5.5rem)] md:min-h-[calc(100dvh-4.5rem)]'
      }`}
    >
      <div
        className={`flex flex-col h-full relative z-10 min-h-0 mx-auto w-full ${
          status === 'calling' || isChatFullscreen
            ? 'p-4 sm:p-6 md:px-10 lg:px-16 md:py-8 flex-1 max-w-5xl'
            : 'p-5 sm:p-8 md:px-10 lg:px-16 md:py-10 lg:py-12 flex-1 max-w-6xl'
        }`}
      >
        {!scanCode && status !== 'calling' && !isChatFullscreen && (
          <button onClick={handleBack} className="text-sm text-muted hover:text-ink transition-colors mb-4 self-start">
            &larr; Back
          </button>
        )}

        {status === 'calling' ? (
          <div className="text-center pb-4 mb-2 border-b border-line">
            <p className="text-faint text-[10px] tracking-widest uppercase mb-0.5">Calling</p>
            <p className="text-lg font-semibold leading-tight">{scanData.vehicleName}</p>
            <span className="inline-block mt-1 px-2.5 py-0.5 rounded-md bg-soft font-mono text-xs tracking-wider text-muted">
              {scanData.vehicleNumber}
            </span>
          </div>
        ) : !isChatFullscreen ? (
        contactMethod === 'plate' ? (
        <motion.div
          className="text-center md:text-left mb-8 md:mb-10"
          variants={PLATE_REVEAL_CONTAINER}
          initial="hidden"
          animate="show"
        >
          <motion.div variants={PLATE_REVEAL_ITEM} className="w-12 h-1 bg-soft rounded-full mx-auto md:mx-0 mb-4" />
          <motion.p variants={PLATE_REVEAL_ITEM} className="text-faint text-xs tracking-widest uppercase mb-1">
            Vehicle Found
          </motion.p>
          <motion.h1 variants={PLATE_REVEAL_ITEM} className="text-2xl md:text-4xl lg:text-5xl font-semibold mb-2">
            {scanData.vehicleName}
          </motion.h1>
          <motion.span
            variants={PLATE_REVEAL_ITEM}
            className="inline-block px-3 py-1 rounded-md bg-soft font-mono text-sm md:text-base tracking-widest text-muted mb-3"
          >
            {scanData.vehicleNumber}
          </motion.span>
          <motion.p variants={PLATE_REVEAL_ITEM} className="text-muted text-sm md:text-base mb-4">
            Contacting vehicle owner anonymously
          </motion.p>
          <motion.div
            variants={PLATE_REVEAL_ITEM}
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${
              scanData.theftMode ? 'bg-red-500/15' : 'bg-green-500/10'
            }`}
          >
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                scanData.theftMode ? 'bg-red-500 animate-pulse' : 'bg-green-500'
              }`}
            />
            <span
              className={`text-[10px] md:text-xs font-bold uppercase tracking-wider ${
                scanData.theftMode ? 'text-red-400' : 'text-green-500'
              }`}
            >
              {scanData.theftMode
                ? 'Theft alert active'
                : 'Registered · Privacy Mask Active'}
            </span>
          </motion.div>
        </motion.div>
        ) : (
        <div className="text-center md:text-left mb-8 md:mb-10">
          <div className="w-12 h-1 bg-soft rounded-full mx-auto md:mx-0 mb-4" />
          <p className="text-faint text-xs tracking-widest uppercase mb-1">Scanned Vehicle</p>
          <h1 className="text-2xl md:text-4xl lg:text-5xl font-semibold mb-2">{scanData.vehicleName}</h1>
          <span className="inline-block px-3 py-1 rounded-md bg-soft font-mono text-sm md:text-base tracking-widest text-muted mb-3">
            {scanData.vehicleNumber}
          </span>
          <p className="text-muted text-sm md:text-base mb-4">Contacting vehicle owner anonymously</p>
          <div
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${
              scanData.theftMode ? 'bg-red-500/15' : 'bg-green-500/10'
            }`}
          >
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                scanData.theftMode ? 'bg-red-500 animate-pulse' : 'bg-green-500'
              }`}
            />
            <span
              className={`text-[10px] md:text-xs font-bold uppercase tracking-wider ${
                scanData.theftMode ? 'text-red-400' : 'text-green-500'
              }`}
            >
              {scanData.theftMode
                ? 'Theft alert active'
                : 'Registered · Privacy Mask Active'}
            </span>
          </div>
        </div>
        )
        ) : (
          <div className="flex items-center gap-3 pb-3 mb-2 border-b border-line shrink-0">
            <button
              type="button"
              onClick={closeChatPanel}
              className="p-2 -ml-1 rounded-full hover:bg-soft text-muted"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0 flex-1 text-left">
              <p className="font-semibold text-sm truncate">{scanData.vehicleName}</p>
              <p className="text-[10px] font-mono text-muted truncate">{scanData.vehicleNumber}</p>
            </div>
          </div>
        )}

        <div className={`${status === 'calling' || isChatFullscreen ? 'flex-1 flex flex-col min-h-0' : ''}`}>
          <AnimatePresence mode="wait">
            {status === 'idle' && (
              <motion.div
                key="idle"
                initial={{ opacity: 0, y: contactMethod === 'plate' ? 10 : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: contactMethod === 'plate' ? 0.5 : 0, duration: 0.35 }}
                className="flex flex-col gap-6"
              >
                {chatOpen && chatSession ? (
                  <div className="flex flex-col flex-1 min-h-0">
                    <div className="flex-1 min-h-0 rounded-2xl bg-surface border border-line p-2 md:p-4">
                      <ChatPanel
                        session={chatSession}
                        role="scanner"
                        onSend={sendScannerMessage}
                        onEndChat={endScannerChat}
                        desktop
                      />
                    </div>
                    <button
                      type="button"
                      onClick={closeChatPanel}
                      className="mt-3 text-xs text-muted hover:text-muted shrink-0 md:hidden"
                    >
                      Back to notify / call options
                    </button>
                  </div>
                ) : (
                <>
                {scanData.theftMode && (
                  <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-left space-y-2">
                    <p className="text-sm font-bold text-red-300 uppercase tracking-wide">
                      This vehicle may be stolen
                    </p>
                    <p className="text-xs text-muted leading-relaxed">
                      The owner turned on theft mode. Please contact them urgently via notify,
                      chat, or call — and use the emergency info below if available.
                    </p>
                  </div>
                )}

                {scanData.safety &&
                  (scanData.theftMode || selectedReason === 'emergency') && (
                    <ScannerSafetyPanel
                      safety={scanData.safety}
                      theftMode={scanData.theftMode}
                      revealPhone={
                        scanData.theftMode || selectedReason === 'emergency'
                      }
                    />
                  )}

                {ownerReplyBanner && scannerUnreadCount > 0 && (
                  <div className="space-y-2">
                  <button
                    type="button"
                    onClick={openChatPanel}
                    className="w-full p-4 rounded-2xl bg-brand/10 border border-brand/30 text-left transition-colors hover:bg-brand/15"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-brand/15 flex items-center justify-center shrink-0">
                        <MessageSquare className="w-5 h-5 text-brand" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm text-brand">Owner replied</p>
                        <p className="text-sm text-ink mt-0.5 line-clamp-2">“{ownerReplyBanner.preview}”</p>
                        <p className="text-xs text-muted mt-1">Tap to open chat</p>
                      </div>
                      <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-500 text-[11px] font-bold flex items-center justify-center shrink-0">
                        {scannerUnreadCount > 9 ? '9+' : scannerUnreadCount}
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => void endScannerChat()}
                    className="w-full text-xs text-muted hover:text-brand py-1"
                  >
                    End chat
                  </button>
                  </div>
                )}

                {chatSession && !ownerReplyBanner && (
                  <div className="space-y-2">
                  <button
                    type="button"
                    onClick={openChatPanel}
                    className="w-full p-3 rounded-2xl bg-brand/5 border border-brand/20 text-brand font-medium text-sm flex items-center justify-center gap-2"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Resume chat with owner
                  </button>
                  <button
                    type="button"
                    onClick={() => void endScannerChat()}
                    className="w-full text-xs text-muted hover:text-brand py-1"
                  >
                    End chat
                  </button>
                  </div>
                )}

                <div className="md:grid md:grid-cols-12 md:gap-10 lg:gap-14 md:items-start">
                <div className="md:col-span-7 space-y-4 mb-8 md:mb-0">
                  <p className="text-muted text-sm md:text-base text-center md:text-left mb-4 md:mb-6">
                    Select a reason to contact the owner anonymously.
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-3">
                    {REASONS.map((reason) => {
                      const Icon = reason.icon;
                      const isSelected = selectedReason === reason.id;
                      return (
                        <button
                          key={reason.id}
                          onClick={() => setSelectedReason(reason.id)}
                          className={`p-4 md:p-5 rounded-2xl flex flex-col items-center gap-2 transition-all ${
                            isSelected
                              ? 'bg-soft border border-brand/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]'
                              : 'bg-surface border border-line hover:bg-soft'
                          }`}
                        >
                          <Icon className={`w-8 h-8 md:w-9 md:h-9 ${reason.color} mb-1`} />
                          <span className="text-[10px] md:text-xs uppercase font-bold text-muted">{reason.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-auto md:mt-0 md:col-span-5 flex flex-col gap-3 md:sticky md:top-24">
                  <button
                    onClick={handleNotify}
                    disabled={!selectedReason}
                    className="w-full py-5 bg-brand disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-3xl font-bold flex flex-col items-center gap-1 shadow-lg shadow-brand/20"
                  >
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-5 h-5" />
                      <span>Send Notification</span>
                    </div>
                  </button>
                  <button
                    onClick={handleCall}
                    className="w-full py-5 bg-soft hover:bg-soft border border-line text-ink rounded-3xl font-bold flex flex-col items-center gap-1 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Phone className="w-5 h-5" />
                      <span>Voice Call Owner</span>
                    </div>
                    <span className="text-[10px] font-normal opacity-70">In-app call like Instagram — no phone number needed</span>
                  </button>
                  <button
                    onClick={() => (chatSession ? openChatPanel() : void startChat())}
                    disabled={chatLoading}
                    className="w-full py-4 bg-brand hover:bg-brand-dark disabled:opacity-50 text-white rounded-3xl font-bold flex items-center justify-center gap-2 relative"
                  >
                    {chatLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageSquare className="w-5 h-5" />}
                    {chatSession ? (scannerUnreadCount > 0 ? 'Open chat — new reply' : 'Resume chat') : 'Chat Owner'}
                    {scannerUnreadCount > 0 && (
                      <span className="absolute top-2 right-3 min-w-[20px] h-[20px] px-1 rounded-full bg-red-500 text-[10px] font-bold flex items-center justify-center">
                        {scannerUnreadCount > 9 ? '9+' : scannerUnreadCount}
                      </span>
                    )}
                  </button>
                  {error && <p className="text-brand text-sm text-center">{error}</p>}
                  <div className="mt-6 flex justify-center items-center gap-2 text-faint text-[10px] tracking-widest uppercase">
                    <div className="w-8 h-[1px] bg-soft" />
                    <BrandLogo size="xs" />
                    <span>Powered by {APP_NAME}</span>
                    <div className="w-8 h-[1px] bg-soft" />
                  </div>
                </div>
                </div>
                </>
                )}
              </motion.div>
            )}

            {status === 'notifying' && (
              <motion.div key="notifying" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center py-12 text-center">
                <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
                <h3 className="text-xl font-medium text-ink mb-2">Pinging Owner...</h3>
                <p className="text-muted">Sending a secure push notification.</p>
              </motion.div>
            )}

            {status === 'calling' && (
              <motion.div
                key="calling"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col flex-1 w-full min-h-0"
              >
                <div className="flex-1 flex flex-col items-center justify-center text-center px-1 py-4 sm:py-8">
                  <div className="relative mb-5 sm:mb-6">
                    {callPhase === 'active' ? (
                      <div className="relative bg-green-500/20 p-5 sm:p-6 rounded-full border border-green-500/30">
                        <Phone className="w-10 h-10 sm:w-12 sm:h-12 text-green-400" />
                      </div>
                    ) : (
                      <>
                        <div className="absolute inset-0 bg-brand/25 rounded-full animate-ping" />
                        <div className="relative bg-brand/10 p-5 sm:p-6 rounded-full border border-brand/30">
                          <Phone className="w-10 h-10 sm:w-12 sm:h-12 text-brand animate-pulse" />
                        </div>
                      </>
                    )}
                  </div>

                  <h3 className="text-2xl sm:text-xl font-semibold text-ink mb-2">
                    {callPhase === 'active' ? 'Call Connected' : callPhase === 'connecting' ? 'Connecting…' : 'Ringing Owner…'}
                  </h3>

                  {callPhase === 'active' ? (
                    <CallTimer className="block text-5xl sm:text-4xl font-bold text-green-400 mb-4 tabular-nums" />
                  ) : callPhase === 'connecting' ? (
                    <p className="text-lg text-brand mb-4 animate-pulse">Syncing audio…</p>
                  ) : null}

                  <p className="text-sm text-muted leading-relaxed max-w-[280px] sm:max-w-xs mx-auto">
                    {callPhase === 'active'
                      ? 'Speak through your device. No phone numbers are shared.'
                      : callPhase === 'connecting'
                        ? 'Owner accepted — setting up secure voice.'
                        : 'Waiting for the owner to accept in their dashboard.'}
                  </p>
                </div>

                <div className="w-full pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] space-y-3">
                  {chatSession && (
                    <button
                      type="button"
                      onClick={openChatPanel}
                      className="w-full min-h-[44px] py-3 rounded-2xl bg-brand/10 border border-brand/25 text-brand font-medium flex items-center justify-center gap-2 relative"
                    >
                      <MessageSquare className="w-4 h-4" />
                      {scannerUnreadCount > 0 ? 'Open chat — new reply' : 'Open chat'}
                      {scannerUnreadCount > 0 && (
                        <span className="min-w-[20px] h-[20px] px-1 rounded-full bg-red-500 text-[10px] font-bold flex items-center justify-center">
                          {scannerUnreadCount > 9 ? '9+' : scannerUnreadCount}
                        </span>
                      )}
                    </button>
                  )}
                  {chatOpen && chatSession && (
                    <div className="p-3 rounded-2xl bg-surface border border-line max-h-[320px] overflow-hidden">
                      <ChatPanel
                        session={chatSession}
                        role="scanner"
                        onSend={sendScannerMessage}
                        onEndChat={endScannerChat}
                        compact
                      />
                    </div>
                  )}
                  {(callPhase === 'active' || callPhase === 'connecting') && (
                    <button
                      onClick={toggleMute}
                      className={`w-full min-h-[52px] py-4 rounded-2xl font-semibold text-base flex items-center justify-center gap-2 transition-colors active:scale-[0.98] ${
                        muted
                          ? 'bg-amber-500/25 text-amber-800 border border-amber-500/40'
                          : 'bg-soft text-ink border border-line'
                      }`}
                    >
                      {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                      {muted ? 'Unmute microphone' : 'Mute microphone'}
                    </button>
                  )}
                  <button
                    onClick={handleEndCall}
                    className="w-full min-h-[52px] py-4 rounded-2xl bg-red-600 hover:bg-red-500 active:bg-red-500 text-white font-semibold text-base active:scale-[0.98] transition-colors"
                  >
                    End Call
                  </button>
                </div>
                <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
              </motion.div>
            )}

            {status === 'success' && (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <h3 className="text-xl font-medium text-ink mb-2">Request Sent</h3>
                <p className="text-muted mb-6">{successMessage ?? 'The owner has been notified.'}</p>
                <button
                  onClick={() => { setStatus('idle'); setSelectedReason(null); }}
                  className="px-6 py-2 rounded-full bg-soft hover:bg-soft text-ink font-medium transition-colors text-sm"
                >
                  Done
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-brand/10 to-transparent" />
      </div>
    </motion.div>
    </div>
  );
}
