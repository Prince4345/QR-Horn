import type { QrArtStyle } from './qrArtStyles';
import { getArtPreset } from './qrArtStyles';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

function drawLeaf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  angle: number,
  color: string
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.5, size * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGoldCorner(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  flipX: number,
  flipY: number,
  color: string
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flipX, flipY);
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.06;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, size);
  ctx.lineTo(0, 0);
  ctx.lineTo(size, 0);
  ctx.stroke();
  ctx.lineWidth = size * 0.03;
  ctx.beginPath();
  ctx.moveTo(size * 0.15, size * 0.85);
  ctx.quadraticCurveTo(size * 0.5, size * 0.5, size * 0.85, size * 0.15);
  ctx.stroke();
  ctx.restore();
}

function drawHexCluster(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.12;
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i === 0) ctx.beginPath();
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
}

function drawCoffeeCup(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = size * 0.08;
  ctx.lineCap = 'round';
  const w = size * 0.7;
  const h = size * 0.55;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, cy - h / 2);
  ctx.lineTo(cx - w / 2 + w * 0.08, cy + h / 2);
  ctx.lineTo(cx + w / 2 - w * 0.08, cy + h / 2);
  ctx.lineTo(cx + w / 2, cy - h / 2);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + w / 2 + size * 0.12, cy, size * 0.18, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.12 + i * size * 0.12, cy - h / 2 - size * 0.05);
    ctx.quadraticCurveTo(cx - size * 0.12 + i * size * 0.12, cy - h / 2 - size * 0.35, cx, cy - h / 2 - size * 0.4);
    ctx.stroke();
  }
}

function applyFrameDecorations(
  ctx: CanvasRenderingContext2D,
  total: number,
  pad: number,
  style: QrArtStyle,
  preset: ReturnType<typeof getArtPreset>
) {
  const accent = preset.eyeColor ?? preset.darkColor;
  const accent2 = preset.moduleColors?.[1] ?? accent;

  switch (style) {
    case 'luxury-gold': {
      const g = pad * 0.35;
      ctx.strokeStyle = accent;
      ctx.lineWidth = pad * 0.08;
      ctx.strokeRect(g, g, total - g * 2, total - g * 2);
      ctx.lineWidth = pad * 0.03;
      ctx.strokeRect(g + pad * 0.15, g + pad * 0.15, total - (g + pad * 0.15) * 2, total - (g + pad * 0.15) * 2);
      const cs = pad * 0.9;
      drawGoldCorner(ctx, g, g, cs, 1, 1, accent);
      drawGoldCorner(ctx, total - g, g, cs, -1, 1, accent);
      drawGoldCorner(ctx, g, total - g, cs, 1, -1, accent);
      drawGoldCorner(ctx, total - g, total - g, cs, -1, -1, accent);
      break;
    }
    case 'floral': {
      const ls = pad * 0.55;
      drawLeaf(ctx, pad * 0.55, pad * 0.55, ls, -0.6, accent);
      drawLeaf(ctx, total - pad * 0.55, pad * 0.55, ls, -2.5, accent);
      drawLeaf(ctx, pad * 0.55, total - pad * 0.55, ls, 0.6, accent2);
      drawLeaf(ctx, total - pad * 0.55, total - pad * 0.55, ls, 2.5, accent2);
      drawLeaf(ctx, total / 2, pad * 0.35, ls * 0.7, -Math.PI / 2, accent);
      drawLeaf(ctx, total / 2, total - pad * 0.35, ls * 0.7, Math.PI / 2, accent2);
      break;
    }
    case 'coffee': {
      drawCoffeeCup(ctx, total / 2, total - pad * 0.45, pad * 0.9, accent);
      ctx.strokeStyle = accent;
      ctx.lineWidth = pad * 0.05;
      for (let i = 0; i < 8; i++) {
        const t = i / 7;
        const x = pad * 0.3 + t * (total - pad * 0.6);
        ctx.beginPath();
        ctx.moveTo(x, pad * 0.25);
        ctx.lineTo(x + pad * 0.05, pad * 0.35);
        ctx.stroke();
      }
      break;
    }
    case 'ocean': {
      const hr = pad * 0.35;
      drawHexCluster(ctx, pad * 0.5, pad * 0.5, hr, accent);
      drawHexCluster(ctx, total - pad * 0.5, pad * 0.5, hr, accent);
      drawHexCluster(ctx, pad * 0.5, total - pad * 0.5, hr, accent2);
      drawHexCluster(ctx, total - pad * 0.5, total - pad * 0.5, hr, accent2);
      break;
    }
    case 'neon-pop': {
      ctx.strokeStyle = accent;
      ctx.lineWidth = pad * 0.06;
      ctx.shadowColor = accent;
      ctx.shadowBlur = pad * 0.2;
      ctx.strokeRect(pad * 0.25, pad * 0.25, total - pad * 0.5, total - pad * 0.5);
      ctx.shadowBlur = 0;
      const dots = [
        [pad * 0.4, pad * 0.4],
        [total - pad * 0.4, pad * 0.4],
        [pad * 0.4, total - pad * 0.4],
        [total - pad * 0.4, total - pad * 0.4],
      ];
      dots.forEach(([x, y], i) => {
        ctx.fillStyle = i % 2 === 0 ? accent : accent2;
        ctx.beginPath();
        ctx.arc(x, y, pad * 0.12, 0, Math.PI * 2);
        ctx.fill();
      });
      break;
    }
    case 'sunset': {
      const grad = ctx.createLinearGradient(0, 0, total, total);
      grad.addColorStop(0, accent);
      grad.addColorStop(1, accent2);
      ctx.strokeStyle = grad;
      ctx.lineWidth = pad * 0.1;
      ctx.beginPath();
      for (let x = pad * 0.2; x < total - pad * 0.2; x += pad * 0.15) {
        const y = pad * 0.3 + Math.sin(x * 0.05) * pad * 0.15;
        if (x === pad * 0.2) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.beginPath();
      for (let x = pad * 0.2; x < total - pad * 0.2; x += pad * 0.15) {
        const y = total - pad * 0.3 + Math.sin(x * 0.05) * pad * 0.15;
        if (x === pad * 0.2) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      break;
    }
    case 'dots': {
      const colors = preset.moduleColors ?? [accent, accent2];
      [[pad * 0.35, pad * 0.35], [total - pad * 0.35, pad * 0.35], [pad * 0.35, total - pad * 0.35], [total - pad * 0.35, total - pad * 0.35]].forEach(
        ([x, y], i) => {
          for (let k = 0; k < 4; k++) {
            ctx.fillStyle = colors[k % 2];
            ctx.beginPath();
            ctx.arc(x + (k - 1.5) * pad * 0.1, y + (k % 2) * pad * 0.08, pad * 0.07, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      );
      break;
    }
    default:
      break;
  }
}

/** Wrap a rendered QR image in a themed decorative frame. */
export async function renderFramedQr(
  qrDataUrl: string,
  style: QrArtStyle,
  qrSize: number
): Promise<string> {
  const preset = getArtPreset(style);
  const pad = Math.round(qrSize * 0.14);
  const total = qrSize + pad * 2;

  const canvas = document.createElement('canvas');
  canvas.width = total;
  canvas.height = total;
  const ctx = canvas.getContext('2d')!;

  // Outer frame background
  const bg = preset.bgColors;
  if (bg) {
    const grad = ctx.createLinearGradient(0, 0, total, total);
    grad.addColorStop(0, bg[1]);
    grad.addColorStop(1, bg[0]);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = preset.lightColor;
  }
  ctx.fillRect(0, 0, total, total);

  // Outer border ring
  const borderColor = preset.eyeColor ?? preset.darkColor;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = Math.max(2, pad * 0.12);
  ctx.beginPath();
  ctx.roundRect(pad * 0.15, pad * 0.15, total - pad * 0.3, total - pad * 0.3, pad * 0.35);
  ctx.stroke();

  applyFrameDecorations(ctx, total, pad, style, preset);

  // White inner mat around QR
  const matPad = pad * 0.35;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.15)';
  ctx.shadowBlur = pad * 0.15;
  ctx.beginPath();
  ctx.roundRect(matPad, matPad, total - matPad * 2, total - matPad * 2, pad * 0.2);
  ctx.fill();
  ctx.shadowBlur = 0;

  const qrImg = await loadImage(qrDataUrl);
  ctx.drawImage(qrImg, pad, pad, qrSize, qrSize);

  return canvas.toDataURL('image/png');
}
