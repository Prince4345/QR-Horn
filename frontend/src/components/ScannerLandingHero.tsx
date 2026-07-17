import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

type ScannerLandingHeroProps = {
  hidden?: boolean;
};

/** Full-viewport background video — no UI overlays; content lives in ScannerLandingPage. */
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
      if (document.visibilityState === 'visible' && video.paused && !video.ended) void start();
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
        className={`absolute inset-0 h-full w-full object-cover ${
          playing || reduceMotion ? 'opacity-100' : 'opacity-95'
        }`}
        src="/hero-drift.mp4"
        autoPlay
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
      />

      {/* Readability scrims — edges only, center stays clear for the car */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/30" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-transparent to-transparent lg:from-black/65 lg:via-black/10" />
    </div>
  );
}
