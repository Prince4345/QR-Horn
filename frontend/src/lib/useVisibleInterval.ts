import { useEffect, useRef } from 'react';

/** Run `fn` every `ms` while the document tab is visible. */
export function useVisibleInterval(fn: () => void, ms: number, enabled = true) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      if (document.visibilityState === 'visible') fnRef.current();
    };

    tick();
    const interval = window.setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [ms, enabled]);
}
