import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, Phone, HeartPulse } from 'lucide-react';
import { api, type Vehicle } from '../lib/api';

type SafetyMode = 'emergency' | 'medical';

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

export const COMMON_ALLERGIES = [
  'Penicillin',
  'Peanuts',
  'Tree nuts',
  'Dairy',
  'Eggs',
  'Shellfish',
  'Dust / pollen',
  'Latex',
  'None known',
] as const;

const ALLERGY_SET = new Set<string>(COMMON_ALLERGIES);

function parseAllergies(raw: string | null) {
  const tokens = raw?.split(';').map((s) => s.trim()).filter(Boolean) ?? [];
  const selected = tokens.filter((t) => ALLERGY_SET.has(t));
  const other = tokens.filter((t) => !ALLERGY_SET.has(t)).join(', ');
  return { selected, other };
}

function serializeAllergies(selected: string[], other: string): string | null {
  const parts = [...selected];
  other
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((part) => parts.push(part));
  const unique = [...new Set(parts)];
  return unique.length ? unique.join(';') : null;
}

interface VehicleSafetyInfoProps {
  vehicle: Vehicle;
  mode: SafetyMode;
  onSaved: (vehicle: Vehicle) => void;
}

export default function VehicleSafetyInfo({ vehicle, mode, onSaved }: VehicleSafetyInfoProps) {
  const [contactName, setContactName] = useState(vehicle.emergencyContactName ?? '');
  const [contactPhone, setContactPhone] = useState(vehicle.emergencyContactPhone ?? '');
  const [bloodGroup, setBloodGroup] = useState(vehicle.bloodGroup ?? '');
  const [selectedAllergies, setSelectedAllergies] = useState<string[]>([]);
  const [otherAllergies, setOtherAllergies] = useState('');
  const [medicalInfo, setMedicalInfo] = useState(vehicle.medicalInfo ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setContactName(vehicle.emergencyContactName ?? '');
    setContactPhone(vehicle.emergencyContactPhone ?? '');
    setBloodGroup(vehicle.bloodGroup ?? '');
    const parsed = parseAllergies(vehicle.allergies);
    setSelectedAllergies(parsed.selected);
    setOtherAllergies(parsed.other);
    setMedicalInfo(vehicle.medicalInfo ?? '');
    setSaved(false);
    setError(null);
  }, [
    vehicle.id,
    vehicle.emergencyContactName,
    vehicle.emergencyContactPhone,
    vehicle.bloodGroup,
    vehicle.allergies,
    vehicle.medicalInfo,
  ]);

  const toggleAllergy = (label: string) => {
    setSelectedAllergies((prev) => {
      if (label === 'None known') {
        return prev.includes(label) ? [] : [label];
      }
      const withoutNone = prev.filter((a) => a !== 'None known');
      return withoutNone.includes(label)
        ? withoutNone.filter((a) => a !== label)
        : [...withoutNone, label];
    });
  };

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
              bloodGroup: bloodGroup || null,
              allergies: serializeAllergies(selectedAllergies, otherAllergies),
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
      : 'Blood group, allergies, and other notes for first responders. Shared only during emergency alerts.';

  const chipClass = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
      active
        ? 'border-brand bg-brand/15 text-brand'
        : 'border-line bg-soft text-muted hover:border-brand/30 hover:text-ink'
    }`;

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
        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted">
              Blood group
            </label>
            <div className="flex flex-wrap gap-2">
              {BLOOD_GROUPS.map((group) => (
                <button
                  key={group}
                  type="button"
                  onClick={() => setBloodGroup(bloodGroup === group ? '' : group)}
                  className={chipClass(bloodGroup === group)}
                >
                  {group}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted">
              Allergies
            </label>
            <div className="flex flex-wrap gap-2">
              {COMMON_ALLERGIES.map((allergy) => (
                <button
                  key={allergy}
                  type="button"
                  onClick={() => toggleAllergy(allergy)}
                  className={chipClass(selectedAllergies.includes(allergy))}
                >
                  {allergy}
                </button>
              ))}
            </div>
            <input
              value={otherAllergies}
              onChange={(e) => setOtherAllergies(e.target.value)}
              placeholder="Other allergies (comma separated)"
              className="mt-3 w-full rounded-2xl border border-line bg-soft px-4 py-3 text-sm outline-none focus:border-brand/50"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">
              Other medical notes
            </label>
            <textarea
              value={medicalInfo}
              onChange={(e) => setMedicalInfo(e.target.value)}
              placeholder="Medications, chronic conditions, implants…"
              rows={5}
              maxLength={2000}
              className="w-full resize-y rounded-2xl border border-line bg-soft px-4 py-3 text-sm leading-relaxed outline-none focus:border-brand/50"
            />
            <p className="mt-1.5 text-right text-xs text-faint">{medicalInfo.length}/2000</p>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-2xl border border-brand/25 bg-brand/5 px-3 py-2 text-sm text-brand">{error}</p>
      )}
      {saved && !error && <p className="text-sm text-emerald-500">Saved successfully.</p>}

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
