import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { APP_NAME } from '../lib/brand';

type ScannerLandingHeroProps = {
  hidden?: boolean;
};

export default function ScannerLandingHero({ hidden }: ScannerLandingHeroProps) {
  const reduceMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [showBrand, setShowBrand] = useState(false);

  useEffect(() => {
    if (reduceMotion) setShowBrand(true);
  }, [reduceMotion]);

  const onTimeUpdate = () => {
    const t = videoRef.current?.currentTime ?? 0;
    if (t >= 1.2 && !showBrand) setShowBrand(true);
  };

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden bg-black transition-opacity duration-300 ${
        hidden ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <video
        ref={videoRef}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
          ready ? 'opacity-100' : 'opacity-0'
        }`}
        src="/hero-drift.mp4"
        autoPlay={!reduceMotion}
        loop={!reduceMotion}
        muted
        playsInline
        preload="auto"
        onCanPlay={() => setReady(true)}
        onTimeUpdate={reduceMotion ? undefined : onTimeUpdate}
      />

      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/10 to-black/85" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.65)_100%)]" />

      <div className="absolute inset-x-0 top-[10%] sm:top-[12%] flex flex-col items-center px-6 text-center">
        <motion.div
          initial={false}
          animate={
            showBrand
              ? { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }
              : { opacity: 0, y: 18, scale: 0.94, filter: 'blur(8px)' }
          }
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
        >
          <img
            src="/brand-logo.png"
            alt=""
            className="mx-auto mb-3 h-11 w-11 sm:h-12 sm:w-12 rounded-2xl object-contain drop-shadow-[0_8px_32px_rgba(0,0,0,0.8)]"
          />
          <h1 className="font-display text-[2.35rem] sm:text-5xl font-bold tracking-tight text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.9)]">
            {APP_NAME}
          </h1>
        </motion.div>

        <motion.p
          initial={false}
          animate={showBrand ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
          transition={{ duration: 0.5, delay: showBrand ? 0.25 : 0 }}
          className="mt-3 max-w-xs text-sm sm:text-base text-white/70 font-medium tracking-wide drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]"
        >
          Scan the sticker. Reach the owner.
        </motion.p>
      </div>
    </div>
  );
}
