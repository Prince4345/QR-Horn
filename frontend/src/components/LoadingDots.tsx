import { motion } from 'motion/react';

type LoadingDotsProps = {
  size?: 'sm' | 'md';
  className?: string;
};

/** Bouncing dots — use inline after loading copy. */
export default function LoadingDots({ size = 'md', className = '' }: LoadingDotsProps) {
  const dot = size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2';

  return (
    <span className={`inline-flex items-center gap-1 ${className}`.trim()} aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className={`${dot} rounded-full bg-brand`}
          animate={{ y: [0, -7, 0], opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 0.75, repeat: Infinity, delay: i * 0.14, ease: 'easeInOut' }}
        />
      ))}
    </span>
  );
}
