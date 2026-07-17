import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { APP_NAME } from '../lib/brand';

type ScannerLandingHeroProps = {
  /** Hide cinematic layers when camera scanner is open */
  hidden?: boolean;
};

export default function ScannerLandingHero({ hidden }: ScannerLandingHeroProps) {
  const reduceMotion = useReducedMotion();
  const [videoReady, setVideoReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    if (reduceMotion) setVideoFailed(true);
  }, [reduceMotion]);

  const showVideo = !reduceMotion && !videoFailed;
  const cinematic = !reduceMotion;

  return (
    <div
      aria-hidden
      className={`scanner-hero pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-500 ${
        hidden ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Base — asphalt + ambient glow */}
      <div className="absolute inset-0 bg-[#030303]" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/90" />

      {/* Video layer */}
      {showVideo && (
        <video
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
            videoReady ? 'opacity-70' : 'opacity-0'
          }`}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          onCanPlay={() => setVideoReady(true)}
          onError={() => setVideoFailed(true)}
        >
          <source src="/hero-drift.webm" type="video/webm" />
          <source src="/hero-drift.mp4" type="video/mp4" />
        </video>
      )}

      {/* CSS cinematic fallback when video unavailable */}
      {(videoFailed || reduceMotion) && (
        <>
          <div className="scanner-hero-aurora absolute inset-0" />
          <div className="scanner-hero-grid absolute inset-0 opacity-[0.07]" />
          <div className="scanner-hero-headlight scanner-hero-headlight-a" />
          <div className="scanner-hero-headlight scanner-hero-headlight-b" />
        </>
      )}

      {/* Speed lines + tire smoke (always on unless reduced motion) */}
      {cinematic && (
        <>
          <div className="scanner-hero-speedlines absolute inset-0" />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={`scanner-hero-smoke scanner-hero-smoke-${i + 1}`} />
          ))}
          <div className="scanner-hero-skid absolute inset-0" />
        </>
      )}

      {/* Color grade + vignette */}
      <div className="absolute inset-0 bg-gradient-to-tr from-blue-950/40 via-transparent to-amber-950/30 mix-blend-overlay" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.55)_70%,rgba(0,0,0,0.92)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-[#050505] via-[#050505]/80 to-transparent" />
      <div className="scanner-hero-grain absolute inset-0 opacity-[0.045]" />

      {/* Brand reveal — synced to drift beat */}
      <div className="absolute inset-x-0 top-[12%] sm:top-[14%] flex flex-col items-center px-6 text-center">
        <motion.div
          initial={cinematic ? { opacity: 0, scale: 0.82, y: 24, filter: 'blur(12px)' } : false}
          animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
          transition={
            cinematic
              ? { delay: 1.05, duration: 0.85, type: 'spring', stiffness: 120, damping: 18 }
              : { duration: 0 }
          }
          className="relative"
        >
          <motion.div
            initial={cinematic ? { opacity: 0, scaleX: 0 } : false}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={cinematic ? { delay: 0.95, duration: 0.35, ease: [0.22, 1, 0.36, 1] } : { duration: 0 }}
            className="absolute -inset-x-8 top-1/2 h-px bg-gradient-to-r from-transparent via-amber-400/80 to-transparent origin-center"
          />
          <img
            src="/brand-logo.png"
            alt=""
            className="mx-auto mb-3 h-11 w-11 sm:h-12 sm:w-12 rounded-2xl object-contain drop-shadow-[0_0_24px_rgba(59,130,246,0.45)]"
          />
          <h1 className="scanner-hero-title font-display text-[2.35rem] sm:text-5xl font-bold tracking-tight">
            {APP_NAME}
          </h1>
        </motion.div>

        <motion.p
          initial={cinematic ? { opacity: 0, y: 12 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={cinematic ? { delay: 1.55, duration: 0.6, ease: 'easeOut' } : { duration: 0 }}
          className="mt-3 max-w-xs text-sm sm:text-base text-white/55 font-medium tracking-wide"
        >
          Scan the sticker. Reach the owner.
        </motion.p>

        {cinematic && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.6, 0] }}
            transition={{ delay: 0.88, duration: 0.45, ease: 'easeOut' }}
            className="absolute top-[calc(100%+0.5rem)] h-16 w-16 rounded-full bg-amber-400/25 blur-2xl"
          />
        )}
      </div>
    </div>
  );
}
