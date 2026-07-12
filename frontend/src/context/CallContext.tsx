import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode, type RefObject } from 'react';
import {
  VoiceCallSession,
  registerOwnerSocket,
  subscribeIncomingCalls,
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

  useEffect(() => {
    if (!owner?.id) return;

    let interval: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;

    const poll = async () => {
      if (busyRef.current && callPhase !== 'idle') return;
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
  }, [owner?.id, callPhase]);

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
