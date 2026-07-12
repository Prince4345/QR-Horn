/** API / socket base — in dev, same origin so Vite proxies to backend (phone only needs port 3000). */
export function getApiBase(): string {
  if (import.meta.env.DEV) {
    return '';
  }

  const env = import.meta.env.VITE_API_URL?.trim();
  if (env) return env.replace(/\/$/, '');

  // Production: API served from same origin as the web app
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  return '';
}

export function getSocketBase(): string {
  const base = getApiBase();
  return base || window.location.origin;
}
