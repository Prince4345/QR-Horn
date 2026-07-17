import { motion, AnimatePresence } from 'motion/react';
import {
  Camera,
  Car,
  Loader2,
  MessageSquare,
  QrCode,
  Search,
  XCircle,
} from 'lucide-react';
import { APP_NAME } from '../lib/brand';
import type { ChatSession } from '../lib/chatClient';
import ScannerLandingHero from './ScannerLandingHero';
import QrCameraScanner from './QrCameraScanner';

type EntryTab = 'qr' | 'plate';

type ScannerLandingPageProps = {
  entryTab: EntryTab;
  setEntryTab: (tab: EntryTab) => void;
  setError: (error: string | null) => void;
  plateInput: string;
  setPlateInput: (value: string) => void;
  loadByPlate: (plate: string) => void;
  error: string | null;
  showCamera: boolean;
  setShowCamera: (open: boolean) => void;
  handleCameraScan: (code: string) => void;
  landingChatRestore: ChatSession | null;
  landingChatLoading: boolean;
  landingUnreadCount: number;
  ownerReplyBanner: { preview: string } | null;
  resumeLandingChat: () => void | Promise<void>;
};

const STEPS = [
  { n: '01', title: 'Scan', desc: 'Point at the QR sticker' },
  { n: '02', title: 'Reason', desc: 'Move, lights, parking…' },
  { n: '03', title: 'Connect', desc: 'Chat or call the owner' },
] as const;

export default function ScannerLandingPage({
  entryTab,
  setEntryTab,
  setError,
  plateInput,
  setPlateInput,
  loadByPlate,
  error,
  showCamera,
  setShowCamera,
  handleCameraScan,
  landingChatRestore,
  landingChatLoading,
  landingUnreadCount,
  ownerReplyBanner,
  resumeLandingChat,
}: ScannerLandingPageProps) {
  return (
    <>
      <ScannerLandingHero hidden={showCamera} />

      <div className="relative z-10 flex min-h-[100dvh] flex-col">
        {/* Hero copy — bottom-left, never blocks center of video */}
        <div className="flex flex-1 flex-col justify-end px-5 pb-4 pt-[calc(5rem+env(safe-area-inset-top))] sm:px-8 sm:pb-6 lg:px-12 lg:pb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className="max-w-xl lg:max-w-lg"
          >
            <div className="mb-5 flex items-center gap-3">
              <img
                src="/brand-logo.png"
                alt=""
                className="h-10 w-10 rounded-xl object-contain shadow-lg shadow-black/40 sm:h-11 sm:w-11"
              />
              <span className="font-display text-xl font-semibold tracking-tight text-white sm:text-2xl">
                {APP_NAME}
              </span>
            </div>

            <h1 className="font-display text-[2rem] font-bold leading-[1.1] tracking-tight text-white sm:text-4xl lg:text-[2.75rem]">
              Reach the owner.
              <span className="block text-white/55">Without the awkward hunt.</span>
            </h1>

            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/55 sm:text-base">
              Scan a {APP_NAME} sticker on any vehicle — contact the owner privately via chat or call.
            </p>

            <ul className="mt-6 hidden gap-6 sm:flex">
              {STEPS.map((step) => (
                <li key={step.n} className="flex items-start gap-2.5">
                  <span className="font-display text-xs font-bold text-blue-400/90">{step.n}</span>
                  <div>
                    <p className="text-sm font-medium text-white/90">{step.title}</p>
                    <p className="text-xs text-white/40">{step.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>

        {/* Bottom action dock — slim, anchored, not a center modal */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5, ease: 'easeOut' }}
          className="px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-12"
        >
          <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-white/12 bg-black/55 shadow-[0_-8px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:rounded-3xl">
            {(landingChatRestore || landingChatLoading) && (
              <div className="border-b border-white/10 px-4 py-3 sm:px-5">
                {landingChatLoading && !landingChatRestore ? (
                  <div className="flex items-center gap-2 text-sm text-violet-200/80">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking for an open chat…
                  </div>
                ) : landingChatRestore ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600/30">
                        <MessageSquare className="h-4 w-4 text-violet-200" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">
                          {landingUnreadCount > 0 ? 'Owner replied' : 'Continue chat'} ·{' '}
                          {landingChatRestore.vehicleNumber}
                        </p>
                        {landingUnreadCount > 0 && ownerReplyBanner && (
                          <p className="truncate text-xs text-violet-200/70">
                            “{ownerReplyBanner.preview}”
                          </p>
                        )}
                      </div>
                      {landingUnreadCount > 0 && (
                        <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold">
                          {landingUnreadCount > 9 ? '9+' : landingUnreadCount}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void resumeLandingChat()}
                      disabled={landingChatLoading}
                      className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                    >
                      Open chat
                    </button>
                  </div>
                ) : null}
              </div>
            )}

            <div className="flex border-b border-white/10">
              <button
                type="button"
                onClick={() => {
                  setEntryTab('qr');
                  setError(null);
                }}
                className={`flex flex-1 items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                  entryTab === 'qr' ? 'bg-white/8 text-white' : 'text-white/45 hover:text-white/80'
                }`}
              >
                <QrCode className="h-4 w-4" />
                Scan QR
              </button>
              <button
                type="button"
                onClick={() => {
                  setEntryTab('plate');
                  setError(null);
                }}
                className={`flex flex-1 items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                  entryTab === 'plate' ? 'bg-white/8 text-white' : 'text-white/45 hover:text-white/80'
                }`}
              >
                <Car className="h-4 w-4" />
                Plate number
              </button>
            </div>

            <div className="p-4 sm:p-5">
              <AnimatePresence mode="wait">
                {entryTab === 'qr' ? (
                  <motion.div
                    key="qr"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white sm:text-base">Scan the vehicle sticker</p>
                      <p className="text-xs text-white/45 sm:text-sm">
                        Opens your camera — works on any {APP_NAME} QR.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCamera(true)}
                      className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500 sm:min-w-[180px]"
                    >
                      <Camera className="h-4 w-4" />
                      Open scanner
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="plate"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3"
                  >
                    <input
                      value={plateInput}
                      onChange={(e) => setPlateInput(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === 'Enter' && loadByPlate(plateInput)}
                      placeholder="e.g. DL 8C AA 1111"
                      className="min-w-0 flex-1 rounded-xl border border-white/12 bg-white/5 px-4 py-3 font-mono text-sm tracking-wider text-white outline-none placeholder:text-white/30 focus:border-blue-500/50 sm:text-base"
                    />
                    <button
                      type="button"
                      onClick={() => loadByPlate(plateInput)}
                      disabled={!plateInput.trim()}
                      className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-45 sm:min-w-[140px]"
                    >
                      <Search className="h-4 w-4" />
                      Find
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {error && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                  <p className="text-xs text-red-300 sm:text-sm">{error}</p>
                </div>
              )}
            </div>
          </div>

          <p className="mt-3 text-center text-[11px] text-white/35 sm:text-xs">
            Vehicle owner? Switch to Dashboard to manage stickers and messages.
          </p>
        </motion.div>
      </div>

      {showCamera && (
        <QrCameraScanner onScan={handleCameraScan} onClose={() => setShowCamera(false)} />
      )}
    </>
  );
}
