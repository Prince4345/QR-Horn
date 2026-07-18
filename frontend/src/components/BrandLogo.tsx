import { APP_NAME } from '../lib/brand';
import { DEFAULT_BRAND_LOGO_URL } from '../lib/brandLogo';

const SIZE_CLASS = {
  xs: 'h-5 w-5',
  sm: 'h-7 w-7 sm:h-8 sm:w-8',
  md: 'h-12 w-12 sm:h-14 sm:w-14',
  lg: 'h-16 w-16 sm:h-20 sm:w-20',
  xl: 'h-24 w-24',
} as const;

type BrandLogoProps = {
  size?: keyof typeof SIZE_CLASS;
  className?: string;
};

export default function BrandLogo({ size = 'md', className = '' }: BrandLogoProps) {
  return (
    <img
      src={DEFAULT_BRAND_LOGO_URL}
      alt={APP_NAME}
      className={`rounded-full object-cover ${SIZE_CLASS[size]} ${className}`.trim()}
    />
  );
}
