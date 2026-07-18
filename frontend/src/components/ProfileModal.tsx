import { useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Loader2,
  User,
  Phone,
  Mail,
  Bell,
  BellRing,
  LogOut,
  Check,
  Pencil,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

interface ProfileModalProps {
  onClose: () => void;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function memberSince(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export default function ProfileModal({ onClose }: ProfileModalProps) {
  const { owner, signOut, refreshProfile, enablePushNotifications, pushEnabled } = useAuth();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(owner?.name ?? '');
  const [phone, setPhone] = useState(owner?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushLoading, setPushLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  if (!owner) return null;

  const dirty = name.trim() !== owner.name || phone.trim() !== (owner.phone ?? '');
  const joined = memberSince(owner.createdAt);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!dirty) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data: { name?: string; phone?: string } = {};
      if (name.trim() !== owner.name) data.name = name.trim();
      if (phone.trim() !== (owner.phone ?? '')) data.phone = phone.trim();
      await api.updateProfile(data);
      await refreshProfile();
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setName(owner.name);
    setPhone(owner.phone ?? '');
    setError(null);
    setEditing(false);
  };

  const handleEnablePush = async () => {
    setPushLoading(true);
    setError(null);
    try {
      await enablePushNotifications();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enable notifications');
    } finally {
      setPushLoading(false);
    }
  };

  const handleTestPush = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const result = await api.testPush();
      if (result.sent > 0) {
        setTestResult(`Sent to ${result.sent} of ${result.total} device(s).`);
      } else {
        setTestResult(result.errors[0] ?? 'No devices received the test.');
      }
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col bg-canvas"
    >
      <header className="shrink-0 flex items-center gap-3 px-4 sm:px-6 h-14 border-b border-line bg-surface pt-[env(safe-area-inset-top)]">
        <button
          type="button"
          onClick={onClose}
          className="p-2 -ml-1 rounded-full text-muted hover:text-ink hover:bg-soft transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-semibold text-ink">Profile</h1>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scroll">
        <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-6 sm:py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center text-xl sm:text-2xl font-bold text-white shrink-0">
              {initials(owner.name) || <User className="w-7 h-7" />}
            </div>
            <div className="min-w-0">
              <p className="text-xl sm:text-2xl font-bold truncate leading-tight">{owner.name}</p>
              <p className="text-sm text-muted truncate mt-0.5">{owner.email}</p>
              {joined && <p className="text-xs text-faint mt-1">Member since {joined}</p>}
            </div>
          </div>

          {saved && (
            <div className="mb-5 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-2 text-emerald-400 text-sm">
              <Check className="w-4 h-4 shrink-0" /> Profile updated
            </div>
          )}

          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Personal details</h2>
              {!editing && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-sm text-brand hover:text-brand-dark flex items-center gap-1"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
              )}
            </div>

            {editing ? (
              <form onSubmit={handleSave} className="space-y-3">
                <div>
                  <label className="text-xs text-faint mb-1 block">Full name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    required
                    maxLength={80}
                    className="w-full px-4 py-3 rounded-xl bg-surface border border-line outline-none focus:border-brand/50 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-faint mb-1 block">Mobile number</label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    required
                    inputMode="tel"
                    className="w-full px-4 py-3 rounded-xl bg-surface border border-line outline-none focus:border-brand/50 font-mono text-sm"
                  />
                </div>
                {error && <p className="text-brand text-sm">{error}</p>}
                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={saving || !name.trim() || !phone.trim()}
                    className="flex-1 py-3 bg-brand hover:bg-brand-dark disabled:opacity-50 rounded-xl font-semibold flex items-center justify-center gap-2 text-sm text-white"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    disabled={saving}
                    className="px-5 py-3 rounded-xl text-sm text-muted hover:text-ink hover:bg-soft"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <ul className="divide-y divide-line border-y border-line">
                <li className="flex items-center gap-3 py-3.5">
                  <User className="w-4 h-4 text-brand shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-faint">Full name</p>
                    <p className="text-sm font-medium truncate">{owner.name}</p>
                  </div>
                </li>
                <li className="flex items-center gap-3 py-3.5">
                  <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-faint">Mobile number</p>
                    <p className="text-sm font-medium font-mono truncate">{owner.phone || 'Not set'}</p>
                  </div>
                </li>
                <li className="flex items-center gap-3 py-3.5">
                  <Mail className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-faint">Email</p>
                    <p className="text-sm font-medium truncate">{owner.email}</p>
                  </div>
                </li>
              </ul>
            )}
          </section>

          <section className="mb-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Notifications</h2>

            <div className="flex items-center justify-between gap-3 py-3 border-t border-line">
              <div className="flex items-center gap-3 min-w-0">
                {pushEnabled ? (
                  <BellRing className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <Bell className="w-4 h-4 text-faint shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium">Push alerts on this device</p>
                  <p className="text-xs text-faint">
                    {pushEnabled ? 'Enabled — instant alerts here' : 'Off — enable for instant alerts'}
                  </p>
                </div>
              </div>
              {pushEnabled ? (
                <span className="px-2.5 py-1 rounded-md bg-emerald-500/15 text-emerald-400 text-[10px] font-bold uppercase tracking-wider shrink-0">
                  On
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleEnablePush}
                  disabled={pushLoading}
                  className="px-3.5 py-2 bg-brand hover:bg-brand-dark disabled:opacity-50 rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0 text-white"
                >
                  {pushLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Enable
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleTestPush}
              disabled={testLoading}
              className="mt-2 w-full py-2.5 rounded-xl border border-line bg-surface hover:bg-soft disabled:opacity-50 text-sm font-medium flex items-center justify-center gap-2"
            >
              {testLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}
              Send test notification
            </button>
            {testResult && <p className="text-xs text-muted mt-2 text-center">{testResult}</p>}

            <div className="mt-4 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-brand shrink-0 mt-0.5" />
              <p className="text-xs text-faint leading-relaxed">
                Your phone stays private. Scanners only reach you through anonymous in-app alerts.
              </p>
            </div>
          </section>

          {!editing && error && <p className="text-brand text-sm mb-4">{error}</p>}

          <button
            type="button"
            onClick={signOut}
            className="w-full py-3 text-brand hover:bg-brand/10 rounded-xl font-semibold flex items-center justify-center gap-2 text-sm transition-colors border border-brand/20"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </div>
    </motion.div>
  );
}
