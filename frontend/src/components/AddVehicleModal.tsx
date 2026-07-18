import { useState, useRef, type ChangeEvent, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Car,
  Bike,
  Loader2,
  FileText,
  Camera,
  Check,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Shield,
} from 'lucide-react';
import { api, type VehicleVerifyResult } from '../lib/api';
import { resizeImageDataUrl } from '../lib/imageResize';
import { APP_NAME } from '../lib/brand';

interface AddVehicleModalProps {
  onClose: () => void;
  onAdded: () => void;
}

type Step = 1 | 2 | 3 | 4;

async function readImageFile(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
  return resizeImageDataUrl(dataUrl, 1600, 2000, 'image/jpeg');
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 text-sm ${ok ? 'text-emerald-400' : 'text-brand'}`}>
      {ok ? <Check className="w-4 h-4 shrink-0" /> : <X className="w-4 h-4 shrink-0" />}
      <span>{label}</span>
    </div>
  );
}

export default function AddVehicleModal({ onClose, onAdded }: AddVehicleModalProps) {
  const rcInputRef = useRef<HTMLInputElement>(null);
  const plateInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>(1);
  const [rcPreview, setRcPreview] = useState<string | null>(null);
  const [platePreview, setPlatePreview] = useState<string | null>(null);
  const [typedPlate, setTypedPlate] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<'car' | 'bike'>('car');
  const [rcResult, setRcResult] = useState<VehicleVerifyResult | null>(null);
  const [plateResult, setPlateResult] = useState<VehicleVerifyResult | null>(null);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRcFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      setRcPreview(await readImageFile(file));
      setRcResult(null);
      setPlateResult(null);
      setVerificationId(null);
      setTypedPlate('');
    } catch {
      setError('Could not read RC image');
    }
    e.target.value = '';
  };

  const handlePlateFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      setPlatePreview(await readImageFile(file));
      setPlateResult(null);
    } catch {
      setError('Could not read plate photo');
    }
    e.target.value = '';
  };

  const runRcVerification = async () => {
    if (!rcPreview) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.verifyRcDocument({ rcImageDataUrl: rcPreview });
      setRcResult(result);
      if (result.ok && result.verificationId) {
        setVerificationId(result.verificationId);
        if (result.extracted.rcPlate) setTypedPlate(result.extracted.rcPlate);
        if (result.extracted.vehicleName) setName(result.extracted.vehicleName);
        if (result.extracted.vehicleType) setType(result.extracted.vehicleType);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read RC');
    } finally {
      setLoading(false);
    }
  };

  const runPlateVerification = async () => {
    if (!verificationId || !platePreview || !typedPlate.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.verifyPlatePhoto({
        verificationId,
        plateImageDataUrl: platePreview,
        typedPlate: typedPlate.trim(),
      });
      setPlateResult(result);
      if (result.ok) {
        setStep(3);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Plate verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!verificationId) return;
    setLoading(true);
    setError(null);
    try {
      await api.addVehicle({ verificationId, name: name.trim(), type });
      setStep(4);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add vehicle');
    } finally {
      setLoading(false);
    }
  };

  const stepTitles: Record<Step, string> = {
    1: 'Read RC',
    2: 'Verify plate',
    3: 'Confirm details',
    4: 'Done',
  };

  const rcVerified = rcResult?.ok === true;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-ink/40">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-surface border border-line rounded-[32px] p-6 sm:p-8 relative max-h-[90dvh] overflow-y-auto"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-muted hover:text-ink">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-5 h-5 text-emerald-400" />
          <h2 className="text-xl sm:text-2xl font-bold">Verify & Add Vehicle</h2>
        </div>
        <p className="text-muted text-sm mb-4">
          Step {Math.min(step, 3)} of 3 — {stepTitles[step]}
        </p>

        <div className="flex gap-1.5 mb-6">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full ${step >= s ? 'bg-emerald-500' : 'bg-soft'}`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              <p className="text-sm text-muted mb-4">
                Upload your RC first. We&apos;ll read it and fetch vehicle details before the plate step.
              </p>
              <input ref={rcInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleRcFile} />
              <button
                type="button"
                onClick={() => rcInputRef.current?.click()}
                className="w-full py-10 rounded-2xl border-2 border-dashed border-line hover:border-emerald-500/50 bg-surface flex flex-col items-center gap-3 transition-colors"
              >
                {rcPreview ? (
                  <img src={rcPreview} alt="RC preview" className="max-h-40 rounded-lg object-contain" />
                ) : (
                  <>
                    <FileText className="w-10 h-10 text-emerald-400/80" />
                    <span className="text-sm font-medium">Tap to upload RC</span>
                  </>
                )}
              </button>

              {rcPreview && !rcVerified && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void runRcVerification()}
                  className="w-full mt-3 py-3 bg-soft hover:bg-soft disabled:opacity-50 rounded-2xl font-medium flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Reading RC…
                    </>
                  ) : (
                    'Read RC & fetch details'
                  )}
                </button>
              )}

              {rcResult && (
                <div
                  className={`mt-4 rounded-2xl p-4 space-y-2 ${
 rcResult.ok
 ? 'bg-emerald-500/10 border border-emerald-500/30'
 : 'bg-brand/5 border border-brand/25'
 }`}
                >
                  {rcResult.ok ? (
                    <>
                      <p className="text-sm font-semibold text-emerald-700">Details from RC</p>
                      {rcResult.extracted.rcPlate && (
                        <p className="font-mono text-lg tracking-wider">{rcResult.extracted.rcPlate}</p>
                      )}
                      {rcResult.extracted.ownerNameOnRc && (
                        <p className="text-xs text-muted">Owner: {rcResult.extracted.ownerNameOnRc}</p>
                      )}
                      {rcResult.extracted.vehicleName && (
                        <p className="text-xs text-muted">Vehicle: {rcResult.extracted.vehicleName}</p>
                      )}
                      <CheckRow ok={rcResult.checks.ownerNameMatch} label="RC owner matches your account" />
                      {rcResult.checks.lowConfidenceWarning && (
                        <p className="text-amber-300 text-xs flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          Low confidence — double-check the plate above.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-brand text-sm">{rcResult.message}</p>
                  )}
                </div>
              )}

              {error && <p className="text-brand text-sm mt-3">{error}</p>}

              <button
                type="button"
                disabled={!rcVerified}
                onClick={() => { setError(null); setStep(2); }}
                className="w-full mt-4 py-3 bg-emerald-600 disabled:opacity-40 rounded-2xl font-semibold flex items-center justify-center gap-2"
              >
                Next — verify plate <ChevronRight className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              {rcResult?.extracted.rcPlate && (
                <div className="mb-4 rounded-xl bg-surface border border-line px-3 py-2 text-sm">
                  <span className="text-muted">Plate from RC: </span>
                  <span className="font-mono font-medium">{rcResult.extracted.rcPlate}</span>
                </div>
              )}
              <p className="text-sm text-muted mb-4">
                Now upload a photo of your number plate. It must match the RC plate above.
              </p>
              <input ref={plateInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePlateFile} />
              <button
                type="button"
                onClick={() => plateInputRef.current?.click()}
                className="w-full py-8 rounded-2xl border-2 border-dashed border-line hover:border-emerald-500/50 bg-surface flex flex-col items-center gap-3 mb-4 transition-colors"
              >
                {platePreview ? (
                  <img src={platePreview} alt="Plate preview" className="max-h-32 rounded-lg object-contain" />
                ) : (
                  <>
                    <Camera className="w-10 h-10 text-emerald-400/80" />
                    <span className="text-sm font-medium">Tap to upload plate photo</span>
                  </>
                )}
              </button>
              <input
                value={typedPlate}
                onChange={(e) => setTypedPlate(e.target.value.toUpperCase())}
                placeholder="Confirm plate number (e.g. DL 8C AA 1111)"
                className="w-full px-4 py-3 rounded-2xl bg-surface border border-line outline-none focus:border-emerald-500/50 font-mono tracking-wider"
              />
              {error && <p className="text-brand text-sm mt-3">{error}</p>}
              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => { setError(null); setStep(1); }}
                  className="px-4 py-3 rounded-2xl bg-soft flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                  type="button"
                  disabled={!platePreview || !typedPlate.trim() || !verificationId || loading}
                  onClick={() => void runPlateVerification()}
                  className="flex-1 py-3 bg-emerald-600 disabled:opacity-40 rounded-2xl font-semibold flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Reading plate…
                    </>
                  ) : (
                    'Verify plate photo'
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {step === 3 && plateResult?.ok && (
            <motion.form key="s3" onSubmit={handleSubmit} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-4 mb-4 space-y-2">
                <p className="text-sm font-semibold text-emerald-700">All checks passed</p>
                <p className="font-mono text-lg tracking-wider">{plateResult.extracted.rcPlate ?? typedPlate}</p>
                <CheckRow ok={plateResult.checks.platesMatch} label="RC plate matches plate photo" />
                <CheckRow ok={plateResult.checks.typedPlateMatch} label="Typed plate matches OCR" />
                <CheckRow ok={plateResult.checks.ownerNameMatch} label="RC owner matches your account" />
                {plateResult.checks.lowConfidenceWarning && (
                  <p className="text-amber-300 text-xs flex items-center gap-1.5 mt-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Low confidence read — double-check the plate above.
                  </p>
                )}
              </div>

              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Vehicle name (e.g. Honda City)"
                required
                className="w-full px-4 py-3 rounded-2xl bg-surface border border-line outline-none focus:border-emerald-500/50 mb-3"
              />

              <div className="flex gap-3 mb-4">
                {(['car', 'bike'] as const).map((t) => {
                  const Icon = t === 'car' ? Car : Bike;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={`flex-1 py-3 rounded-2xl border flex items-center justify-center gap-2 capitalize ${
 type === t ? 'bg-emerald-600/20 border-emerald-500/50 text-white' : 'bg-surface border-line text-muted'
 }`}
                    >
                      <Icon className="w-5 h-5" />
                      {t}
                    </button>
                  );
                })}
              </div>

              {error && <p className="text-brand text-sm mb-3">{error}</p>}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setError(null); setStep(2); }}
                  className="px-4 py-3 rounded-2xl bg-soft flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                  type="submit"
                  disabled={loading || !name.trim() || !verificationId}
                  className="flex-1 py-3 bg-emerald-600 disabled:opacity-40 rounded-2xl font-semibold flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Add & Generate QR
                </button>
              </div>
            </motion.form>
          )}

          {step === 4 && (
            <motion.div key="s4" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-emerald-400" />
              </div>
              <h3 className="text-xl font-bold mb-2">Vehicle verified & added</h3>
              <p className="text-muted text-sm mb-6">
                Your {APP_NAME} QR sticker is ready. Design and print it from the dashboard.
              </p>
              <button type="button" onClick={onClose} className="w-full py-3 bg-emerald-600 rounded-2xl font-semibold">
                Done
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
