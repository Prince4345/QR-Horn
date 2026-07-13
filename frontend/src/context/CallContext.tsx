import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode, type RefObject } from 'react';
import {
  VoiceCallSession,
  registerOwnerSocket,
  subscribeIncomingCalls,
  subscribeCallLifecycle,
  declineIncomingCall,
  type IncomingCall,
  type CallPhase,
} from '../lib/voiceCall';
import { useAuth } from './AuthContext';
import { api, waitForApiReady } from '../lib/api';
import { startRingtone, stopRingtone } from '../lib/ringtone';

interface CallContextValue {
  incomingCall: IncomingCall | null;
  callPhase: CallPhase;
  muted: boolean;
  toggleMute: () => void;
  acceptIncomingCall: () => Promise<void>;
  declineCall: () => void;
  endActiveCall: () => void;
  remoteAudioRef: RefObject<HTMLAudioElement | null>;
}

const CallContext = createContext<CallContextValue | null>(null);

const DISMISS_TTL_MS = 120_000;

function rememberDismissed(rooms: Set<string>, roomId: string) {
  rooms.add(roomId);
  setTimeout(() => rooms.delete(roomId), DISMISS_TTL_MS);
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { owner } = useAuth();
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [callPhase, setCallPhase] = useState<CallPhase>('idle');
  const [muted, setMuted] = useState(false);
  const sessionRef = useRef<VoiceCallSession | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const incomingCallRef = useRef<IncomingCall | null>(null);
  const callPhaseRef = useRef<CallPhase>('idle');
  const dismissedRoomsRef = useRef<Set<string>>(new Set());
  const acceptingRef = useRef(false);
  const decliningRef = useRef(false);

  incomingCallRef.current = incomingCall;
  callPhaseRef.current = callPhase;

  const clearRing = useCallback((phase: CallPhase = 'idle') => {
    setIncomingCall(null);
    setCallPhase(phase);
  }, []);

  const showIncoming = useCallback((call: IncomingCall) => {
    if (dismissedRoomsRef.current.has(call.roomId)) return;
    const phase = callPhaseRef.current;
    if (phase === 'connecting' || phase === 'active') return;
    if (incomingCallRef.current && incomingCallRef.current.roomId !== call.roomId) return;
    setIncomingCall(call);
    setCallPhase('ringing');
  }, []);

  // Ring + vibrate while an incoming call is waiting
  useEffect(() => {
    if (incomingCall) {
      startRingtone();
      return stopRingtone;
    }
    stopRingtone();
  }, [incomingCall]);

  useEffect(() => {
    if (!incomingCall) return;
    const original = document.title;
    let flipped = false;
    const interval = setInterval(() => {
      flipped = !flipped;
      document.title = flipped ? '📞 Incoming call…' : original;
    }, 1000);
    return () => {
      clearInterval(interval);
      document.title = original;
    };
  }, [incomingCall]);

  // Owner socket + incoming-call listener (stable — never re-subscribe per ring)
  useEffect(() => {
    if (!owner?.id) return;
    registerOwnerSocket(owner.id);
    const unsub = subscribeIncomingCalls((call) => showIncoming(call));
    return unsub;
  }, [owner?.id, showIncoming]);

  // Cross-device sync via owner room broadcasts
  useEffect(() => {
    if (!owner?.id) return;
    const unsub = subscribeCallLifecycle(({ roomId, type }) => {
      const current = incomingCallRef.current;
      const phase = callPhaseRef.current;

      if (type === 'declined' || type === 'ended') {
        rememberDismissed(dismissedRoomsRef.current, roomId);
      }

      if (type === 'accepted') {
        // Another device picked up — stop ringing here only
        if (phase === 'ringing' && current?.roomId === roomId) {
          rememberDismissed(dismissedRoomsRef.current, roomId);
          clearRing('idle');
        }
        return;
      }

      if (phase === 'ringing' && current?.roomId === roomId) {
        sessionRef.current?.end();
        sessionRef.current = null;
        clearRing(type);
        setTimeout(() => setCallPhase('idle'), 1500);
      }
    });
    return unsub;
  }, [owner?.id, clearRing]);

  // Poll fallback — self-heal missed socket events; never resurrect dismissed calls
  useEffect(() => {
    if (!owner?.id) return;

    let interval: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;

    const poll = async () => {
      const phase = callPhaseRef.current;
      if (phase === 'connecting' || phase === 'active') return;

      try {
        const pending = await api.getPendingCalls();
        const live = pending.find((c) => !dismissedRoomsRef.current.has(c.roomId));
        if (live) {
          showIncoming({
            roomId: live.roomId,
            vehicleName: live.vehicleName,
            vehicleNumber: live.vehicleNumber,
          });
        } else if (phase === 'ringing' && incomingCallRef.current) {
          clearRing('idle');
        }
      } catch {
        // backend may be waking up
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible' && owner?.id) {
        registerOwnerSocket(owner.id);
        void poll();
      }
    };

    (async () => {
      await waitForApiReady();
      if (cancelled) return;
      poll();
      interval = setInterval(poll, 2000);
    })();

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('qrhorn:incoming-call', onVisible);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('qrhorn:incoming-call', onVisible);
    };
  }, [owner?.id, showIncoming, clearRing]);

  // Push / notification deep-link: ?view=dashboard&call=roomId
  useEffect(() => {
    if (!owner?.id) return;
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('call');
    if (!roomId) return;
    registerOwnerSocket(owner.id);
    void (async () => {
      try {
        const pending = await api.getPendingCalls();
        const match = pending.find((c) => c.roomId === roomId);
        if (match) {
          showIncoming({
            roomId: match.roomId,
            vehicleName: match.vehicleName,
            vehicleNumber: match.vehicleNumber,
          });
        }
      } catch {
        // poll will pick it up
      }
    })();
  }, [owner?.id, showIncoming]);

  const attachRemote = useCallback((stream: MediaStream) => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = stream;
      remoteAudioRef.current.play().catch(() => {});
    }
  }, []);

  const toggleMute = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    const next = !session.isMuted();
    session.setMuted(next);
    setMuted(next);
  }, []);

  const acceptIncomingCall = useCallback(async () => {
    if (!incomingCall || acceptingRef.current) return;
    const roomId = incomingCall.roomId;
    acceptingRef.current = true;
    setMuted(false);
    setCallPhase('connecting');
    setIncomingCall(null);
    try {
      const session = await VoiceCallSession.startIncoming(roomId);
      rememberDismissed(dismissedRoomsRef.current, roomId);
      sessionRef.current = session;
      session.onPhase((phase) => {
        setCallPhase(phase);
        if (phase === 'failed' || phase === 'ended' || phase === 'declined') {
          sessionRef.current = null;
          setIncomingCall(null);
          setTimeout(() => setCallPhase('idle'), 1500);
        }
      });
      session.onRemote(attachRemote);
    } catch (err) {
      console.error('Accept call failed:', err);
      sessionRef.current?.end();
      sessionRef.current = null;
      setCallPhase('failed');
      setIncomingCall(null);
      setTimeout(() => setCallPhase('idle'), 2000);
    } finally {
      acceptingRef.current = false;
    }
  }, [incomingCall, attachRemote]);

  const declineCall = useCallback(() => {
    if (decliningRef.current) return;
    decliningRef.current = true;
    const roomId = incomingCall?.roomId;
    if (roomId) {
      rememberDismissed(dismissedRoomsRef.current, roomId);
      void declineIncomingCall(roomId);
    }
    sessionRef.current?.end();
    sessionRef.current = null;
    setIncomingCall(null);
    setCallPhase('declined');
    setTimeout(() => {
      setCallPhase('idle');
      decliningRef.current = false;
    }, 1500);
  }, [incomingCall]);

  const endActiveCall = useCallback(() => {
    sessionRef.current?.end();
    sessionRef.current = null;
    setIncomingCall(null);
    setCallPhase('ended');
    setTimeout(() => setCallPhase('idle'), 1500);
  }, []);

  return (
    <CallContext.Provider
      value={{
        incomingCall,
        callPhase,
        muted,
        toggleMute,
        acceptIncomingCall,
        declineCall,
        endActiveCall,
        remoteAudioRef,
      }}
    >
      {children}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
    </CallContext.Provider>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
}
