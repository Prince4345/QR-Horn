import type { CapacitorConfig } from '@capacitor/cli';

/**
 * ParksTAG Android (Capacitor)
 *
 * Two modes:
 * 1) Bundled (default): serves `dist/` inside the app.
 *    Build with VITE_API_URL + VITE_APP_URL pointing at your live site.
 * 2) Live URL: set CAPACITOR_SERVER_URL=https://your-app.onrender.com
 *    so the WebView loads production (instant web updates).
 */
const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: 'com.parkstag.app',
  appName: 'ParksTAG',
  // android-sync.ps1 builds to dist-android when `dist` is locked (Android Studio / AV)
  webDir: process.env.CAPACITOR_WEB_DIR?.trim() || 'dist',
  server: {
    androidScheme: 'https',
    // Allow http:// during local LAN testing if needed
    cleartext: true,
    ...(serverUrl
      ? {
          url: serverUrl,
          cleartext: serverUrl.startsWith('http://'),
        }
      : {}),
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#1A0B2E',
      showSpinner: false,
      androidScaleType: 'CENTER_INSIDE',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1A0B2E',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
