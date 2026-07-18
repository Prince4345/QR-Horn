type BrandWordmarkProps = {
  /** sm = header, lg = auth / hero */
  size?: 'sm' | 'lg';
  className?: string;
};

const SIZE = {
  sm: 'text-[1.35rem] sm:text-[1.65rem]',
  lg: 'text-3xl sm:text-4xl',
} as const;

/** Mixed-case ParksTAG — not Bebas Neue (which uppercases everything). */
export default function BrandWordmark({ size = 'sm', className = '' }: BrandWordmarkProps) {
  return (
    <span
      className={`font-sans font-bold leading-none tracking-tight ${SIZE[size]} ${className}`.trim()}
    >
      <span className="text-ink">Parks</span>
      <span className="text-brand">TAG</span>
    </span>
  );
}
