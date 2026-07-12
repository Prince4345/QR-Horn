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
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  sendPhoneOtp: (phone: string) => Promise<void>;
  verifyPhoneOtp: (phone: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
  setupProfile: (name: string, phone?: string) => Promise<void>;
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
  const autoSetupAttempted = useRef<string | null>(null);
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
      autoSetupAttempted.current = null;
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
            setAuthError(
              err instanceof Error && err.message.includes('timed out')
                ? 'Backend is not running — restart with npm run dev'
                : 'Could not reach server — is the backend running on port 3001?'
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

        if (profile.setupComplete) {
          setAuthError(null);
          setSetupComplete(true);
          setOwner(profile.owner ?? null);
          setPushEnabled(!!profile.owner?.fcmToken);
          return;
        }

        setSetupComplete(false);
        setOwner(null);

        const userId = session.user.id;
        if (autoSetupAttempted.current === userId) return;
        autoSetupAttempted.current = userId;

        const meta = session.user.user_metadata ?? {};
        const name = meta.full_name || meta.name;
        if (!name) return;

        await api.setupProfile(name, session.user.phone ?? undefined);
        if (!cancelled) {
          const updated = await api.getMe();
          setAuthError(null);
          setSetupComplete(updated.setupComplete);
          setOwner(updated.owner ?? null);
          setPushEnabled(!!updated.owner?.fcmToken);
        }
      } catch {
        if (!cancelled) {
          setAuthError('Account setup failed — check that the backend is running.');
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

  const setupProfile = async (name: string, phone?: string) => {
    setProfileLoading(true);
    try {
      await api.setupProfile(name, phone);
      await refreshProfile();
    } finally {
      setProfileLoading(false);
    }
  };

  const signUp = async (email: string, password: string, name: string) => {
    if (!supabase) throw new Error('Auth not configured');
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    if (data.session) {
      setSession(data.session);
      await api.setupProfile(name);
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
    autoSetupAttempted.current = null;
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
