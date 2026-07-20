import { Capacitor } from '@capacitor/core';
import { getApiBase } from './apiBase';

type ParkstagNative = {
  saveAuth: (accessToken: string, apiBase: string) => void;
  clearAuth: () => void;
  openFullScreenIntentSettings?: () => void;
  canUseFullScreenIntent?: () => boolean;
};

function nativeBridge(): ParkstagNative | null {
  if (!Capacitor.isNativePlatform()) return null;
  const bridge = (window as Window & { ParkstagNative?: ParkstagNative }).ParkstagNative;
  return bridge ?? null;
}

/** Persist Supabase access token for Android notification Reply / Decline. */
export function syncNativeAuthToken(accessToken: string | null | undefined): void {
  const bridge = nativeBridge();
  if (!bridge) return;
  try {
    if (accessToken) {
      bridge.saveAuth(accessToken, getApiBase());
    } else {
      bridge.clearAuth();
    }
  } catch {
    // WebView bridge not ready yet
  }
}

/** Prompt once for Android 14+ full-screen call permission (lock-screen ringing). */
export function ensureFullScreenCallPermission(): void {
  const bridge = nativeBridge();
  if (!bridge?.openFullScreenIntentSettings || !bridge.canUseFullScreenIntent) return;
  try {
    if (bridge.canUseFullScreenIntent()) return;
    const key = 'parkstag-fsi-asked';
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    bridge.openFullScreenIntentSettings();
  } catch {
    // ignore
  }
}

export type NativeIntentDetail = {
  url?: string;
  kind?: string;
  roomId?: string | null;
  sessionId?: string | null;
  pendingReply?: string;
};

/** Handle Answer / open-from-notification intents from the Android shell. */
export function bindNativeIntentHandler(
  onIntent: (detail: NativeIntentDetail) => void,
): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<NativeIntentDetail>).detail ?? {};
    onIntent(detail);
  };
  window.addEventListener('parkstag:native-intent', handler);
  return () => window.removeEventListener('parkstag:native-intent', handler);
}
