import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { APP_NAME } from '../lib/brand';

type ScannerLandingHeroProps = {
  hidden?: boolean;
};

export default function ScannerLandingHero({ hidden }: ScannerLandingHeroProps) {
  const reduceMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (hidden || reduceMotion) return;

    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;

    const start = async () => {
      try {
        await video.play();
        setPlaying(true);
      } catch {
        setPlaying(true);
      }
    };

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      void start();
    } else {
      video.addEventListener('canplay', () => void start(), { once: true });
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && video.paused) void start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [hidden, reduceMotion]);

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-0 overflow-hidden bg-black transition-opacity duration-300 ${
        hidden ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <video
        ref={videoRef}
        className={`absolute inset-0 h-full w-full object-cover scale-105 ${
          playing || reduceMotion ? 'opacity-100' : 'opacity-90'
        }`}
        src="/hero-drift.mp4"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
      />

      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/15 to-black/80" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.5)_100%)]" />

      <div className="absolute inset-x-0 top-[max(5.5rem,calc(4.5rem+env(safe-area-inset-top)))] flex flex-col items-center px-6 text-center pointer-events-none">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="relative"
        >
          <img
            src="/brand-logo.png"
            alt=""
            className="mx-auto mb-3 h-12 w-12 sm:h-14 sm:w-14 rounded-2xl object-contain drop-shadow-[0_8px_32px_rgba(0,0,0,0.9)]"
          />
          <h1 className="font-display text-4xl sm:text-6xl font-bold tracking-tight text-white drop-shadow-[0_4px_32px_rgba(0,0,0,0.95)]">
            {APP_NAME}
          </h1>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mt-3 max-w-sm text-sm sm:text-base text-white/80 font-medium tracking-wide drop-shadow-[0_2px_16px_rgba(0,0,0,0.95)]"
        >
          Scan the sticker. Reach the owner instantly.
        </motion.p>
      </div>
    </div>
  );
}
