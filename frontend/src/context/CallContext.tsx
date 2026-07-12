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

export function CallProvider({ children }: { children: ReactNode }) {
  const { owner } = useAuth();
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [callPhase, setCallPhase] = useState<CallPhase>('idle');
  const [muted, setMuted] = useState(false);
  const sessionRef = useRef<VoiceCallSession | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const busyRef = useRef(false);

  // Ring + vibrate while an incoming call is waiting
  useEffect(() => {
    if (incomingCall) {
      startRingtone();
      return stopRingtone;
    }
    stopRingtone();
  }, [incomingCall]);

  // Flash the tab title so a glance at the browser tab bar also signals a call
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

  useEffect(() => {
    busyRef.current =
      callPhase === 'ringing' ||
      callPhase === 'connecting' ||
      callPhase === 'active' ||
      !!incomingCall;
  }, [callPhase, incomingCall]);

  useEffect(() => {
    if (!owner?.id) return;
    registerOwnerSocket(owner.id);
    const unsub = subscribeIncomingCalls((call) => {
      // Ignore new rings while already in a call
      if (busyRef.current && incomingCall?.roomId !== call.roomId) return;
      setIncomingCall(call);
      setCallPhase('ringing');
    });
    return unsub;
  }, [owner?.id, incomingCall?.roomId]);

  // Cross-device sync: if another of the owner's devices accepts/declines,
  // or the caller hangs up / the ring times out, stop ringing on THIS device
  // too — even if this device never joined the call's own signaling room.
  useEffect(() => {
    if (!owner?.id) return;
    const unsub = subscribeCallLifecycle(({ roomId, type }) => {
      // Only react while merely ringing — never interrupt our own accept
      // flow (which is already transitioning through 'connecting').
      if (callPhase !== 'ringing') return;
      if (!incomingCall || incomingCall.roomId !== roomId) return;
      setIncomingCall(null);
      if (type === 'accepted') {
        setCallPhase('idle');
      } else {
        setCallPhase(type);
        setTimeout(() => setCallPhase('idle'), 1500);
      }
    });
    return unsub;
  }, [owner?.id, callPhase, incomingCall?.roomId]);

  useEffect(() => {
    if (!owner?.id) return;

    let interval: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;

    const poll = async () => {
      // Never poll mid-call (would be pointless/disruptive); do poll while
      // merely ringing so a missed decline/expire event still self-heals.
      if (callPhase === 'connecting' || callPhase === 'active') return;
      try {
        const pending = await api.getPendingCalls();
        if (pending.length > 0) {
          const call = pending[0];
          setIncomingCall({
            roomId: call.roomId,
            vehicleName: call.vehicleName,
            vehicleNumber: call.vehicleNumber,
          });
          setCallPhase('ringing');
        } else if (callPhase === 'ringing' && incomingCall) {
          // Server no longer has this call pending — it was handled or
          // expired and we missed the socket event. Clear the stale ring.
          setIncomingCall(null);
          setCallPhase('idle');
        }
      } catch {
        // silent — backend may be restarting
      }
    };

    (async () => {
      await waitForApiReady();
      if (cancelled) return;
      poll();
      interval = setInterval(poll, 2500);
    })();

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [owner?.id, callPhase, incomingCall]);

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
    if (!incomingCall) return;
    const roomId = incomingCall.roomId;
    setMuted(false);
    setCallPhase('connecting');
    try {
      const session = await VoiceCallSession.startIncoming(roomId);
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
      setIncomingCall(null);
    } catch (err) {
      console.error('Accept call failed:', err);
      declineIncomingCall(roomId);
      setCallPhase('failed');
      setIncomingCall(null);
      setTimeout(() => setCallPhase('idle'), 2000);
    }
  }, [incomingCall, attachRemote]);

  const declineCall = useCallback(() => {
    if (incomingCall) declineIncomingCall(incomingCall.roomId);
    sessionRef.current?.end();
    sessionRef.current = null;
    setIncomingCall(null);
    setCallPhase('declined');
    setTimeout(() => setCallPhase('idle'), 1500);
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
