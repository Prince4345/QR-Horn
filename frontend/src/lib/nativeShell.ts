import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { App as CapApp } from '@capacitor/app';
import { bindNativePushHandlers, ensureNativePushChannels } from './nativePush';
import { initLocalNotificationTaps } from './alertNotify';
import { ensureBatteryUnrestricted, ensureFullScreenCallPermission } from './nativeAuthBridge';

/** Native shell polish — safe no-op in the browser. */
export async function initNativeShell(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const dark = document.documentElement.classList.contains('dark');
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    await StatusBar.setBackgroundColor({ color: dark ? '#0D0118' : '#FFF8F0' });
  } catch {
    // StatusBar plugin may be unavailable on some devices
  }

  try {
    await SplashScreen.hide();
  } catch {
    // ignore
  }

  try {
    await ensureNativePushChannels();
    await bindNativePushHandlers();
    await initLocalNotificationTaps();
    // Delay so WebView / sessionStorage are ready
    window.setTimeout(() => {
      ensureFullScreenCallPermission();
      ensureBatteryUnrestricted();
    }, 1500);
  } catch {
    // Push plugin unavailable until google-services.json is present
  }

  // Android back button: go back in history when possible, else minimize
  CapApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack || window.history.length > 1) {
      window.history.back();
    } else {
      void CapApp.minimizeApp();
    }
  });
}
