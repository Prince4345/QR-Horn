/** Default business logo embedded in the center of vehicle QR stickers. */
export const DEFAULT_BRAND_LOGO_URL = '/brand-logo.png';

export function resolveCenterLogoUrl(customLogo: string | null | undefined): string | null {
  if (customLogo?.startsWith('data:image/')) return customLogo;
  return DEFAULT_BRAND_LOGO_URL;
}
