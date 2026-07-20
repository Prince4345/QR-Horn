import { Capacitor } from '@capacitor/core';
import { getApiBase } from './apiBase';

type ParkstagNative = {
  saveAuth: (accessToken: string, apiBase: string) => void;
  clearAuth: () => void;
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
