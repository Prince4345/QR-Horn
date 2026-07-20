/** True when running inside Capacitor Android/iOS shell. */
function isNativeShell(): boolean {
  if (typeof window === 'undefined') return false;
  // Capacitor injects this on the WebView
  return !!(window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    ?.isNativePlatform?.();
}

/**
 * API / socket base —
 * - Dev (browser): same origin so Vite proxies to backend
 * - Native app: must use VITE_API_URL / VITE_APP_URL (origin is https://localhost)
 * - Production web: same origin unless VITE_API_URL is set
 */
export function getApiBase(): string {
  if (import.meta.env.DEV && !isNativeShell()) {
    return '';
  }

  const env = import.meta.env.VITE_API_URL?.trim();
  if (env) return env.replace(/\/$/, '');

  const appUrl = import.meta.env.VITE_APP_URL?.trim();
  if (isNativeShell() && appUrl) {
    return appUrl.replace(/\/$/, '');
  }

  // Production web: API served from same origin as the website
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  return '';
}

export function getSocketBase(): string {
  const base = getApiBase();
  if (base) return base;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}
