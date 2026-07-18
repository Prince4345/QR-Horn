import { APP_NAME } from '../lib/brand';
import { DEFAULT_BRAND_LOGO_URL } from '../lib/brandLogo';

const SIZE_CLASS = {
  xs: 'h-5 w-5',
  nav: 'h-10 w-10 sm:h-11 sm:w-11',
  sm: 'h-8 w-8 sm:h-9 sm:w-9',
  md: 'h-16 w-16 sm:h-20 sm:w-20',
  lg: 'h-20 w-20 sm:h-24 sm:w-24',
  xl: 'h-28 w-28 sm:h-32 sm:w-32',
} as const;

type BrandLogoProps = {
  size?: keyof typeof SIZE_CLASS;
  className?: string;
  glow?: boolean;
};

/** Circular badge — full image visible inside the circle. */
export default function BrandLogo({ size = 'md', className = '', glow = false }: BrandLogoProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${SIZE_CLASS[size]} ${
        glow ? 'drop-shadow-[0_0_10px_rgba(255,0,127,0.4)]' : ''
      } ${className}`.trim()}
    >
      <img
        src={DEFAULT_BRAND_LOGO_URL}
        alt={APP_NAME}
        className="h-full w-full object-contain"
        draggable={false}
      />
    </span>
  );
}
