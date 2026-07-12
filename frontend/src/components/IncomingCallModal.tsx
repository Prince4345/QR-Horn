import { motion, AnimatePresence } from 'motion/react';
import { Phone, PhoneOff, Mic, MicOff } from 'lucide-react';
import { useCall } from '../context/CallContext';
import CallTimer from './CallTimer';

export default function IncomingCallModal() {
  const { incomingCall, callPhase, muted, toggleMute, acceptIncomingCall, declineCall, endActiveCall } = useCall();

  const showIncoming = !!incomingCall;
  const showActive = callPhase === 'active' || callPhase === 'connecting';

  return (
    <AnimatePresence>
      {(showIncoming || showActive) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="w-full max-w-sm bg-zinc-900 border border-white/10 rounded-3xl p-8 text-center"
          >
            {showIncoming && incomingCall && (
              <>
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-blue-500/20 flex items-center justify-center relative">
                  <div className="absolute inset-0 rounded-full bg-blue-500/30 animate-ping" />
                  <Phone className="w-10 h-10 text-blue-400 relative" />
                </div>
                <h2 className="text-xl font-semibold mb-1">Incoming Voice Call</h2>
                <p className="text-white/60 text-sm mb-1">{incomingCall.vehicleName}</p>
                <p className="text-white/40 text-xs font-mono mb-8">{incomingCall.vehicleNumber}</p>
                <p className="text-white/50 text-xs mb-6">In-app call — like Instagram. No phone number shared.</p>
                <div className="flex gap-3">
                  <button
                    onClick={declineCall}
                    className="flex-1 py-3 rounded-2xl bg-red-500/20 text-red-300 font-semibold flex items-center justify-center gap-2"
                  >
                    <PhoneOff className="w-4 h-4" /> Decline
                  </button>
                  <button
                    onClick={acceptIncomingCall}
                    className="flex-1 py-3 rounded-2xl bg-green-600 text-white font-semibold flex items-center justify-center gap-2"
                  >
                    <Phone className="w-4 h-4" /> Accept
                  </button>
                </div>
              </>
            )}

            {showActive && !showIncoming && (
              <>
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
                  <Phone className="w-10 h-10 text-green-400" />
                </div>
                <h2 className="text-xl font-semibold mb-2">
                  {callPhase === 'connecting' ? 'Connecting...' : 'Call Active'}
                </h2>
                {callPhase === 'active' ? (
                  <CallTimer className="block text-3xl text-green-400 mb-2" />
                ) : null}
                <p className="text-white/50 text-sm mb-8">
                  {callPhase === 'active' ? 'Voice call in progress' : 'Setting up secure voice…'}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={toggleMute}
                    className={`flex-1 py-3 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-colors ${
                      muted
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-white/10 text-white hover:bg-white/15'
                    }`}
                  >
                    {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    {muted ? 'Unmute' : 'Mute'}
                  </button>
                  <button
                    onClick={endActiveCall}
                    className="flex-1 py-3 rounded-2xl bg-red-600 text-white font-semibold flex items-center justify-center gap-2"
                  >
                    <PhoneOff className="w-4 h-4" /> End Call
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
