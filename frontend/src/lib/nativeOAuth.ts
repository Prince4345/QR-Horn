import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { supabase } from './supabase';

/** Deep link the Android app listens for after Supabase OAuth. */
export const NATIVE_AUTH_SCHEME_URL = 'com.parkstag.app://auth/callback';

/**
 * Supabase redirect after Google — must be a custom scheme so Chrome Custom Tabs
 * returns into the app. Do NOT use the website URL (Site URL loads the marketing
 * page in Chrome and never opens ParksTAG).
 *
 * Add this exact URL in Supabase → Authentication → URL Configuration → Redirect URLs:
 *   com.parkstag.app://auth/callback
 */
export function getNativeOAuthRedirectTo(): string {
  return NATIVE_AUTH_SCHEME_URL;
}

function parseAuthCallbackUrl(url: string): {
  code?: string;
  access_token?: string;
  refresh_token?: string;
  error?: string;
} {
  const normalized =
    url.startsWith('http://') || url.startsWith('https://')
      ? url
      : url.replace(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//, 'https://$1/');
  try {
    const u = new URL(normalized);
    const error =
      u.searchParams.get('error_description') ||
      u.searchParams.get('error') ||
      undefined;
    let code = u.searchParams.get('code') ?? undefined;
    let access_token = u.searchParams.get('access_token') ?? undefined;
    let refresh_token = u.searchParams.get('refresh_token') ?? undefined;

    if (u.hash) {
      const hash = new URLSearchParams(u.hash.replace(/^#/, ''));
      code = code || hash.get('code') || undefined;
      access_token = access_token || hash.get('access_token') || undefined;
      refresh_token = refresh_token || hash.get('refresh_token') || undefined;
      if (!error) {
        const hashErr = hash.get('error_description') || hash.get('error');
        if (hashErr) return { error: hashErr };
      }
    }

    return { code, access_token, refresh_token, error };
  } catch {
    const codeMatch = url.match(/[?&#]code=([^&]+)/);
    const atMatch = url.match(/[?&#]access_token=([^&]+)/);
    const rtMatch = url.match(/[?&#]refresh_token=([^&]+)/);
    return {
      code: codeMatch?.[1] ? decodeURIComponent(codeMatch[1]) : undefined,
      access_token: atMatch?.[1] ? decodeURIComponent(atMatch[1]) : undefined,
      refresh_token: rtMatch?.[1] ? decodeURIComponent(rtMatch[1]) : undefined,
    };
  }
}

function looksLikeAuthCallback(url: string): boolean {
  return (
    url.includes('auth/callback') ||
    url.includes('native-callback') ||
    /[?&#]code=/.test(url) ||
    /[?&#]access_token=/.test(url)
  );
}

/** Finish OAuth session from a deep link (custom scheme or HTTPS bridge). */
export async function handleAuthDeepLink(url: string): Promise<boolean> {
  if (!supabase || !looksLikeAuthCallback(url)) return false;

  console.log('[auth] handling deep link');
  const parsed = parseAuthCallbackUrl(url);
  if (parsed.error) {
    throw new Error(parsed.error);
  }

  if (parsed.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(parsed.code);
    if (error) throw error;
    await Browser.close().catch(() => {});
    return true;
  }

  if (parsed.access_token && parsed.refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
    });
    if (error) throw error;
    await Browser.close().catch(() => {});
    return true;
  }

  return false;
}

let oauthListenerReady = false;

/** Listen once for OAuth return into the Android app. */
export async function initNativeOAuthListener(): Promise<void> {
  if (!Capacitor.isNativePlatform() || oauthListenerReady) return;
  oauthListenerReady = true;

  await CapApp.addListener('appUrlOpen', ({ url }) => {
    console.log('[auth] appUrlOpen', url.slice(0, 80));
    void handleAuthDeepLink(url).catch((err) => {
      console.error('[auth] deep link failed:', err);
    });
  });

  try {
    const launch = await CapApp.getLaunchUrl();
    if (launch?.url) {
      await handleAuthDeepLink(launch.url);
    }
  } catch {
    // ignore
  }
}

/**
 * If the marketing site (or SPA) ever loads an OAuth callback in a browser,
 * bounce into the Android app via custom scheme + intent://.
 * Safe no-op when not on a callback URL.
 */
export function bounceWebOAuthCallbackToApp(): void {
  if (typeof window === 'undefined') return;
  const path = window.location.pathname || '';
  if (!path.includes('native-callback') && !path.includes('/auth/callback')) return;

  const search = window.location.search || '';
  const hash = window.location.hash || '';
  if (!search.includes('code=') && !hash.includes('access_token') && !search.includes('access_token')) {
    return;
  }

  const deep = `${NATIVE_AUTH_SCHEME_URL}${search}${hash}`;
  const intent =
    `intent://auth/callback${search}${hash}` +
    '#Intent;scheme=com.parkstag.app;package=com.parkstag.app;end';

  try {
    window.location.replace(intent);
  } catch {
    window.location.href = deep;
  }
}

/** Google sign-in that returns into the Capacitor app (not Chrome). */
export async function signInWithGoogleNative(): Promise<void> {
  if (!supabase) throw new Error('Auth not configured');

  await initNativeOAuthListener();

  const redirectTo = getNativeOAuthRedirectTo();
  console.log('[auth] Google OAuth redirectTo=', redirectTo);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: {
        access_type: 'offline',
        prompt: 'select_account',
      },
    },
  });

  if (error) throw error;
  if (!data.url) throw new Error('Google sign-in did not return a URL');

  await Browser.open({ url: data.url });
}
