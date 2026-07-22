import { HeartPulse, Phone, ShieldAlert, User } from 'lucide-react';
import type { ScanSafetyInfo } from '../lib/api';

interface ScannerSafetyPanelProps {
  safety: ScanSafetyInfo;
  /** Show emergency phone — only when theft mode or Emergency reason selected */
  revealPhone: boolean;
  theftMode?: boolean;
}

export default function ScannerSafetyPanel({
  safety,
  revealPhone,
  theftMode,
}: ScannerSafetyPanelProps) {
  if (!safety.hasEmergency && !safety.hasMedical) return null;

  const allergies =
    safety.allergies
      ?.split(';')
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  return (
    <div
      className={`rounded-2xl border p-4 space-y-4 ${
        theftMode
          ? 'bg-red-500/10 border-red-500/40'
          : 'bg-brand/5 border-brand/25'
      }`}
    >
      <div className="flex items-center gap-2">
        <ShieldAlert className={`w-4 h-4 ${theftMode ? 'text-red-400' : 'text-brand'}`} />
        <p className={`text-sm font-semibold ${theftMode ? 'text-red-300' : 'text-brand'}`}>
          {theftMode ? 'Emergency info (theft alert)' : 'Emergency & medical info'}
        </p>
      </div>

      {safety.hasEmergency && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-faint font-bold">Emergency contact</p>
          {safety.emergencyContactName && (
            <div className="flex items-center gap-2 text-sm text-ink">
              <User className="w-4 h-4 text-muted shrink-0" />
              <span>{safety.emergencyContactName}</span>
            </div>
          )}
          {revealPhone && safety.emergencyContactPhone ? (
            <a
              href={`tel:${safety.emergencyContactPhone.replace(/\s+/g, '')}`}
              className="flex items-center gap-2 text-sm font-semibold text-brand hover:underline"
            >
              <Phone className="w-4 h-4 shrink-0" />
              <span className="font-mono tracking-wide">{safety.emergencyContactPhone}</span>
            </a>
          ) : safety.emergencyContactPhone ? (
            <p className="text-xs text-muted flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 shrink-0" />
              Select <span className="text-ink font-medium">Emergency</span> to reveal the phone number
            </p>
          ) : null}
        </div>
      )}

      {safety.hasMedical && (
        <div className="space-y-2 pt-1 border-t border-line/60">
          <p className="text-[10px] uppercase tracking-wider text-faint font-bold flex items-center gap-1.5">
            <HeartPulse className="w-3.5 h-3.5" />
            Medical
          </p>
          {safety.bloodGroup && (
            <p className="text-sm text-ink">
              <span className="text-muted">Blood group:</span>{' '}
              <span className="font-semibold">{safety.bloodGroup}</span>
            </p>
          )}
          {allergies.length > 0 && (
            <div>
              <p className="text-xs text-muted mb-1.5">Allergies</p>
              <div className="flex flex-wrap gap-1.5">
                {allergies.map((a) => (
                  <span
                    key={a}
                    className="px-2 py-0.5 rounded-full bg-soft text-[11px] text-ink border border-line"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}
          {safety.medicalInfo && (
            <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">{safety.medicalInfo}</p>
          )}
        </div>
      )}
    </div>
  );
}
