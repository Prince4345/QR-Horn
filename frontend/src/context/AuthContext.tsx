import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { api, setAuthTokenGetter } from '../lib/api';
import { requestFcmToken, initFirebaseMessaging, type FirebasePublicConfig } from '../lib/firebase';

export interface OwnerProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  fcmToken: string | null;
  createdAt?: string;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  owner: OwnerProfile | null;
  setupComplete: boolean;
  loading: boolean;
  profileLoading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  signUp: (email: string, password: string, name: string, phone: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  sendPhoneOtp: (phone: string) => Promise<void>;
  verifyPhoneOtp: (phone: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
  setupProfile: (name: string, phone: string) => Promise<void>;
  enablePushNotifications: () => Promise<boolean>;
  preparePushNotifications: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function formatPhoneE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (phone.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  return `+${digits}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [owner, setOwner] = useState<OwnerProfile | null>(null);
  const [setupComplete, setSetupComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [firebaseConfig, setFirebaseConfig] = useState<FirebasePublicConfig | null>(null);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  const refreshProfile = useCallback(async () => {
    if (!session) {
      setOwner(null);
      setSetupComplete(false);
      return null;
    }

    try {
      const data = await api.getMe();
      setAuthError(null);
      setSetupComplete(data.setupComplete);
      setOwner(data.owner ?? null);
      setPushEnabled(!!data.owner?.fcmToken);
      return data;
    } catch (err) {
      setOwner(null);
      setSetupComplete(false);
      setAuthError(err instanceof Error ? err.message : 'Failed to load profile');
      return null;
    }
  }, [session]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    setAuthTokenGetter(async () => sessionRef.current?.access_token ?? null);

    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
      })
      .catch(() => setSession(null))
      .finally(() => setLoading(false));

    const authTimeout = setTimeout(() => setLoading(false), 8000);

    // Never use async directly in onAuthStateChange — it deadlocks Supabase auth
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    api.getAuthConfig()
      .then((cfg) => setFirebaseConfig(cfg.firebase as unknown as FirebasePublicConfig))
      .catch(() => {});

    return () => {
      clearTimeout(authTimeout);
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setOwner(null);
      setSetupComplete(false);
      setPushEnabled(false);
      setProfileLoading(false);
      return;
    }

    let cancelled = false;
    setProfileLoading(true);

    const profileTimeout = setTimeout(() => {
      if (!cancelled) setProfileLoading(false);
    }, 12000);

    (async () => {
      try {
        const profile = await api.getMe().catch((err) => {
          if (!cancelled) {
            const msg = err instanceof Error ? err.message : '';
            setAuthError(
              msg.includes('timed out') || /Failed to fetch|NetworkError/i.test(msg)
                ? 'Could not reach the server. Wait a few seconds if the site is waking up, then tap Retry.'
                : msg || 'Could not load your account. Please try again.'
            );
          }
          return null;
        });
        if (cancelled) return;

        if (!profile) {
          setSetupComplete(false);
          setOwner(null);
          return;
        }

        // Existing accounts go to dashboard; incomplete profiles show name + phone form
        setAuthError(null);
        setSetupComplete(profile.setupComplete);
        setOwner(profile.owner ?? null);
        setPushEnabled(!!profile.owner?.fcmToken);
      } catch {
        if (!cancelled) {
          setAuthError('Could not load your account. Please try again.');
        }
      } finally {
        clearTimeout(profileTimeout);
        if (!cancelled) setProfileLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(profileTimeout);
    };
  }, [session]);

  const setupProfile = async (name: string, phone: string) => {
    setProfileLoading(true);
    setAuthError(null);
    try {
      await api.setupProfile(name, phone);
      await refreshProfile();
    } catch (err) {
      // Keep user on the form; surface the API message (e.g. invalid phone)
      throw err;
    } finally {
      setProfileLoading(false);
    }
  };

  const signUp = async (email: string, password: string, name: string, phone: string) => {
    if (!supabase) throw new Error('Auth not configured');
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    if (data.session) {
      setSession(data.session);
      await api.setupProfile(name, phone);
      await refreshProfile();
    }
  };

  const signIn = async (email: string, password: string) => {
    if (!supabase) throw new Error('Auth not configured');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    setSession(data.session);
  };

  const signInWithGoogle = async () => {
    if (!supabase) throw new Error('Auth not configured');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) throw error;
  };

  const sendPhoneOtp = async (phone: string) => {
    if (!supabase) throw new Error('Auth not configured');
    const formatted = formatPhoneE164(phone);
    const { error } = await supabase.auth.signInWithOtp({ phone: formatted });
    if (error) throw error;
  };

  const verifyPhoneOtp = async (phone: string, token: string) => {
    if (!supabase) throw new Error('Auth not configured');
    const formatted = formatPhoneE164(phone);
    const { data, error } = await supabase.auth.verifyOtp({
      phone: formatted,
      token,
      type: 'sms',
    });
    if (error) throw error;
    setSession(data.session);
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setOwner(null);
    setSetupComplete(false);
  };

  const ensureFirebaseConfig = useCallback(async (): Promise<FirebasePublicConfig> => {
    if (firebaseConfig?.vapidKey && firebaseConfig?.apiKey) return firebaseConfig;
    const cfg = await api.getAuthConfig();
    const fb = cfg.firebase as unknown as FirebasePublicConfig;
    setFirebaseConfig(fb);
    if (!fb.vapidKey || !fb.apiKey) {
      throw new Error('Push notifications are not configured on the server');
    }
    return fb;
  }, [firebaseConfig]);

  const preparePushNotifications = useCallback(async () => {
    const config = await ensureFirebaseConfig();
    await initFirebaseMessaging(config);
  }, [ensureFirebaseConfig]);

  const enablePushNotifications = async () => {
    const config = await ensureFirebaseConfig();
    const token = await requestFcmToken(config);
    const device =
      /iPhone|iPad|iPod/i.test(navigator.userAgent)
        ? 'ios-web'
        : /Android/i.test(navigator.userAgent)
          ? 'android-web'
          : 'desktop-web';
    await api.saveFcmToken(token, device);
    setPushEnabled(true);
    setOwner((prev) => (prev ? { ...prev, fcmToken: token } : prev));
    return true;
  };

  // Self-heal push registration: FCM tokens rotate, and older app versions
  // stored only one device's token. If this device already granted
  // notification permission, silently re-fetch + re-save its token on every
  // app load so it never silently drops off the push list.
  const autoRegisteredRef = useRef(false);
  useEffect(() => {
    if (!setupComplete || !owner || autoRegisteredRef.current) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    autoRegisteredRef.current = true;
    (async () => {
      try {
        const config = await ensureFirebaseConfig();
        const token = await requestFcmToken(config);
        const device =
          /iPhone|iPad|iPod/i.test(navigator.userAgent)
            ? 'ios-web'
            : /Android/i.test(navigator.userAgent)
              ? 'android-web'
              : 'desktop-web';
        await api.saveFcmToken(token, device);
        setPushEnabled(true);
        console.log('[push] device token re-registered');
      } catch (err) {
        console.warn('[push] auto re-register failed:', err);
      }
    })();
  }, [setupComplete, owner, ensureFirebaseConfig]);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        owner,
        setupComplete,
        loading,
        profileLoading,
        authError,
        clearAuthError: () => setAuthError(null),
        pushEnabled,
        signUp,
        signIn,
        signInWithGoogle,
        sendPhoneOtp,
        verifyPhoneOtp,
        signOut,
        setupProfile,
        enablePushNotifications,
        preparePushNotifications,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { isSupabaseConfigured };
