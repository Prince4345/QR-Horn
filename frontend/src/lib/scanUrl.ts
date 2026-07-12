/** Base URL encoded in sticker QR codes. Set VITE_APP_URL in production. */
export function getAppBaseUrl(): string {
  const configured = import.meta.env.VITE_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:3000';
}

export function getScanUrl(code: string): string {
  return `${getAppBaseUrl()}/scan/${encodeURIComponent(code)}`;
}

export function parseScanCodeFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/scan\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Extract sticker code from a scanned QR payload (full URL or raw code). */
export function parseScanCodeFromQrText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const fromPath = parseScanCodeFromPath(url.pathname);
    if (fromPath) return fromPath;
  } catch {
    // not a URL — treat as raw code
  }

  const pathMatch = trimmed.match(/\/scan\/([^/?#]+)/i);
  if (pathMatch) return decodeURIComponent(pathMatch[1]);

  if (/^[A-Za-z0-9_-]{6,32}$/.test(trimmed)) return trimmed;
  return null;
}
