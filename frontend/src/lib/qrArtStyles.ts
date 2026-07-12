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

export interface ArtStylePreset {
  id: QrArtStyle;
  name: string;
  description: string;
  darkColor: string;
  lightColor: string;
  /** Optional two-stop gradient for the QR modules */
  moduleColors?: [string, string];
  /** Colour for the three corner finder "eyes" */
  eyeColor?: string;
  /** Background gradient stops behind the QR (defaults to lightColor) */
  bgColors?: [string, string];
  /** Scatter playful accent dots in the margin like branded stickers */
  cornerAccent?: boolean;
  moduleShape: 'square' | 'dot' | 'rounded';
  needsPhoto?: boolean;
  preview: string; // gradient for UI swatch
}

export const QR_ART_PRESETS: ArtStylePreset[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Clean black & white',
    darkColor: '#0f172a',
    lightColor: '#ffffff',
    eyeColor: '#0f172a',
    moduleShape: 'square',
    preview: 'linear-gradient(135deg,#fff 50%,#0f172a 50%)',
  },
  {
    id: 'dots',
    name: 'Scan Me',
    description: 'Playful colourful dots',
    darkColor: '#2563eb',
    lightColor: '#ffffff',
    moduleColors: ['#2563eb', '#0ea5e9'],
    eyeColor: '#1d4ed8',
    bgColors: ['#ffffff', '#eff6ff'],
    cornerAccent: true,
    moduleShape: 'dot',
    preview: 'linear-gradient(135deg,#eff6ff,#2563eb,#f59e0b)',
  },
  {
    id: 'rounded',
    name: 'Soft Violet',
    description: 'Rounded violet modules',
    darkColor: '#6d28d9',
    lightColor: '#faf5ff',
    moduleColors: ['#7c3aed', '#a855f7'],
    eyeColor: '#6d28d9',
    bgColors: ['#faf5ff', '#f3e8ff'],
    moduleShape: 'rounded',
    preview: 'linear-gradient(135deg,#faf5ff,#7c3aed)',
  },
  {
    id: 'luxury-gold',
    name: 'Luxury Gold',
    description: 'Gold on black — premium',
    darkColor: '#d4af37',
    lightColor: '#0a0a0a',
    moduleColors: ['#f5d472', '#c9a227'],
    eyeColor: '#e5c158',
    bgColors: ['#0a0a0a', '#1c1917'],
    moduleShape: 'dot',
    preview: 'linear-gradient(135deg,#0a0a0a,#c9a227)',
  },
  {
    id: 'floral',
    name: 'Floral Green',
    description: 'Nature green on cream',
    darkColor: '#1b4332',
    lightColor: '#f5f0e8',
    moduleColors: ['#2d6a4f', '#1b4332'],
    eyeColor: '#2d6a4f',
    bgColors: ['#f5f0e8', '#e9edc9'],
    cornerAccent: true,
    moduleShape: 'dot',
    preview: 'linear-gradient(135deg,#f5f0e8,#1b4332)',
  },
  {
    id: 'sunset',
    name: 'Sunset Wave',
    description: 'Warm orange & pink',
    darkColor: '#e85d04',
    lightColor: '#fff7ed',
    moduleColors: ['#f97316', '#db2777'],
    eyeColor: '#ea580c',
    bgColors: ['#fff7ed', '#ffe4e6'],
    moduleShape: 'rounded',
    preview: 'linear-gradient(135deg,#fff7ed,#f97316,#db2777)',
  },
  {
    id: 'neon-pop',
    name: 'Neon Pop',
    description: 'Vibrant pink & purple',
    darkColor: '#d946ef',
    lightColor: '#fdf4ff',
    moduleColors: ['#d946ef', '#8b5cf6'],
    eyeColor: '#c026d3',
    bgColors: ['#fdf4ff', '#fae8ff'],
    cornerAccent: true,
    moduleShape: 'dot',
    preview: 'linear-gradient(135deg,#fdf4ff,#d946ef,#facc15)',
  },
  {
    id: 'ocean',
    name: 'Ocean Tech',
    description: 'Deep blue rounded',
    darkColor: '#0077b6',
    lightColor: '#e0f4ff',
    moduleColors: ['#0284c7', '#0077b6'],
    eyeColor: '#0369a1',
    bgColors: ['#e0f4ff', '#cffafe'],
    moduleShape: 'rounded',
    preview: 'linear-gradient(135deg,#e0f4ff,#0077b6)',
  },
  {
    id: 'coffee',
    name: 'Coffee Warm',
    description: 'Terracotta & cream',
    darkColor: '#9c4221',
    lightColor: '#fefae0',
    moduleColors: ['#bc6c25', '#9c4221'],
    eyeColor: '#9c4221',
    bgColors: ['#fefae0', '#faedcd'],
    cornerAccent: true,
    moduleShape: 'dot',
    preview: 'linear-gradient(135deg,#fefae0,#bc6c25)',
  },
  {
    id: 'photo',
    name: 'Photo QR',
    description: 'Your photo fills the QR',
    darkColor: '#111827',
    lightColor: '#ffffff',
    moduleShape: 'square',
    needsPhoto: true,
    preview: 'linear-gradient(135deg,#6366f1,#ec4899)',
  },
  {
    id: 'photo-dots',
    name: 'Photo Dots',
    description: 'Photo colours in dots',
    darkColor: '#111827',
    lightColor: '#ffffff',
    moduleShape: 'dot',
    needsPhoto: true,
    preview: 'linear-gradient(135deg,#22d3ee,#a855f7)',
  },
];

export function getArtPreset(id: string): ArtStylePreset {
  return QR_ART_PRESETS.find((p) => p.id === id) ?? QR_ART_PRESETS[0];
}
