import { motion } from 'motion/react';
import { Search } from 'lucide-react';
import LoadingDots from './LoadingDots';

type PlateLookupLoadingProps = {
  plate: string;
};

const SKELETON_WIDTHS = ['72%', '55%', '68%'] as const;

export default function PlateLookupLoading({ plate }: PlateLookupLoadingProps) {
  return (
    <div className="flex flex-col items-center px-4 pt-[calc(4.5rem+env(safe-area-inset-top))]">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 sm:rounded-[40px] sm:p-10"
      >
        <div className="flex flex-col items-center text-center">
          <motion.div
            className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Search className="h-7 w-7 text-brand" />
          </motion.div>

          <p className="text-faint text-[10px] font-bold uppercase tracking-widest">Plate lookup</p>
          <motion.p
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.08 }}
            className="mt-2 font-mono text-xl tracking-widest text-ink sm:text-2xl"
          >
            {plate}
          </motion.p>

          <p className="mt-4 flex items-center justify-center gap-1.5 text-sm text-muted">
            <span>Searching registry</span>
            <LoadingDots size="sm" />
          </p>
        </div>

        <div className="mt-8 space-y-3">
          {SKELETON_WIDTHS.map((width, i) => (
            <motion.div
              key={width}
              className="mx-auto h-3 rounded-full bg-soft"
              style={{ width }}
              animate={{ opacity: [0.35, 0.75, 0.35] }}
              transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}
