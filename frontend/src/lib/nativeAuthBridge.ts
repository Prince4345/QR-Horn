import { Capacitor } from '@capacitor/core';
import { getApiBase } from './apiBase';

type ParkstagNative = {
  saveAuth: (accessToken: string, apiBase: string) => void;
  clearAuth: () => void;
  openFullScreenIntentSettings?: () => void;
  canUseFullScreenIntent?: () => boolean;
  startIncomingCall?: (title: string, body: string, roomId: string, url: string) => void;
  stopIncomingCall?: () => void;
  requestIgnoreBatteryOptimizations?: () => void;
  isIgnoringBatteryOptimizations?: () => boolean;
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

/** Start native continuous ring + full-screen Answer/Decline. */
export function startNativeIncomingCall(opts: {
  title: string;
  body: string;
  roomId: string;
  url?: string;
}): void {
  const bridge = nativeBridge();
  if (!bridge?.startIncomingCall) return;
  try {
    bridge.startIncomingCall(
      opts.title,
      opts.body,
      opts.roomId,
      opts.url ?? `/?view=dashboard&call=${encodeURIComponent(opts.roomId)}`,
    );
  } catch {
    // ignore
  }
}

export function stopNativeIncomingCall(): void {
  const bridge = nativeBridge();
  if (!bridge?.stopIncomingCall) return;
  try {
    bridge.stopIncomingCall();
  } catch {
    // ignore
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

/** Prompt once to exempt ParksTAG from battery optimizations (critical for FCM wake). */
export function ensureBatteryUnrestricted(): void {
  const bridge = nativeBridge();
  if (!bridge?.requestIgnoreBatteryOptimizations || !bridge.isIgnoringBatteryOptimizations) return;
  try {
    if (bridge.isIgnoringBatteryOptimizations()) return;
    const key = 'parkstag-battery-asked';
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
    bridge.requestIgnoreBatteryOptimizations();
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
