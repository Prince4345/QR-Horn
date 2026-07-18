import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  Shield,
  FileText,
  Camera,
  Upload,
  Trash2,
  Loader2,
  Eye,
  AlertTriangle,
  Check,
  Lock,
} from 'lucide-react';
import { api, type VaultDocumentMeta, type VaultSummary } from '../lib/api';
import { resizeImageDataUrl } from '../lib/imageResize';
import {
  VAULT_SINGLE_SLOTS,
  VAULT_PHOTO_SLOTS,
  VAULT_TYPE_LABELS,
  VAULT_PHOTO_LABELS,
  expiryBadgeClass,
  expiryLabel,
  type VaultDocumentType,
  type VaultPhotoSlot,
} from '../lib/vaultTypes';

interface VehicleVaultProps {
  vehicleId: string;
  vehicleVerified: boolean;
}

async function prepareFile(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
  if (file.type === 'application/pdf') return dataUrl;
  return resizeImageDataUrl(dataUrl, 1600, 2000, 'image/jpeg');
}

function docKey(type: VaultDocumentType, photoSlot?: string | null) {
  return photoSlot ? `${type}:${photoSlot}` : type;
}

export default function VehicleVault({ vehicleId, vehicleVerified }: VehicleVaultProps) {
  const [documents, setDocuments] = useState<VaultDocumentMeta[]>([]);
  const [summary, setSummary] = useState<VaultSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [viewMime, setViewMime] = useState<string | null>(null);
  const [expiryDrafts, setExpiryDrafts] = useState<Record<string, string>>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const loadVault = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getVehicleVault(vehicleId);
      setDocuments(data.documents);
      setSummary(data.summary);
      const drafts: Record<string, string> = {};
      for (const doc of data.documents) {
        if (doc.expiresAt) {
          drafts[docKey(doc.type, doc.photoSlot)] = doc.expiresAt.slice(0, 10);
        }
      }
      setExpiryDrafts(drafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vault');
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => {
    void loadVault();
  }, [loadVault]);

  const docMap = new Map(documents.map((d) => [docKey(d.type, d.photoSlot), d]));

  const handleUpload = async (
    type: VaultDocumentType,
    file: File,
    photoSlot?: VaultPhotoSlot,
    expiresAt?: string
  ) => {
    const key = docKey(type, photoSlot ?? null);
    setUploading(key);
    setError(null);
    try {
      const fileDataUrl = await prepareFile(file);
      await api.uploadVaultDocument(vehicleId, {
        type,
        photoSlot: photoSlot ?? null,
        fileDataUrl,
        fileName: file.name,
        expiresAt: expiresAt || null,
      });
      await loadVault();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(null);
    }
  };

  const handleFileChange =
    (type: VaultDocumentType, photoSlot?: VaultPhotoSlot, requiresExpiry?: boolean) =>
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;

      const key = docKey(type, photoSlot ?? null);
      const expiresAt = expiryDrafts[key] || undefined;
      await handleUpload(type, file, photoSlot, expiresAt);
    };

  const handleView = async (doc: VaultDocumentMeta) => {
    try {
      const file = await api.getVaultDocumentFile(vehicleId, doc.id);
      setViewUrl(file.dataUrl);
      setViewMime(file.mimeType);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open document');
    }
  };

  const handleDelete = async (doc: VaultDocumentMeta) => {
    if (!window.confirm('Remove this document from your vault?')) return;
    setError(null);
    try {
      await api.deleteVaultDocument(vehicleId, doc.id);
      await loadVault();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const renderSlot = (
    type: VaultDocumentType,
    label: string,
    photoSlot?: VaultPhotoSlot,
    hasExpiry = false
  ) => {
    const key = docKey(type, photoSlot ?? null);
    const doc = docMap.get(key);
    const busy = uploading === key;

    return (
      <div
        key={key}
        className="rounded-2xl border border-line bg-soft p-4 flex flex-col gap-3"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink truncate">{label}</p>
            {doc ? (
              <p className="text-[11px] text-faint truncate mt-0.5">{doc.fileName}</p>
            ) : (
              <p className="text-[11px] text-faint mt-0.5">Not uploaded</p>
            )}
          </div>
          {doc ? (
            <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            </span>
          ) : (
            <span className="shrink-0 w-6 h-6 rounded-full bg-surface flex items-center justify-center">
              <Upload className="w-3 h-3 text-faint" />
            </span>
          )}
        </div>

        {hasExpiry && (
          <input
            type="date"
            value={expiryDrafts[key] ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              setExpiryDrafts((prev) => ({ ...prev, [key]: val }));
            }}
            onBlur={() => {
              if (!doc || !expiryDrafts[key]) return;
              void api
                .updateVaultDocumentExpiry(vehicleId, doc.id, expiryDrafts[key])
                .then(() => loadVault())
                .catch((err) =>
                  setError(err instanceof Error ? err.message : 'Failed to update expiry')
                );
            }}
            className="w-full px-3 py-2 rounded-xl bg-surface border border-line text-sm text-ink outline-none focus:border-brand/50"
          />
        )}

        {doc?.expiresAt && (
          <span
            className={`text-[11px] px-2 py-1 rounded-lg border w-fit ${expiryBadgeClass(doc.expiryStatus)}`}
          >
            {expiryLabel(doc.expiryStatus, doc.expiresAt)}
          </span>
        )}

        <div className="flex gap-2 mt-auto">
          <input
            ref={(el) => {
              fileRefs.current[key] = el;
            }}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={handleFileChange(type, photoSlot, hasExpiry)}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRefs.current[key]?.click()}
            className="flex-1 py-2 rounded-xl bg-brand/10 border border-brand/25 text-brand hover:bg-brand/15 text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {doc ? 'Replace' : 'Upload'}
          </button>
          {doc && (
            <>
              <button
                type="button"
                onClick={() => void handleView(doc)}
                className="px-3 py-2 rounded-xl bg-soft hover:bg-soft text-xs"
                title="View"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(doc)}
                className="px-3 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-brand text-xs"
                title="Remove"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 min-h-0">
      <div className="rounded-2xl bg-brand/10 border border-brand/25 p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand/15 flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5 text-brand" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">Private document vault</p>
            <p className="text-xs text-muted mt-1">
              Only you can see these files. Scanners never get access. All uploads are optional.
            </p>
            {summary && (
              <p className="text-xs text-muted mt-2">
                {summary.uploaded} of {summary.totalSlots} slots filled
                {summary.expiringSoon > 0 && ` · ${summary.expiringSoon} expiring soon`}
                {summary.expired > 0 && ` · ${summary.expired} expired`}
              </p>
            )}
            {vehicleVerified && (
              <p className="text-[11px] text-emerald-400/90 mt-1 flex items-center gap-1">
                <Shield className="w-3 h-3" /> Vehicle ownership verified via RC
              </p>
            )}
          </div>
        </div>
      </div>

      {(summary?.expiringSoon ?? 0) > 0 || (summary?.expired ?? 0) > 0 ? (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 px-3 py-2 text-xs text-amber-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Renew insurance or PUC before they expire to stay road-legal.
        </div>
      ) : null}

      {error && <p className="text-brand text-sm">{error}</p>}

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-faint mb-3 flex items-center gap-2">
          <FileText className="w-3.5 h-3.5" /> Documents
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {VAULT_SINGLE_SLOTS.map((slot) =>
            renderSlot(slot.type, VAULT_TYPE_LABELS[slot.type], undefined, slot.hasExpiry)
          )}
        </div>
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-faint mb-3 flex items-center gap-2">
          <Camera className="w-3.5 h-3.5" /> Vehicle photos
        </h4>
        <p className="text-xs text-faint mb-3">Helpful for theft mode and insurance claims.</p>
        <div className="grid grid-cols-2 gap-3">
          {VAULT_PHOTO_SLOTS.map((slot) =>
            renderSlot('VEHICLE_PHOTO', VAULT_PHOTO_LABELS[slot], slot, false)
          )}
        </div>
      </div>

      {viewUrl && (
        <div
          className="fixed inset-0 z-[120] bg-ink/50 flex items-center justify-center p-4"
          onClick={() => {
            setViewUrl(null);
            setViewMime(null);
          }}
        >
          <div
            className="max-w-lg w-full max-h-[85dvh] overflow-auto rounded-2xl bg-surface border border-line p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-3">
              <p className="text-sm font-medium text-ink">Document preview</p>
              <button
                type="button"
                onClick={() => {
                  setViewUrl(null);
                  setViewMime(null);
                }}
                className="text-muted hover:text-ink text-sm"
              >
                Close
              </button>
            </div>
            {viewMime?.includes('pdf') ? (
              <iframe src={viewUrl} title="Document" className="w-full h-[70dvh] rounded-lg bg-white" />
            ) : (
              <img src={viewUrl} alt="Vault document" className="w-full rounded-lg object-contain max-h-[70dvh]" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
