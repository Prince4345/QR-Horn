/** Downscale a data-URL image so uploads stay small and render reliably on mobile. */
export function resizeImageDataUrl(
  dataUrl: string,
  maxWidth: number,
  maxHeight: number,
  mime: 'image/png' | 'image/jpeg' = 'image/png'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width, maxHeight / img.height);
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas not supported'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL(mime, mime === 'image/jpeg' ? 0.92 : undefined));
    };
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = dataUrl;
  });
}
