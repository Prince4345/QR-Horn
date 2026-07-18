import { useEffect, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { Loader2, Mail, Lock, User, Phone, Chrome } from 'lucide-react';
import { useAuth, isSupabaseConfigured } from '../context/AuthContext';
import { APP_NAME } from '../lib/brand';
import BrandLogo from './BrandLogo';
import BrandWordmark from './BrandWordmark';

type AuthMethod = 'email' | 'phone';
type PhoneStep = 'enter' | 'otp';

export default function AuthPage() {
  const {
    signIn,
    signUp,
    signInWithGoogle,
    sendPhoneOtp,
    verifyPhoneOtp,
    setupProfile,
    setupComplete,
    session,
    user,
    owner,
    loading: authLoading,
    profileLoading,
    authError,
    clearAuthError,
  } = useAuth();

  const [authMethod, setAuthMethod] = useState<AuthMethod>('email');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('enter');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupMessage, setSignupMessage] = useState<string | null>(null);
  const [profilePrefillDone, setProfilePrefillDone] = useState(false);

  const needsSetup = !!session && !setupComplete;

  // Prefill name/phone for Google or OTP users on the complete-profile screen
  useEffect(() => {
    if (!needsSetup || profilePrefillDone) return;

    const meta = user?.user_metadata ?? {};
    const suggestedName =
      owner?.name?.trim() ||
      meta.full_name ||
      meta.name ||
      '';
    const suggestedPhone =
      owner?.phone?.trim() ||
      user?.phone ||
      '';

    if (suggestedName && !name) setName(suggestedName);
    if (suggestedPhone && !phone) setPhone(suggestedPhone);
    setProfilePrefillDone(true);
  }, [needsSetup, profilePrefillDone, user, owner, name, phone]);

  if (!isSupabaseConfigured) {
    return (
      <div className="w-full max-w-md bg-surface border border-line rounded-2xl sm:rounded-[40px] p-6 sm:p-10 text-center">
        <h2 className="text-xl font-semibold mb-2">Auth Not Configured</h2>
        <p className="text-muted text-sm">
          Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to frontend/.env
        </p>
      </div>
    );
  }

  if (authLoading || profileLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
      </div>
    );
  }

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSignupMessage(null);
    try {
      if (mode === 'signup') {
        await signUp(email, password, name, phone);
        setSignupMessage('Account created. Check your email if confirmation is required, then sign in.');
        setMode('login');
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await sendPhoneOtp(phone);
      setPhoneStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await verifyPhoneOtp(phone, otp);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSetup = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await setupProfile(name.trim(), phone.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md bg-surface border border-line rounded-2xl sm:rounded-[40px] p-5 sm:p-8"
    >
      <div className="text-center mb-8">
        <BrandLogo size="lg" glow className="mx-auto mb-4" />
        {needsSetup ? (
          <h1 className="text-2xl font-bold text-ink mb-1">Complete your profile</h1>
        ) : (
          <BrandWordmark size="lg" className="justify-center mb-1 inline-flex" />
        )}
        <p className="text-muted text-sm">
          {needsSetup
            ? 'We need your name and mobile number to send SMS alerts when someone contacts your vehicle.'
            : 'Owner sign in — manage your vehicle stickers and alerts'}
        </p>
      </div>

      {authError && (
        <div className="mb-4 p-3 rounded-xl bg-brand/5 border border-brand/25 text-brand text-sm text-center">
          {authError}
          <button type="button" onClick={clearAuthError} className="block mx-auto mt-2 text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {needsSetup ? (
        <form onSubmit={handleSetup} className="space-y-4">
          <div className="relative">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              required
              className="w-full pl-11 pr-4 py-3 rounded-2xl bg-surface border border-line outline-none focus:border-brand/50"
            />
          </div>
          <div className="relative">
            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Mobile number (e.g. 9876543210)"
              required
              className="w-full pl-11 pr-4 py-3 rounded-2xl bg-surface border border-line outline-none focus:border-brand/50"
            />
          </div>
          <p className="text-xs text-faint text-center leading-relaxed">
            Your mobile number is used for SMS alerts when someone scans your QR sticker.
            Push notifications can also be enabled later on your phone.
          </p>
          {error && <p className="text-brand text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading || !name.trim() || !phone.trim()}
            className="w-full py-3 bg-brand disabled:opacity-50 rounded-2xl font-semibold flex items-center justify-center gap-2 text-white"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save & continue'}
          </button>
        </form>
      ) : (
        <>
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full py-3 mb-4 bg-surface text-ink border border-line rounded-2xl font-semibold flex items-center justify-center gap-2 hover:bg-soft transition-colors"
          >
            <Chrome className="w-5 h-5" />
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-soft" />
            <span className="text-xs text-faint uppercase">or</span>
            <div className="flex-1 h-px bg-soft" />
          </div>

          <div className="flex mb-4 bg-surface rounded-full p-1">
            <button
              type="button"
              onClick={() => { setAuthMethod('email'); setError(null); setPhoneStep('enter'); }}
              className={`flex-1 py-2 rounded-full text-sm font-medium flex items-center justify-center gap-1 ${authMethod === 'email' ? 'bg-soft' : 'text-muted'}`}
            >
              <Mail className="w-3.5 h-3.5" /> Email
            </button>
            <button
              type="button"
              onClick={() => { setAuthMethod('phone'); setError(null); setPhoneStep('enter'); }}
              className={`flex-1 py-2 rounded-full text-sm font-medium flex items-center justify-center gap-1 ${authMethod === 'phone' ? 'bg-soft' : 'text-muted'}`}
            >
              <Phone className="w-3.5 h-3.5" /> Phone
            </button>
          </div>

          {authMethod === 'email' ? (
            <>
              <div className="flex mb-4 bg-surface rounded-full p-1">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className={`flex-1 py-2 rounded-full text-sm font-medium ${mode === 'login' ? 'bg-soft' : 'text-muted'}`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  className={`flex-1 py-2 rounded-full text-sm font-medium ${mode === 'signup' ? 'bg-soft' : 'text-muted'}`}
                >
                  Sign Up
                </button>
              </div>

              <form onSubmit={handleEmailSubmit} className="space-y-4">
                {mode === 'signup' && (
                  <>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your full name"
                        required
                        className="w-full pl-11 pr-4 py-3 rounded-2xl bg-surface border border-line outline-none focus:border-brand/50"
                      />
                    </div>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="Mobile number (for SMS alerts)"
                        required
                        className="w-full pl-11 pr-4 py-3 rounded-2xl bg-surface border border-line outline-none focus:border-brand/50"
                      />
                    </div>
                  </>
                )}
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    required
                    className="w-full pl-11 pr-4 py-3 rounded-2xl bg-surface border border-line outline-none focus:border-brand/50"
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    required
                    minLength={6}
                    className="w-full pl-11 pr-4 py-3 rounded-2xl bg-surface border border-line outline-none focus:border-brand/50"
                  />
                </div>
                {error && <p className="text-brand text-sm">{error}</p>}
                {signupMessage && <p className="text-green-400 text-sm">{signupMessage}</p>}
                <button
                  type="submit"
                  disabled={loading || (mode === 'signup' && (!name.trim() || !phone.trim()))}
                  className="w-full py-3 bg-brand disabled:opacity-50 rounded-2xl font-semibold flex items-center justify-center gap-2 text-white"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === 'signup' ? 'Create Account' : 'Sign In'}
                </button>
              </form>
            </>
          ) : phoneStep === 'enter' ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Phone number (e.g. 9876543210)"
                  required
                  className="w-full pl-11 pr-4 py-3 rounded-2xl bg-surface border border-line outline-none focus:border-brand/50"
                />
              </div>
              <p className="text-xs text-faint text-center">
                We&apos;ll send a 6-digit OTP. New accounts will be asked for your name next.
              </p>
              {error && <p className="text-brand text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading || !phone.trim()}
                className="w-full py-3 bg-brand disabled:opacity-50 rounded-2xl font-semibold flex items-center justify-center gap-2 text-white"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send OTP'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <p className="text-sm text-muted text-center">OTP sent to {phone}</p>
              <input
                type="text"
                inputMode="numeric"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter 6-digit OTP"
                required
                maxLength={6}
                className="w-full px-4 py-3 rounded-2xl bg-surface border border-line outline-none focus:border-brand/50 text-center text-2xl tracking-[0.5em] font-mono"
              />
              {error && <p className="text-brand text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full py-3 bg-brand disabled:opacity-50 rounded-2xl font-semibold flex items-center justify-center gap-2 text-white"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify & continue'}
              </button>
              <button
                type="button"
                onClick={() => { setPhoneStep('enter'); setOtp(''); setError(null); }}
                className="w-full text-sm text-muted hover:text-ink"
              >
                Change phone number
              </button>
            </form>
          )}
        </>
      )}
    </motion.div>
  );
}
