import QRCode from 'qrcode';
import { getArtPreset, type ArtStylePreset, type QrArtStyle } from './qrArtStyles';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function isFinderZone(row: number, col: number, size: number): boolean {
  const inCorner = (r: number, c: number) => r >= 0 && r < 7 && c >= 0 && c < 7;
  return inCorner(row, col) || inCorner(row, col - (size - 7)) || inCorner(row - (size - 7), col);
}

/** Center badge half-width as a fraction of the rendered QR canvas size. */
const LOGO_HALF_RATIO = 0.165;
/** Inner padding inside the white badge (fraction of half-width). */
const LOGO_INNER_PAD_RATIO = 0.03;

/** Modules cleared for the center logo (matches drawCenterLogo badge; safe with H correction). */
function logoModuleHalfExtent(count: number, margin: number): number {
  return (count + margin * 2) * LOGO_HALF_RATIO;
}

function isLogoZone(row: number, col: number, count: number, margin: number): boolean {
  const c = count / 2;
  const r = logoModuleHalfExtent(count, margin);
  return Math.abs(row + 0.5 - c) <= r && Math.abs(col + 0.5 - c) <= r;
}

function drawModule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cell: number,
  shape: 'square' | 'dot' | 'rounded'
) {
  if (shape === 'dot') {
    ctx.beginPath();
    ctx.arc(x + cell / 2, y + cell / 2, cell * 0.42, 0, Math.PI * 2);
    ctx.fill();
  } else if (shape === 'rounded') {
    const r = cell * 0.32;
    ctx.beginPath();
    ctx.roundRect(x, y, cell + 0.6, cell + 0.6, r);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, cell + 0.6, cell + 0.6);
  }
}

/** Rounded, coloured finder eye like branded QR products. */
function drawFinderEye(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  cell: number,
  eyeColor: string,
  bg: string,
  shape: 'square' | 'dot' | 'rounded'
) {
  const outer = cell * 7;
  const radius = shape === 'square' ? cell * 0.6 : cell * 2.3;

  ctx.fillStyle = eyeColor;
  ctx.beginPath();
  ctx.roundRect(x0, y0, outer, outer, radius);
  ctx.fill();

  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x0 + cell, y0 + cell, cell * 5, cell * 5, radius * 0.7);
  ctx.fill();

  ctx.fillStyle = eyeColor;
  ctx.beginPath();
  ctx.roundRect(x0 + cell * 2, y0 + cell * 2, cell * 3, cell * 3, radius * 0.45);
  ctx.fill();
}

function drawCornerAccents(
  ctx: CanvasRenderingContext2D,
  size: number,
  margin: number,
  colors: [string, string]
) {
  const spots = [
    { x: margin * 0.4, y: margin * 0.4 },
    { x: size - margin * 0.4, y: margin * 0.45 },
    { x: margin * 0.45, y: size - margin * 0.4 },
    { x: size - margin * 0.45, y: size - margin * 0.4 },
  ];
  spots.forEach((s, i) => {
    const base = i % 2 === 0 ? colors[0] : colors[1];
    for (let k = 0; k < 5; k++) {
      const r = margin * (0.05 + Math.random() * 0.12);
      const ox = s.x + (Math.random() - 0.5) * margin * 0.7;
      const oy = s.y + (Math.random() - 0.5) * margin * 0.7;
      ctx.globalAlpha = 0.35 + Math.random() * 0.5;
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(ox, oy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.globalAlpha = 1;
}

async function drawCenterLogo(
  ctx: CanvasRenderingContext2D,
  size: number,
  logoColor: string,
  logoText: string,
  logoImageDataUrl?: string | null
) {
  const cx = size / 2;
  const half = size * LOGO_HALF_RATIO;
  const pad = half * LOGO_INNER_PAD_RATIO;
  const box = half * 2;
  const inner = box - pad * 2;

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(cx - half, cx - half, box, box, half * 0.18);
  ctx.fill();
  ctx.restore();

  if (logoImageDataUrl) {
    try {
      const img = await loadImage(logoImageDataUrl);
      const scale = Math.max(inner / img.width, inner / img.height) * 1.12;
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(cx - inner / 2, cx - inner / 2, inner, inner, inner * 0.12);
      ctx.clip();
      ctx.drawImage(img, cx - w / 2, cx - h / 2, w, h);
      ctx.restore();
      return;
    } catch {
      // fall through to letter
    }
  }

  const letterHalf = half - pad;
  ctx.fillStyle = logoColor;
  ctx.beginPath();
  ctx.roundRect(cx - letterHalf, cx - letterHalf, letterHalf * 2, letterHalf * 2, letterHalf * 0.35);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${letterHalf * 1.15}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((logoText || 'Q').charAt(0).toUpperCase(), cx, cx + letterHalf * 0.05);
}

async function renderPhotoQr(
  qr: QRCode.QRCode,
  size: number,
  imageDataUrl: string,
  moduleShape: 'square' | 'dot' | 'rounded',
  darkFallback: string,
  lightFallback: string,
  logoText?: string,
  logoImageDataUrl?: string | null
): Promise<string> {
  const moduleCount = qr.modules.size;
  const margin = 4;
  const total = moduleCount + margin * 2;
  const cell = size / total;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const image = await loadImage(imageDataUrl);

  ctx.fillStyle = lightFallback;
  ctx.fillRect(0, 0, size, size);

  const scale = Math.max(size / image.width, size / image.height);
  ctx.drawImage(
    image,
    (size - image.width * scale) / 2,
    (size - image.height * scale) / 2,
    image.width * scale,
    image.height * scale
  );

  const photo = document.createElement('canvas');
  photo.width = size;
  photo.height = size;
  const pctx = photo.getContext('2d', { willReadFrequently: true })!;
  pctx.drawImage(canvas, 0, 0);
  const pixels = pctx.getImageData(0, 0, size, size).data;

  ctx.fillStyle = lightFallback;
  ctx.fillRect(0, 0, size, size);

  const shape = moduleShape === 'square' ? 'dot' : moduleShape;

  const sampleAt = (col: number, row: number): [number, number, number] => {
    const px = Math.min(size - 1, Math.floor((col + margin + 0.5) * cell));
    const py = Math.min(size - 1, Math.floor((row + margin + 0.5) * cell));
    const idx = (py * size + px) * 4;
    return [pixels[idx], pixels[idx + 1], pixels[idx + 2]];
  };

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (!qr.modules.get(row, col)) continue;
      if (isFinderZone(row, col, moduleCount)) continue;
      if (isLogoZone(row, col, moduleCount, margin)) continue;
      const [r, g, b] = sampleAt(col, row);
      const lum = luminance(r, g, b);
      const darken = lum > 110 ? 0.55 : 0.15;
      ctx.fillStyle = `rgb(${Math.round(r * (1 - darken))},${Math.round(g * (1 - darken))},${Math.round(
        b * (1 - darken)
      )})`;
      drawModule(ctx, (col + margin) * cell, (row + margin) * cell, cell, shape);
    }
  }

  const eyes = [
    { r: 0, c: 0 },
    { r: 0, c: moduleCount - 7 },
    { r: moduleCount - 7, c: 0 },
  ];
  for (const e of eyes) {
    drawFinderEye(ctx, (e.c + margin) * cell, (e.r + margin) * cell, cell, darkFallback, lightFallback, shape);
  }

  await drawCenterLogo(ctx, size, darkFallback, logoText ?? 'Q', logoImageDataUrl);

  return canvas.toDataURL('image/png');
}

function renderStyledQr(
  qr: QRCode.QRCode,
  size: number,
  preset: ArtStylePreset,
  dark: string,
  light: string,
  logoText: string,
  moduleOverride?: string,
  bgOverride?: string,
  logoImageDataUrl?: string | null
): Promise<string> {
  const moduleCount = qr.modules.size;
  const margin = preset.cornerAccent ? 5 : 4;
  const total = moduleCount + margin * 2;
  const cell = size / total;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Background
  const bg = preset.bgColors;
  if (bgOverride) {
    ctx.fillStyle = bgOverride;
  } else if (bg) {
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, bg[0]);
    grad.addColorStop(1, bg[1]);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = light;
  }
  ctx.fillRect(0, 0, size, size);

  if (preset.cornerAccent) {
    drawCornerAccents(ctx, size, margin * cell, preset.moduleColors ?? [dark, dark]);
  }

  // Module fill — custom colour overrides the preset gradient
  if (moduleOverride) {
    ctx.fillStyle = moduleOverride;
  } else if (preset.moduleColors) {
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, preset.moduleColors[0]);
    grad.addColorStop(1, preset.moduleColors[1]);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = dark;
  }

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (!qr.modules.get(row, col)) continue;
      if (isFinderZone(row, col, moduleCount)) continue;
      if (isLogoZone(row, col, moduleCount, margin)) continue;
      drawModule(ctx, (col + margin) * cell, (row + margin) * cell, cell, preset.moduleShape);
    }
  }

  const eyeColor = moduleOverride ?? preset.eyeColor ?? dark;
  const eyeBg = bgOverride ?? (bg ? bg[0] : light);
  const eyes = [
    { r: 0, c: 0 },
    { r: 0, c: moduleCount - 7 },
    { r: moduleCount - 7, c: 0 },
  ];
  for (const e of eyes) {
    drawFinderEye(ctx, (e.c + margin) * cell, (e.r + margin) * cell, cell, eyeColor, eyeBg, preset.moduleShape);
  }

  return drawCenterLogo(ctx, size, eyeColor, logoText, logoImageDataUrl).then(() =>
    canvas.toDataURL('image/png')
  );
}

export async function renderArtisticQr(options: {
  text: string;
  size: number;
  style: QrArtStyle;
  imageDataUrl?: string | null;
  darkOverride?: string;
  lightOverride?: string;
  logoText?: string;
  logoImageDataUrl?: string | null;
}): Promise<string> {
  const { text, size, style, imageDataUrl, darkOverride, lightOverride, logoText, logoImageDataUrl } = options;
  const preset = getArtPreset(style);
  const dark = darkOverride ?? preset.darkColor;
  const light = lightOverride ?? preset.lightColor;
  const qr = QRCode.create(text, { errorCorrectionLevel: 'H' });

  if ((style === 'photo' || style === 'photo-dots') && imageDataUrl) {
    return renderPhotoQr(
      qr,
      size,
      imageDataUrl,
      preset.moduleShape,
      dark,
      light,
      logoText,
      logoImageDataUrl
    );
  }

  const moduleOverride =
    darkOverride && darkOverride.toLowerCase() !== preset.darkColor.toLowerCase() ? darkOverride : undefined;
  const bgOverride =
    lightOverride && lightOverride.toLowerCase() !== preset.lightColor.toLowerCase() ? lightOverride : undefined;

  return renderStyledQr(
    qr,
    size,
    preset,
    dark,
    light,
    logoText ?? 'Q',
    moduleOverride,
    bgOverride,
    logoImageDataUrl
  );
}
