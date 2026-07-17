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
  joinChatAsScanner,
  loadPendingScannerChat,
  loadScannerLastSeen,
  loadScannerToken,
  notifyScannerOwnerReply,
  requestScannerNotificationPermission,
  savePendingScannerChat,
  saveScannerLastSeen,
  saveScannerToken,
  subscribeChatMessages,
  subscribeChatSessionUpdates,
} from '../lib/chatClient';
import { playMessageSound } from '../lib/messageSound';
import { APP_NAME } from '../lib/brand';
import ScannerLandingHero from './ScannerLandingHero';

const REASONS: { id: ContactReason; label: string; icon: typeof Car; color: string; bg: string }[] = [
  { id: 'move', label: 'Move Vehicle', icon: Car, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  { id: 'lights', label: 'Lights are ON', icon: Lightbulb, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  { id: 'parking', label: 'Wrong Parking', icon: ParkingCircle, color: 'text-orange-400', bg: 'bg-orange-500/10' },
  { id: 'emergency', label: 'Emergency', icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10' },
  { id: 'other', label: 'Other', icon: HelpCircle, color: 'text-slate-400', bg: 'bg-slate-500/10' },
];

interface ScannerViewProps {
  scanCode?: string;
}

export default function ScannerView({ scanCode }: ScannerViewProps) {
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
    setChatSession(session);

    const unread = countOwnerUnread(session, lastSeenRef.current);
    if (unread <= 0 || chatOpenRef.current) return;

    const latest = getLatestOwnerMessage(session);
    if (!latest) return;

    setOwnerReplyBanner({ preview: latest.body, count: unread });

    if (document.hidden) {
      notifyScannerOwnerReply({
        sessionId: session.id,
        vehicleName: session.vehicleName,
        preview: latest.body,
        url: buildChatUrl(session.id),
      });
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
      const existingToken = chatSessionId ? loadScannerToken(chatSessionId) : null;
      const result = await api.startChat(scanData.vehicleId, {
        reason: opts?.reason ?? selectedReason ?? undefined,
        callRoomId: opts?.callRoomId ?? activeCallRoomId ?? undefined,
        scannerToken: existingToken ?? scannerToken ?? undefined,
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
        if (!cancelled) setLandingChatRestore(null);
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
    const unsubMsg = subscribeChatMessages(({ sessionId, message, session }) => {
      if (sessionId !== chatSessionId) return;
      handleIncomingSession(session, message.senderRole === 'OWNER');
    });
    const unsubSession = subscribeChatSessionUpdates((session) => {
      if (session.id !== chatSessionId) return;
      handleIncomingSession(session);
    });
    const poll = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void api
        .getScannerChat(chatSessionId, scannerToken)
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
      const result = await api.initiateCall(contactMethod, contactId);
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

  // Landing — QR scan instructions + vehicle number lookup
  if (!scanData && !loading && !scanCode) {
    return (
      <div className="relative w-[100vw] max-w-none left-1/2 -translate-x-1/2 min-h-[calc(100dvh-4.5rem-env(safe-area-inset-top))] flex flex-col">
        <ScannerLandingHero hidden={showCamera} />

        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.75, type: 'spring', stiffness: 90, damping: 20 }}
          className="relative z-10 mt-auto w-full max-w-md mx-auto px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
        >
          <div className="scanner-hero-card w-full bg-white/[0.07] border border-white/15 rounded-2xl sm:rounded-[40px] overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl ring-1 ring-white/5">
        <div className="flex border-b border-white/10">
          <button
            onClick={() => { setEntryTab('qr'); setError(null); }}
            className={`flex-1 py-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              entryTab === 'qr' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <QrCode className="w-4 h-4" />
            Scan QR
          </button>
          <button
            onClick={() => { setEntryTab('plate'); setError(null); }}
            className={`flex-1 py-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              entryTab === 'plate' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Car className="w-4 h-4" />
            Vehicle No.
          </button>
        </div>

        <div className="p-5 sm:p-8">
          {(landingChatRestore || landingChatLoading) && (
            <div className="mb-6 p-4 rounded-2xl bg-violet-600/15 border border-violet-500/30">
              {landingChatLoading && !landingChatRestore ? (
                <div className="flex items-center gap-3 text-violet-100/80 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  Checking for an open chat…
                </div>
              ) : landingChatRestore ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-600/30 flex items-center justify-center shrink-0">
                      <MessageSquare className="w-5 h-5 text-violet-200" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-white">
                        {landingUnreadCount > 0 ? 'Owner replied' : 'Continue your chat'}
                      </p>
                      <p className="text-xs text-violet-100/70 truncate">
                        {landingChatRestore.vehicleName} · {landingChatRestore.vehicleNumber}
                      </p>
                      {landingUnreadCount > 0 && ownerReplyBanner && (
                        <p className="text-sm text-violet-100/90 mt-1 line-clamp-2">
                          “{ownerReplyBanner.preview}”
                        </p>
                      )}
                    </div>
                    {landingUnreadCount > 0 && (
                      <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-500 text-[11px] font-bold flex items-center justify-center shrink-0">
                        {landingUnreadCount > 9 ? '9+' : landingUnreadCount}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void resumeLandingChat()}
                    disabled={landingChatLoading}
                    className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2"
                  >
                    {landingChatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                    {landingUnreadCount > 0 ? 'Open chat & read reply' : 'Resume chat'}
                  </button>
                </div>
              ) : null}
            </div>
          )}

          <AnimatePresence mode="wait">
            {entryTab === 'qr' ? (
              <motion.div key="qr" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
                <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <QrCode className="w-8 h-8 text-blue-400" />
                </div>
                <h2 className="text-xl font-semibold mb-2">Scan QR Sticker</h2>
                <p className="text-white/50 text-sm leading-relaxed mb-6">
                  Use your camera to scan the sticker, or open the QR link from your phone camera app.
                </p>
                <button
                  onClick={() => setShowCamera(true)}
                  className="w-full py-4 bg-blue-600 rounded-2xl font-semibold flex items-center justify-center gap-2"
                >
                  <Camera className="w-5 h-5" />
                  Open Camera Scanner
                </button>
              </motion.div>
            ) : (
              <motion.div key="plate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <h2 className="text-xl font-semibold mb-2 text-center">Enter Vehicle Number</h2>
                <p className="text-white/50 text-sm text-center mb-6 leading-relaxed">
                  QR not visible? Enter the license plate number and we'll check if this vehicle is registered.
                </p>
                <input
                  value={plateInput}
                  onChange={(e) => setPlateInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && loadByPlate(plateInput)}
                  placeholder="e.g. DL 8C AA 1111"
                  className="w-full px-4 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 outline-none focus:border-blue-500/50 font-mono tracking-wider text-center mb-4"
                />
                <button
                  onClick={() => loadByPlate(plateInput)}
                  disabled={!plateInput.trim()}
                  className="w-full py-4 bg-blue-600 disabled:opacity-50 rounded-2xl font-semibold flex items-center justify-center gap-2"
                >
                  <Search className="w-5 h-5" />
                  Find Vehicle
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <div className="mt-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-red-300 text-sm font-medium">{error}</p>
                <p className="text-red-400/60 text-xs mt-1">Only vehicles registered with {APP_NAME} can be contacted.</p>
              </div>
            </div>
          )}
        </div>
          </div>
        </motion.div>

        {showCamera && (
          <QrCameraScanner onScan={handleCameraScan} onClose={() => setShowCamera(false)} />
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white/5 border border-white/10 rounded-2xl sm:rounded-[40px] p-8 sm:p-12 flex flex-col items-center"
      >
        <Loader2 className="w-8 h-8 animate-spin text-blue-400 mb-4" />
        <p className="text-white/60 text-sm">
          {contactMethod === 'plate' ? 'Checking registration...' : 'Loading vehicle...'}
        </p>
      </motion.div>
    );
  }

  if (error || !scanData) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white/5 border border-white/10 rounded-2xl sm:rounded-[40px] p-6 sm:p-10 text-center"
      >
        <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Not Registered</h2>
        <p className="text-white/50 text-sm mb-6">{error ?? `This vehicle is not registered with ${APP_NAME}.`}</p>
        <button onClick={handleBack} className="px-6 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm">
          Try Again
        </button>
      </motion.div>
    );
  }

  const isChatFullscreen = chatOpen && chatSession && status === 'idle';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={`w-full mx-auto relative bg-gradient-to-b from-[#111] to-[#000] border border-white/10 shadow-2xl overflow-hidden flex flex-col ${
        status === 'calling'
          ? 'max-w-md md:max-w-lg rounded-2xl sm:rounded-[40px] min-h-[calc(100dvh-7rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] md:min-h-0'
          : isChatFullscreen
            ? 'max-w-md md:max-w-3xl lg:max-w-5xl rounded-2xl md:rounded-3xl h-[calc(100dvh-4.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))]'
            : 'max-w-md md:max-w-lg rounded-2xl sm:rounded-[40px] overflow-y-auto max-h-[calc(100dvh-6rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))]'
      }`}
    >
      <div
        className={`flex flex-col h-full relative z-10 min-h-0 ${
          status === 'calling' || isChatFullscreen ? 'p-4 sm:p-6 flex-1' : 'p-5 sm:p-8'
        }`}
      >
        {!scanCode && status !== 'calling' && !isChatFullscreen && (
          <button onClick={handleBack} className="text-sm text-slate-400 hover:text-white transition-colors mb-4 self-start">
            &larr; Back
          </button>
        )}

        {status === 'calling' ? (
          <div className="text-center pb-4 mb-2 border-b border-white/10">
            <p className="text-white/40 text-[10px] tracking-widest uppercase mb-0.5">Calling</p>
            <p className="text-lg font-semibold leading-tight">{scanData.vehicleName}</p>
            <span className="inline-block mt-1 px-2.5 py-0.5 rounded-md bg-white/10 font-mono text-xs tracking-wider text-slate-300">
              {scanData.vehicleNumber}
            </span>
          </div>
        ) : !isChatFullscreen ? (
        <div className="text-center mb-8">
          <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-4" />
          <p className="text-white/40 text-xs tracking-widest uppercase mb-1">
            {contactMethod === 'plate' ? 'Vehicle Found' : 'Scanned Vehicle'}
          </p>
          <h1 className="text-2xl font-semibold mb-2">{scanData.vehicleName}</h1>
          <span className="inline-block px-3 py-1 rounded-md bg-white/10 font-mono text-sm tracking-widest text-slate-300 mb-3">
            {scanData.vehicleNumber}
          </span>
          <p className="text-white/60 text-sm mb-4">Contacting vehicle owner anonymously</p>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-500/10 rounded-full">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
            <span className="text-[10px] text-green-500 font-bold uppercase tracking-wider">
              Registered · Privacy Mask Active
            </span>
          </div>
        </div>
        ) : (
          <div className="flex items-center gap-3 pb-3 mb-2 border-b border-white/10 shrink-0">
            <button
              type="button"
              onClick={closeChatPanel}
              className="p-2 -ml-1 rounded-full hover:bg-white/10 text-slate-300"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0 flex-1 text-left">
              <p className="font-semibold text-sm truncate">{scanData.vehicleName}</p>
              <p className="text-[10px] font-mono text-slate-500 truncate">{scanData.vehicleNumber}</p>
            </div>
          </div>
        )}

        <div className={`${status === 'calling' || isChatFullscreen ? 'flex-1 flex flex-col min-h-0' : ''}`}>
          <AnimatePresence mode="wait">
            {status === 'idle' && (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-6">
                {chatOpen && chatSession ? (
                  <div className="flex flex-col flex-1 min-h-0">
                    <div className="flex-1 min-h-0 rounded-2xl bg-white/5 border border-white/10 p-2 md:p-4">
                      <ChatPanel
                        session={chatSession}
                        role="scanner"
                        onSend={sendScannerMessage}
                        desktop
                      />
                    </div>
                    <button
                      type="button"
                      onClick={closeChatPanel}
                      className="mt-3 text-xs text-slate-500 hover:text-slate-300 shrink-0 md:hidden"
                    >
                      Back to notify / call options
                    </button>
                  </div>
                ) : (
                <>
                {ownerReplyBanner && scannerUnreadCount > 0 && (
                  <button
                    type="button"
                    onClick={openChatPanel}
                    className="p-4 rounded-2xl bg-violet-600/20 border border-violet-500/40 text-left transition-colors hover:bg-violet-600/30"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-violet-600/30 flex items-center justify-center shrink-0">
                        <MessageSquare className="w-5 h-5 text-violet-200" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm text-violet-100">Owner replied</p>
                        <p className="text-sm text-white/80 mt-0.5 line-clamp-2">“{ownerReplyBanner.preview}”</p>
                        <p className="text-xs text-violet-200/60 mt-1">Tap to open chat</p>
                      </div>
                      <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-500 text-[11px] font-bold flex items-center justify-center shrink-0">
                        {scannerUnreadCount > 9 ? '9+' : scannerUnreadCount}
                      </span>
                    </div>
                  </button>
                )}

                {chatSession && !ownerReplyBanner && (
                  <button
                    type="button"
                    onClick={openChatPanel}
                    className="p-3 rounded-2xl bg-violet-600/10 border border-violet-500/20 text-violet-100 font-medium text-sm flex items-center justify-center gap-2"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Resume chat with owner
                  </button>
                )}

                <div className="space-y-4 mb-8">
                  <p className="text-white/60 text-sm text-center mb-6">Select a reason to contact the owner anonymously.</p>
                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    {REASONS.map((reason) => {
                      const Icon = reason.icon;
                      const isSelected = selectedReason === reason.id;
                      return (
                        <button
                          key={reason.id}
                          onClick={() => setSelectedReason(reason.id)}
                          className={`p-4 rounded-2xl flex flex-col items-center gap-2 transition-all ${
                            isSelected
                              ? 'bg-white/10 border border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]'
                              : 'bg-white/5 border border-white/5 hover:bg-white/10'
                          }`}
                        >
                          <Icon className={`w-8 h-8 ${reason.color} mb-1`} />
                          <span className="text-[10px] uppercase font-bold text-white/70">{reason.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-auto flex flex-col gap-3">
                  <button
                    onClick={handleNotify}
                    disabled={!selectedReason}
                    className="w-full py-5 bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-3xl font-bold flex flex-col items-center gap-1 shadow-lg shadow-blue-600/20"
                  >
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-5 h-5" />
                      <span>Send Notification</span>
                    </div>
                  </button>
                  <button
                    onClick={handleCall}
                    className="w-full py-5 bg-white/10 hover:bg-white/20 border border-white/10 text-white rounded-3xl font-bold flex flex-col items-center gap-1 transition-colors"
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
                    className="w-full py-4 bg-violet-600 hover:bg-violet-600/90 disabled:opacity-50 text-white rounded-3xl font-bold flex items-center justify-center gap-2 relative"
                  >
                    {chatLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageSquare className="w-5 h-5" />}
                    {chatSession ? (scannerUnreadCount > 0 ? 'Open chat — new reply' : 'Resume chat') : 'Chat Owner'}
                    {scannerUnreadCount > 0 && (
                      <span className="absolute top-2 right-3 min-w-[20px] h-[20px] px-1 rounded-full bg-red-500 text-[10px] font-bold flex items-center justify-center">
                        {scannerUnreadCount > 9 ? '9+' : scannerUnreadCount}
                      </span>
                    )}
                  </button>
                  {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                  <div className="mt-6 flex justify-center items-center gap-2 text-white/30 text-[10px] tracking-widest uppercase">
                    <div className="w-8 h-[1px] bg-white/10" />
                    <span>Powered by {APP_NAME}</span>
                    <div className="w-8 h-[1px] bg-white/10" />
                  </div>
                </div>
                </>
                )}
              </motion.div>
            )}

            {status === 'notifying' && (
              <motion.div key="notifying" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center py-12 text-center">
                <Loader2 className="w-12 h-12 text-blue-400 animate-spin mb-4" />
                <h3 className="text-xl font-medium text-white mb-2">Pinging Owner...</h3>
                <p className="text-slate-400">Sending a secure push notification.</p>
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
                        <div className="absolute inset-0 bg-blue-500/30 rounded-full animate-ping" />
                        <div className="relative bg-blue-500/20 p-5 sm:p-6 rounded-full border border-blue-500/30">
                          <Phone className="w-10 h-10 sm:w-12 sm:h-12 text-blue-400 animate-pulse" />
                        </div>
                      </>
                    )}
                  </div>

                  <h3 className="text-2xl sm:text-xl font-semibold text-white mb-2">
                    {callPhase === 'active' ? 'Call Connected' : callPhase === 'connecting' ? 'Connecting…' : 'Ringing Owner…'}
                  </h3>

                  {callPhase === 'active' ? (
                    <CallTimer className="block text-5xl sm:text-4xl font-bold text-green-400 mb-4 tabular-nums" />
                  ) : callPhase === 'connecting' ? (
                    <p className="text-lg text-blue-300 mb-4 animate-pulse">Syncing audio…</p>
                  ) : null}

                  <p className="text-sm text-white/50 leading-relaxed max-w-[280px] sm:max-w-xs mx-auto">
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
                      className="w-full min-h-[44px] py-3 rounded-2xl bg-violet-600/20 border border-violet-500/30 text-violet-100 font-medium flex items-center justify-center gap-2 relative"
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
                    <div className="p-3 rounded-2xl bg-white/5 border border-white/10 max-h-[320px] overflow-hidden">
                      <ChatPanel session={chatSession} role="scanner" onSend={sendScannerMessage} compact />
                    </div>
                  )}
                  {(callPhase === 'active' || callPhase === 'connecting') && (
                    <button
                      onClick={toggleMute}
                      className={`w-full min-h-[52px] py-4 rounded-2xl font-semibold text-base flex items-center justify-center gap-2 transition-colors active:scale-[0.98] ${
                        muted
                          ? 'bg-amber-500/25 text-amber-200 border border-amber-500/40'
                          : 'bg-white/10 text-white border border-white/10'
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
                <h3 className="text-xl font-medium text-white mb-2">Request Sent</h3>
                <p className="text-slate-400 mb-6">{successMessage ?? 'The owner has been notified.'}</p>
                <button
                  onClick={() => { setStatus('idle'); setSelectedReason(null); }}
                  className="px-6 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white font-medium transition-colors text-sm"
                >
                  Done
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-blue-600/10 to-transparent" />
      </div>
    </motion.div>
  );
}
