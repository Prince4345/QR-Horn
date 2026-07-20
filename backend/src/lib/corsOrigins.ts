/** Origins used by Capacitor Android/iOS WebViews (androidScheme: https → https://localhost). */
export const CAPACITOR_ORIGINS = [
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
  'ionic://localhost',
];

/**
 * Parse CORS_ORIGIN env and always allow Capacitor shells so the Android app
 * can call the API (browser Origin is https://localhost, not the Render URL).
 */
export function resolveCorsOrigins(isProd: boolean): true | string[] {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw) {
    return isProd ? true : ['http://localhost:3000', ...CAPACITOR_ORIGINS];
  }

  const fromEnv = raw.split(',').map((o) => o.trim()).filter(Boolean);
  return [...new Set([...fromEnv, ...CAPACITOR_ORIGINS])];
}
