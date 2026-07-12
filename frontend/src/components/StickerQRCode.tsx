import { useEffect, useState } from 'react';
import { renderArtisticQr } from '../lib/artisticQr';
import { renderFramedQr } from '../lib/qrFrames';
import { getArtPreset, type QrArtStyle } from '../lib/qrArtStyles';
import { getScanUrl } from '../lib/scanUrl';

interface StickerQRCodeProps {
  code: string;
  size?: number;
  className?: string;
  artStyle?: QrArtStyle;
  darkColor?: string;
  lightColor?: string;
  imageDataUrl?: string | null;
  logoText?: string;
  logoImageDataUrl?: string | null;
  withFrame?: boolean;
}

export default function StickerQRCode({
  code,
  size = 128,
  className,
  artStyle = 'classic',
  darkColor = '#0f172a',
  lightColor = '#ffffff',
  imageDataUrl = null,
  logoText = 'Q',
  logoImageDataUrl = null,
  withFrame = true,
}: StickerQRCodeProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const preset = getArtPreset(artStyle);
  const isPhotoStyle = preset.needsPhoto && imageDataUrl;

  useEffect(() => {
    let cancelled = false;
    const text = getScanUrl(code);
    const style = isPhotoStyle ? artStyle : artStyle.startsWith('photo') ? 'classic' : artStyle;

    renderArtisticQr({
      text,
      size: size * 2,
      style,
      imageDataUrl: isPhotoStyle ? imageDataUrl : null,
      darkOverride: darkColor,
      lightOverride: lightColor,
      logoText,
      logoImageDataUrl,
    })
      .then(async (qrUrl) => {
        if (cancelled) return;
        const final = withFrame ? await renderFramedQr(qrUrl, style, size * 2) : qrUrl;
        if (!cancelled) setDataUrl(final);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [
    code,
    size,
    artStyle,
    darkColor,
    lightColor,
    imageDataUrl,
    isPhotoStyle,
    logoText,
    logoImageDataUrl,
    withFrame,
  ]);

  const displaySize = withFrame ? Math.round(size * 1.28) : size;

  if (!dataUrl) {
    return (
      <div
        className={`bg-slate-200 animate-pulse rounded-lg ${className ?? ''}`}
        style={{ width: displaySize, height: displaySize }}
      />
    );
  }

  return (
    <img
      src={dataUrl}
      alt="Vehicle contact QR code"
      width={displaySize}
      height={displaySize}
      className={`block ${className ?? ''}`}
    />
  );
}
