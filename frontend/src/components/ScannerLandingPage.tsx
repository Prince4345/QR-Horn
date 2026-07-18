import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowRight,
  BellRing,
  Camera,
  Car,
  Loader2,
  MessageSquare,
  Phone,
  QrCode,
  Search,
  Siren,
  Video,
  XCircle,
} from 'lucide-react';
import { APP_NAME } from '../lib/brand';
import type { ChatSession } from '../lib/chatClient';
import { useAuth } from '../context/AuthContext';
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
  onOpenJoin?: () => void;
};

const SERVICE_CARDS = [
  {
    n: '1',
    title: 'Scan the sticker',
    desc: 'Point your camera at any ParksTAG QR on a vehicle — no app install needed.',
  },
  {
    n: '2',
    title: 'Pick a reason',
    desc: 'Move vehicle, lights on, wrong parking, emergency — tell the owner why.',
  },
  {
    n: '3',
    title: 'Chat or call',
    desc: 'Reach the owner privately. Your number stays hidden; they get a push alert.',
  },
] as const;

const PROCESS_STEPS = [
  { n: '1', title: 'Scan', desc: 'Open the scanner or enter the plate number.' },
  { n: '2', title: 'Notify', desc: 'Choose why you need the owner right now.' },
  { n: '3', title: 'Connect', desc: 'Message or call — owner responds in-app.' },
] as const;

const FEATURE_CHIPS = [
  { icon: Siren, label: 'Theft / SOS priority alerts' },
  { icon: Video, label: 'Private chat — no numbers shared' },
  { icon: Phone, label: 'In-app voice call' },
  { icon: BellRing, label: 'Push & SMS notifications' },
] as const;

const FEATURE_IMAGES = [
  { src: '/landing-sticker.jpg', alt: 'QR sticker on a vehicle' },
  { src: '/landing-scan.jpg', alt: 'Scanning a ParksTAG sticker' },
  { src: '/landing-chat.jpg', alt: 'Private chat with the owner' },
  { src: '/landing-alert.jpg', alt: 'Vehicle alert at night' },
] as const;

const ABOUT_FAN = [
  { src: '/landing-park.jpg', h: 'h-36 sm:h-44', mt: 'mt-8' },
  { src: '/landing-sticker.jpg', h: 'h-44 sm:h-56', mt: 'mt-4' },
  { src: '/landing-scan.jpg', h: 'h-52 sm:h-64', mt: 'mt-0' },
  { src: '/landing-chat.jpg', h: 'h-44 sm:h-56', mt: 'mt-4' },
  { src: '/landing-alert.jpg', h: 'h-36 sm:h-44', mt: 'mt-8' },
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
  onOpenJoin,
}: ScannerLandingPageProps) {
  const { session, setupComplete } = useAuth();
  const isOwnerLoggedIn = Boolean(session && setupComplete);

  return (
    <>
      <ScannerLandingHero hidden={showCamera} />

      <div className="relative z-10 w-full">
        {/* —— Website hero: headline + scan tools —— */}
        <section className="relative bg-canvas/80">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14 lg:py-16">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mb-8 max-w-2xl"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand mb-3">
                {APP_NAME}
              </p>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight tracking-tight text-ink">
                Reach a vehicle owner —{' '}
                <span className="text-brand">without sharing numbers.</span>
              </h1>
              <p className="mt-4 text-sm sm:text-base leading-relaxed text-muted max-w-xl">
                Scan a {APP_NAME} sticker or enter a plate number. Chat or call privately in seconds.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05, duration: 0.45 }}
              className="overflow-hidden rounded-3xl bg-surface shadow-[0_8px_32px_rgba(26,26,26,0.08)] dark:shadow-[0_8px_32px_rgba(255,0,127,0.12)]"
              id="scan"
            >
              {(landingChatRestore || landingChatLoading) && (
                <div className="px-4 py-3 sm:px-5">
                  {landingChatLoading && !landingChatRestore ? (
                    <div className="flex items-center gap-2 text-sm text-muted">
                      <Loader2 className="h-4 w-4 animate-spin text-brand" />
                      Checking for an open chat…
                    </div>
                  ) : landingChatRestore ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10">
                          <MessageSquare className="h-4 w-4 text-brand" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink">
                            {landingUnreadCount > 0 ? 'Owner replied' : 'Continue chat'} ·{' '}
                            {landingChatRestore.vehicleNumber}
                          </p>
                          {landingUnreadCount > 0 && ownerReplyBanner && (
                            <p className="truncate text-xs text-muted">
                              “{ownerReplyBanner.preview}”
                            </p>
                          )}
                        </div>
                        {landingUnreadCount > 0 && (
                          <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-white">
                            {landingUnreadCount > 9 ? '9+' : landingUnreadCount}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void resumeLandingChat()}
                        disabled={landingChatLoading}
                        className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
                      >
                        Open chat
                      </button>
                    </div>
                  ) : null}
                </div>
              )}

              <div className="px-4 pt-2 sm:px-5 sm:pt-3">
                <div className="flex gap-1 rounded-2xl bg-soft p-1">
                <button
                  type="button"
                  onClick={() => {
                    setEntryTab('qr');
                    setError(null);
                  }}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all ${
                    entryTab === 'qr'
                      ? 'bg-surface text-brand shadow-sm'
                      : 'text-muted hover:text-ink'
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
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all ${
                    entryTab === 'plate'
                      ? 'bg-surface text-brand shadow-sm'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  <Car className="h-4 w-4" />
                  Plate number
                </button>
                </div>
              </div>

              <div className="p-5 sm:p-6">
                <AnimatePresence mode="wait">
                  {entryTab === 'qr' ? (
                    <motion.div
                      key="qr"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                    >
                      <div className="min-w-0 text-left">
                        <p className="text-base font-bold text-ink sm:text-lg">
                          Scan the vehicle sticker
                        </p>
                        <p className="mt-1 text-sm text-muted">
                          Opens your camera — works on any {APP_NAME} QR.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowCamera(true)}
                        className="flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-brand px-6 py-3 text-sm font-semibold text-white hover:bg-brand-dark sm:min-w-[180px]"
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
                        className="min-w-0 flex-1 rounded-2xl border border-line bg-soft px-4 py-3 font-mono text-sm tracking-wider text-ink outline-none placeholder:text-faint focus:border-brand/50 sm:text-base"
                      />
                      <button
                        type="button"
                        onClick={() => loadByPlate(plateInput)}
                        disabled={!plateInput.trim()}
                        className="flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-brand px-6 py-3 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-45 sm:min-w-[140px]"
                      >
                        <Search className="h-4 w-4" />
                        Find
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {error && (
                  <div className="mt-3 flex items-start gap-2 rounded-2xl border border-brand/25 bg-brand/5 px-3 py-2.5">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                    <p className="text-xs text-brand sm:text-sm">{error}</p>
                  </div>
                )}
              </div>
            </motion.div>

            {!isOwnerLoggedIn && (
              <p className="mt-5 text-sm text-muted">
                Vehicle owner?{' '}
                <button
                  type="button"
                  onClick={onOpenJoin}
                  className="font-semibold text-brand underline-offset-2 hover:underline"
                >
                  Sign in
                </button>{' '}
                to manage stickers &amp; messages.
              </p>
            )}
          </div>
        </section>

        {/* —— Numbered service cards —— */}
        <section id="how-it-works" className="px-4 pb-14 sm:px-8 lg:px-12">
          <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-3 sm:gap-5">
            {SERVICE_CARDS.map((card, i) => (
              <motion.article
                key={card.n}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ delay: i * 0.08 }}
                className="rounded-[28px] border border-white/60 dark:border-line bg-surface/90 p-6 shadow-[0_16px_40px_rgba(181,31,58,0.08)] dark:shadow-[0_16px_40px_rgba(255,0,127,0.12)] sm:p-7"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-blush text-sm font-bold text-brand">
                  {card.n}
                </div>
                <h3 className="text-lg font-bold text-ink">{card.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{card.desc}</p>
              </motion.article>
            ))}
          </div>
        </section>

        {/* —— Process steps —— */}
        <section className="bg-canvas px-4 py-14 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-5xl">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-ink sm:text-3xl">Step to contact process</h2>
              <p className="mt-2 text-sm text-muted">Three simple steps from sticker to conversation</p>
            </div>

            <div className="mt-10 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-center sm:gap-3">
              {PROCESS_STEPS.map((step, i) => (
                <div key={step.n} className="flex flex-1 items-center gap-3">
                  <article className="w-full rounded-[28px] border border-line bg-surface p-6 shadow-[0_12px_32px_rgba(26,26,26,0.05)]">
                    <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-blush text-sm font-bold text-brand">
                      {step.n}
                    </div>
                    <h3 className="font-bold text-ink">{step.title}</h3>
                    <p className="mt-1.5 text-sm text-muted">{step.desc}</p>
                  </article>
                  {i < PROCESS_STEPS.length - 1 && (
                    <ArrowRight className="hidden h-5 w-5 shrink-0 text-brand/40 sm:block" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* —— Feature spotlight —— */}
        <section className="px-4 py-14 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-5xl overflow-hidden rounded-[28px] border-t-[3px] border-t-brand bg-surface shadow-[0_20px_50px_rgba(26,26,26,0.07)]">
            <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_1.2fr] lg:gap-10 lg:p-10">
              <div className="grid grid-cols-2 gap-3">
                {FEATURE_IMAGES.map((img) => (
                  <div
                    key={img.src}
                    className="aspect-square overflow-hidden rounded-2xl bg-blush/80 shadow-sm ring-1 ring-brand/10"
                  >
                    <img
                      src={img.src}
                      alt={img.alt}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>

              <div>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-white">
                    <Siren className="h-5 w-5" />
                  </div>
                  <h2 className="text-xl font-bold text-brand sm:text-2xl">Emergency / SOS Alert</h2>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">
                  Flip on theft mode from your dashboard for louder, priority-style alerts when someone
                  contacts your vehicle. Stay reachable without exposing your number.
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {FEATURE_CHIPS.map(({ icon: Icon, label }) => (
                    <div
                      key={label}
                      className="flex items-center gap-3 rounded-xl border-l-4 border-l-ink/80 bg-soft/80 px-3 py-3"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-ink" />
                      <span className="text-xs font-medium text-ink sm:text-sm">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* —— About fan —— */}
        <section id="about" className="bg-surface px-4 py-16 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="text-2xl font-bold sm:text-3xl">
              <span className="text-brand">ABOUT</span>{' '}
              <span className="text-ink">{APP_NAME}</span>
            </h2>

            <div className="mt-10 flex items-end justify-center gap-2 sm:gap-3">
              {ABOUT_FAN.map((slot) => (
                <div
                  key={slot.src}
                  className={`${slot.h} ${slot.mt} w-14 overflow-hidden rounded-2xl bg-blush shadow-md ring-1 ring-brand/10 sm:w-24 sm:rounded-3xl`}
                >
                  <img
                    src={slot.src}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>

            <p className="mx-auto mt-8 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
              {APP_NAME} helps drivers and strangers connect safely. Put a verified QR sticker on your
              vehicle, get notified when someone needs you, and respond by chat or call — all without
              sharing personal phone numbers.
            </p>
          </div>
        </section>

        {!isOwnerLoggedIn && (
          <section className="px-4 py-12 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-8 lg:px-12">
            <button
              type="button"
              onClick={onOpenJoin}
              className="mx-auto block w-full max-w-5xl rounded-[28px] bg-brand px-6 py-8 text-center text-white shadow-lg shadow-brand/25 transition hover:bg-brand-dark sm:px-10"
            >
              <h2 className="font-display text-2xl tracking-[0.12em] sm:text-3xl">CONNECT</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-white/85">
                Join or sign in to manage your vehicle stickers and messages.
              </p>
            </button>
          </section>
        )}
      </div>

      {showCamera && (
        <QrCameraScanner onScan={handleCameraScan} onClose={() => setShowCamera(false)} />
      )}
    </>
  );
}
