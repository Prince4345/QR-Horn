import { useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import {
  X,
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
  Calendar,
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
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
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
        setTestResult(`Sent to ${result.sent} of ${result.total} device(s) — check your notifications.`);
      } else {
        setTestResult(result.errors[0] ?? 'No devices received the test. Enable notifications on this device first.');
      }
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-ink/40" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-surface border border-line rounded-[32px] relative overflow-hidden max-h-[90vh] overflow-y-auto custom-scroll"
      >
        {/* Header with gradient + avatar */}
        <div className="relative px-8 pt-10 pb-6 bg-gradient-to-br from-brand/20 via-brand/10 to-transparent">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/20 text-muted hover:text-ink hover:bg-black/40 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-brand/20 shrink-0">
              {initials(owner.name) || <User className="w-7 h-7" />}
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-bold truncate">{owner.name}</h2>
              <p className="text-muted text-sm truncate">{owner.email}</p>
              {joined && (
                <p className="text-faint text-xs mt-0.5 flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Member since {joined}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="px-8 pb-8 pt-6 space-y-5">
          {saved && (
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2 text-emerald-300 text-sm">
              <Check className="w-4 h-4 shrink-0" /> Profile updated
            </div>
          )}

          {/* Personal details */}
          <div className="rounded-2xl border border-line bg-soft p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-ink uppercase tracking-wider">Personal details</h3>
              {!editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs text-brand hover:text-brand flex items-center gap-1"
                >
                  <Pencil className="w-3 h-3" /> Edit
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
                    className="w-full px-4 py-3 rounded-2xl bg-surface border border-line outline-none focus:border-brand/50"
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
                    className="w-full px-4 py-3 rounded-2xl bg-surface border border-line outline-none focus:border-brand/50 font-mono"
                  />
                  <p className="text-[11px] text-faint mt-1">SMS alerts about your vehicle are sent to this number.</p>
                </div>

                {error && <p className="text-brand text-sm">{error}</p>}

                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={saving || !name.trim() || !phone.trim()}
                    className="flex-1 py-3 bg-brand hover:bg-brand-dark disabled:opacity-50 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-colors text-white"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    disabled={saving}
                    className="px-5 py-3 bg-soft hover:bg-soft rounded-2xl text-sm transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-surface"><User className="w-4 h-4 text-brand" /></div>
                  <div className="min-w-0">
                    <p className="text-xs text-faint">Full name</p>
                    <p className="text-sm font-medium truncate">{owner.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-surface"><Phone className="w-4 h-4 text-emerald-400" /></div>
                  <div className="min-w-0">
                    <p className="text-xs text-faint">Mobile number</p>
                    <p className="text-sm font-medium font-mono truncate">{owner.phone || 'Not set'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-surface"><Mail className="w-4 h-4 text-amber-400" /></div>
                  <div className="min-w-0">
                    <p className="text-xs text-faint">Email</p>
                    <p className="text-sm font-medium truncate">{owner.email}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Notifications */}
          <div className="rounded-2xl border border-line bg-soft p-5">
            <h3 className="text-sm font-semibold text-ink uppercase tracking-wider mb-4">Notifications</h3>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`p-2 rounded-xl ${pushEnabled ? 'bg-emerald-500/10' : 'bg-surface'}`}>
                  {pushEnabled
                    ? <BellRing className="w-4 h-4 text-emerald-400" />
                    : <Bell className="w-4 h-4 text-faint" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">Push alerts on this device</p>
                  <p className="text-xs text-faint">
                    {pushEnabled ? 'Enabled — you will get instant alerts here.' : 'Off — enable to get instant alerts.'}
                  </p>
                </div>
              </div>
              {pushEnabled ? (
                <span className="px-3 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 text-[10px] font-bold uppercase tracking-wider shrink-0">
                  On
                </span>
              ) : (
                <button
                  onClick={handleEnablePush}
                  disabled={pushLoading}
                  className="px-4 py-2 bg-brand hover:bg-brand-dark disabled:opacity-50 rounded-xl text-sm font-semibold flex items-center gap-2 shrink-0 transition-colors text-white"
                >
                  {pushLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                  Enable
                </button>
              )}
            </div>
            <div className="mt-3">
              <button
                onClick={handleTestPush}
                disabled={testLoading}
                className="w-full py-2.5 rounded-xl bg-soft hover:bg-soft disabled:opacity-50 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
              >
                {testLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}
                Send test notification
              </button>
              {testResult && (
                <p className="text-xs text-muted mt-2 text-center leading-relaxed">{testResult}</p>
              )}
            </div>
            <div className="mt-4 flex items-start gap-3 p-3 rounded-xl bg-soft border border-line">
              <ShieldCheck className="w-4 h-4 text-brand shrink-0 mt-0.5" />
              <p className="text-xs text-faint leading-relaxed">
                Your phone number stays private. Scanners contact you through anonymous in-app calls and alerts — they never see your details.
              </p>
            </div>
          </div>

          {!editing && error && <p className="text-brand text-sm">{error}</p>}

          {/* Sign out */}
          <button
            onClick={signOut}
            className="w-full py-3 bg-red-600/15 border border-red-500/25 text-brand hover:bg-red-600/25 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </motion.div>
    </div>
  );
}
