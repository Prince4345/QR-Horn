import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, Phone, HeartPulse } from 'lucide-react';
import { api, type Vehicle } from '../lib/api';

type SafetyMode = 'emergency' | 'medical';

interface VehicleSafetyInfoProps {
  vehicle: Vehicle;
  mode: SafetyMode;
  onSaved: (vehicle: Vehicle) => void;
}

export default function VehicleSafetyInfo({ vehicle, mode, onSaved }: VehicleSafetyInfoProps) {
  const [contactName, setContactName] = useState(vehicle.emergencyContactName ?? '');
  const [contactPhone, setContactPhone] = useState(vehicle.emergencyContactPhone ?? '');
  const [medicalInfo, setMedicalInfo] = useState(vehicle.medicalInfo ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setContactName(vehicle.emergencyContactName ?? '');
    setContactPhone(vehicle.emergencyContactPhone ?? '');
    setMedicalInfo(vehicle.medicalInfo ?? '');
    setSaved(false);
    setError(null);
  }, [vehicle.id, vehicle.emergencyContactName, vehicle.emergencyContactPhone, vehicle.medicalInfo]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const updated =
        mode === 'emergency'
          ? await api.updateVehicle(vehicle.id, {
              emergencyContactName: contactName.trim() || null,
              emergencyContactPhone: contactPhone.trim() || null,
            })
          : await api.updateVehicle(vehicle.id, {
              medicalInfo: medicalInfo.trim() || null,
            });
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  const Icon = mode === 'emergency' ? Phone : HeartPulse;
  const title = mode === 'emergency' ? 'Emergency contact no.' : 'Medical info';
  const description =
    mode === 'emergency'
      ? 'Someone who can be reached if your vehicle is involved in an emergency. Shared only when a scanner reports an emergency.'
      : 'Optional notes for first responders — blood type, allergies, medications, or conditions. Shared only during emergency alerts.';

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="max-w-xl space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand/10">
          <Icon className="h-5 w-5 text-brand" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
        </div>
      </div>

      {mode === 'emergency' ? (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">
              Contact name
            </label>
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="e.g. Spouse, parent, friend"
              maxLength={120}
              className="w-full rounded-2xl border border-line bg-soft px-4 py-3 text-sm outline-none focus:border-brand/50"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">
              Phone number
            </label>
            <input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="e.g. +91 98765 43210"
              inputMode="tel"
              className="w-full rounded-2xl border border-line bg-soft px-4 py-3 font-mono text-sm tracking-wide outline-none focus:border-brand/50"
            />
          </div>
        </div>
      ) : (
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">
            Medical notes
          </label>
          <textarea
            value={medicalInfo}
            onChange={(e) => setMedicalInfo(e.target.value)}
            placeholder="Blood type, allergies, chronic conditions, medications…"
            rows={8}
            maxLength={2000}
            className="w-full resize-y rounded-2xl border border-line bg-soft px-4 py-3 text-sm leading-relaxed outline-none focus:border-brand/50"
          />
          <p className="mt-1.5 text-right text-xs text-faint">{medicalInfo.length}/2000</p>
        </div>
      )}

      {error && (
        <p className="rounded-2xl border border-brand/25 bg-brand/5 px-3 py-2 text-sm text-brand">{error}</p>
      )}
      {saved && !error && (
        <p className="text-sm text-emerald-500">Saved successfully.</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Save
      </button>
    </form>
  );
}
