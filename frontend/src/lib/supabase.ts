import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn('VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing — auth disabled');
}

const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform();

export const supabase =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          flowType: 'pkce',
          // Native OAuth finishes via deep link + exchangeCodeForSession
          detectSessionInUrl: !isNative,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;

export const isSupabaseConfigured = !!supabase;
