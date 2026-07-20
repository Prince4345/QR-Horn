import { motion, AnimatePresence } from 'motion/react';
import { Phone, PhoneOff, Mic, MicOff, Loader2 } from 'lucide-react';
import { useCall } from '../context/CallContext';
import CallTimer from './CallTimer';
import { useState } from 'react';
import { APP_NAME } from '../lib/brand';

export default function IncomingCallModal() {
  const { incomingCall, callPhase, muted, toggleMute, acceptIncomingCall, declineCall, endActiveCall } = useCall();
  const [accepting, setAccepting] = useState(false);

  const showIncoming = !!incomingCall;
  const showActive = callPhase === 'active' || callPhase === 'connecting';

  const handleAccept = async () => {
    if (accepting) return;
    setAccepting(true);
    try {
      await acceptIncomingCall();
    } finally {
      setAccepting(false);
    }
  };

  const vehicleName = incomingCall?.vehicleName ?? 'Vehicle';
  const vehicleNumber = incomingCall?.vehicleNumber ?? '';

  return (
    <AnimatePresence>
      {(showIncoming || showActive) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex flex-col text-white"
          style={{
            background: 'linear-gradient(165deg, #0d0118 0%, #1a0b2e 45%, #24123a 100%)',
          }}
          role="dialog"
          aria-modal="true"
          aria-label={showIncoming ? 'Incoming call' : 'Active call'}
        >
          {/* Soft brand glow */}
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              background:
                'radial-gradient(ellipse 80% 50% at 50% 20%, rgba(255,0,127,0.22), transparent 70%)',
            }}
          />

          <div className="relative z-10 flex flex-1 flex-col items-center px-6 pt-[max(3rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
            {showIncoming && incomingCall && (
              <>
                <p className="mt-6 text-xs font-medium tracking-[0.2em] uppercase text-white/50">
                  {APP_NAME}
                </p>
                <p className="mt-2 text-sm text-white/70">Incoming call</p>

                <div className="relative mt-14 mb-8 flex h-36 w-36 items-center justify-center">
                  <span className="absolute inset-0 rounded-full bg-[#ff007f]/25 animate-ping" />
                  <span className="absolute inset-3 rounded-full bg-[#ff007f]/15 animate-pulse" />
                  <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-white/10 ring-2 ring-[#ff007f]/40">
                    <Phone className="h-12 w-12 text-[#ff007f]" strokeWidth={1.75} />
                  </div>
                </div>

                <h2 className="text-center text-3xl font-semibold tracking-tight">{vehicleName}</h2>
                <p className="mt-2 font-mono text-sm tracking-wider text-white/55">{vehicleNumber}</p>
                <p className="mt-6 max-w-xs text-center text-sm text-white/45">
                  In-app voice call — your phone number stays private.
                </p>

                <div className="mt-auto flex w-full max-w-sm items-end justify-around pb-4 pt-16">
                  <button
                    type="button"
                    onClick={declineCall}
                    disabled={accepting}
                    className="flex flex-col items-center gap-3 disabled:opacity-50"
                    aria-label="Decline call"
                  >
                    <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-red-600 shadow-lg shadow-red-900/40 active:scale-95 transition-transform">
                      <PhoneOff className="h-8 w-8 text-white" />
                    </span>
                    <span className="text-sm text-white/70">Decline</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAccept}
                    disabled={accepting}
                    className="flex flex-col items-center gap-3 disabled:opacity-50"
                    aria-label="Accept call"
                  >
                    <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-900/40 active:scale-95 transition-transform">
                      {accepting ? (
                        <Loader2 className="h-8 w-8 animate-spin text-white" />
                      ) : (
                        <Phone className="h-8 w-8 text-white" />
                      )}
                    </span>
                    <span className="text-sm text-white/70">{accepting ? 'Connecting…' : 'Accept'}</span>
                  </button>
                </div>
              </>
            )}

            {showActive && !showIncoming && (
              <>
                <p className="mt-6 text-xs font-medium tracking-[0.2em] uppercase text-white/50">
                  {APP_NAME}
                </p>
                <p className="mt-2 text-sm text-white/70">
                  {callPhase === 'connecting' ? 'Connecting…' : 'On call'}
                </p>

                <div className="relative mt-14 mb-8 flex h-36 w-36 items-center justify-center">
                  <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-emerald-500/20 ring-2 ring-emerald-400/40">
                    <Phone className="h-12 w-12 text-emerald-400" strokeWidth={1.75} />
                  </div>
                </div>

                <h2 className="text-center text-3xl font-semibold tracking-tight">
                  {callPhase === 'connecting' ? 'Connecting' : 'Call active'}
                </h2>
                {callPhase === 'active' ? (
                  <CallTimer className="mt-3 block text-4xl font-light tabular-nums text-emerald-400" />
                ) : (
                  <p className="mt-3 text-sm text-white/50">Setting up secure voice…</p>
                )}

                <div className="mt-auto flex w-full max-w-sm items-end justify-around pb-4 pt-16">
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="flex flex-col items-center gap-3"
                    aria-label={muted ? 'Unmute' : 'Mute'}
                  >
                    <span
                      className={`flex h-[72px] w-[72px] items-center justify-center rounded-full active:scale-95 transition-transform ${
                        muted ? 'bg-amber-500/90' : 'bg-white/15'
                      }`}
                    >
                      {muted ? (
                        <MicOff className="h-8 w-8 text-white" />
                      ) : (
                        <Mic className="h-8 w-8 text-white" />
                      )}
                    </span>
                    <span className="text-sm text-white/70">{muted ? 'Unmute' : 'Mute'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={endActiveCall}
                    className="flex flex-col items-center gap-3"
                    aria-label="End call"
                  >
                    <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-red-600 shadow-lg shadow-red-900/40 active:scale-95 transition-transform">
                      <PhoneOff className="h-8 w-8 text-white" />
                    </span>
                    <span className="text-sm text-white/70">End</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
