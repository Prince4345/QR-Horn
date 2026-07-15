import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, X } from 'lucide-react';
import { useChat } from '../context/ChatContext';

export default function IncomingChatModal() {
  const { incomingChat, openChat, dismissIncoming } = useChat();

  return (
    <AnimatePresence>
      {incomingChat && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[95] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
        >
          <motion.div
            initial={{ y: 40, scale: 0.96 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 40, opacity: 0 }}
            className="w-full max-w-sm bg-zinc-900 border border-white/10 rounded-3xl p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center shrink-0">
                <MessageSquare className="w-6 h-6 text-blue-400" />
              </div>
              <button
                onClick={dismissIncoming}
                className="p-2 rounded-full hover:bg-white/10 text-slate-400"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <h2 className="text-lg font-semibold mb-1">New message</h2>
            <p className="text-white/60 text-sm mb-0.5">{incomingChat.vehicleName}</p>
            <p className="text-white/40 text-xs font-mono mb-3">{incomingChat.vehicleNumber}</p>
            <p className="text-white/80 text-sm bg-white/5 rounded-xl p-3 mb-6 line-clamp-3">
              {incomingChat.preview}
            </p>
            <div className="flex gap-3">
              <button
                onClick={dismissIncoming}
                className="flex-1 py-3 rounded-2xl bg-white/10 text-slate-300 font-medium"
              >
                Later
              </button>
              <button
                onClick={() => void openChat(incomingChat.sessionId)}
                className="flex-1 py-3 rounded-2xl bg-blue-600 text-white font-semibold"
              >
                Reply
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
