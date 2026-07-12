export type QrArtStyle =
  | 'classic'
  | 'dots'
  | 'rounded'
  | 'luxury-gold'
  | 'floral'
  | 'sunset'
  | 'neon-pop'
  | 'ocean'
  | 'coffee'
  | 'photo'
  | 'photo-dots';

export type StickerImageMode = 'none' | 'background' | 'qr-fill';

export type SocialPlatform = 'instagram' | 'x' | 'youtube' | 'whatsapp' | 'custom';

export interface StickerSocial {
  platform: SocialPlatform;
  handle: string;
}

export interface StickerCustomization {
  imageMode: StickerImageMode;
  artStyle: QrArtStyle;
  headline: string;
  tagline: string;
  aiPrompt: string;
  aiDesigned: boolean;
  qrReferenceImage: string | null;
  centerLogoImage: string | null;
  socials: StickerSocial[];
  qrDark: string;
  qrLight: string;
  overlayOpacity: number;
  showUrl: boolean;
  showBadge: boolean;
}

export const DEFAULT_STICKER_CUSTOMIZATION: StickerCustomization = {
  imageMode: 'none',
  artStyle: 'classic',
  headline: 'Scan to Contact',
  tagline: 'Need Owner? Move Vehicle?',
  aiPrompt: '',
  aiDesigned: false,
  qrReferenceImage: null,
  centerLogoImage: null,
  socials: [],
  qrDark: '#0f172a',
  qrLight: '#ffffff',
  overlayOpacity: 0.55,
  showUrl: false,
  showBadge: true,
};

const VALID_ART_STYLES = new Set([
  'classic', 'dots', 'rounded', 'luxury-gold', 'floral', 'sunset',
  'neon-pop', 'ocean', 'coffee', 'photo', 'photo-dots',
]);

export function parseStickerCustomization(raw: unknown): StickerCustomization {
  let parsed: Partial<StickerCustomization> = {};
  if (typeof raw === 'string' && raw.trim()) {
    try {
      parsed = JSON.parse(raw) as Partial<StickerCustomization>;
    } catch {
      parsed = {};
    }
  } else if (raw && typeof raw === 'object') {
    parsed = raw as Partial<StickerCustomization>;
  }

  const socials = Array.isArray(parsed.socials)
    ? parsed.socials
        .filter((s) => s && typeof s.handle === 'string' && s.handle.trim())
        .slice(0, 3)
        .map((s) => ({
          platform: (['instagram', 'x', 'youtube', 'whatsapp', 'custom'].includes(s.platform)
            ? s.platform
            : 'custom') as SocialPlatform,
          handle: String(s.handle).trim().slice(0, 64),
        }))
    : [];

  return {
    imageMode:
      parsed.imageMode === 'background' || parsed.imageMode === 'qr-fill' || parsed.imageMode === 'none'
        ? parsed.imageMode
        : DEFAULT_STICKER_CUSTOMIZATION.imageMode,
    artStyle: VALID_ART_STYLES.has(parsed.artStyle as string)
      ? (parsed.artStyle as QrArtStyle)
      : parsed.imageMode === 'qr-fill'
        ? 'photo'
        : DEFAULT_STICKER_CUSTOMIZATION.artStyle,
    headline:
      (parsed.headline ?? DEFAULT_STICKER_CUSTOMIZATION.headline).trim().slice(0, 40) ||
      DEFAULT_STICKER_CUSTOMIZATION.headline,
    tagline:
      (parsed.tagline ?? DEFAULT_STICKER_CUSTOMIZATION.tagline).trim().slice(0, 60) ||
      DEFAULT_STICKER_CUSTOMIZATION.tagline,
    aiPrompt: (parsed.aiPrompt ?? '').trim().slice(0, 300),
    aiDesigned: typeof parsed.aiDesigned === 'boolean' ? parsed.aiDesigned : false,
    qrReferenceImage:
      typeof parsed.qrReferenceImage === 'string' && parsed.qrReferenceImage.startsWith('data:image/')
        ? parsed.qrReferenceImage
        : null,
    centerLogoImage:
      typeof parsed.centerLogoImage === 'string' && parsed.centerLogoImage.startsWith('data:image/')
        ? parsed.centerLogoImage
        : null,
    socials,
    qrDark: /^#[0-9a-fA-F]{6}$/.test(parsed.qrDark ?? '')
      ? parsed.qrDark!
      : DEFAULT_STICKER_CUSTOMIZATION.qrDark,
    qrLight: /^#[0-9a-fA-F]{6}$/.test(parsed.qrLight ?? '')
      ? parsed.qrLight!
      : DEFAULT_STICKER_CUSTOMIZATION.qrLight,
    overlayOpacity:
      typeof parsed.overlayOpacity === 'number'
        ? Math.min(0.85, Math.max(0, parsed.overlayOpacity))
        : DEFAULT_STICKER_CUSTOMIZATION.overlayOpacity,
    showUrl: typeof parsed.showUrl === 'boolean' ? parsed.showUrl : DEFAULT_STICKER_CUSTOMIZATION.showUrl,
    showBadge:
      typeof parsed.showBadge === 'boolean' ? parsed.showBadge : DEFAULT_STICKER_CUSTOMIZATION.showBadge,
  };
}
