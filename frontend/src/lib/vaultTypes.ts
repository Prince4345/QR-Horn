export const VAULT_PHOTO_SLOTS = ['front', 'back', 'left', 'right'] as const;
export type VaultPhotoSlot = (typeof VAULT_PHOTO_SLOTS)[number];

export type VaultDocumentType =
  | 'RC'
  | 'INSURANCE'
  | 'PUC'
  | 'DRIVING_LICENSE'
  | 'VEHICLE_PHOTO';

export type VaultExpiryStatus = 'none' | 'ok' | 'soon' | 'expired';

export const VAULT_TYPE_LABELS: Record<VaultDocumentType, string> = {
  RC: 'Registration Certificate (RC)',
  INSURANCE: 'Insurance Policy',
  PUC: 'PUC / Pollution Certificate',
  DRIVING_LICENSE: 'Driving License',
  VEHICLE_PHOTO: 'Vehicle Photo',
};

export const VAULT_PHOTO_LABELS: Record<VaultPhotoSlot, string> = {
  front: 'Front',
  back: 'Back',
  left: 'Left side',
  right: 'Right side',
};

export const VAULT_SINGLE_SLOTS: { type: VaultDocumentType; hasExpiry: boolean }[] = [
  { type: 'RC', hasExpiry: false },
  { type: 'INSURANCE', hasExpiry: true },
  { type: 'PUC', hasExpiry: true },
  { type: 'DRIVING_LICENSE', hasExpiry: false },
];

export function formatExpiryDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function expiryBadgeClass(status: VaultExpiryStatus): string {
  switch (status) {
    case 'expired':
      return 'bg-red-500/20 text-red-300 border-red-500/30';
    case 'soon':
      return 'bg-amber-500/20 text-amber-200 border-amber-500/30';
    case 'ok':
      return 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30';
    default:
      return 'bg-white/10 text-white/50 border-white/10';
  }
}

export function expiryLabel(status: VaultExpiryStatus, expiresAt: string | null): string {
  if (!expiresAt) return '';
  const formatted = formatExpiryDate(expiresAt);
  if (status === 'expired') return `Expired ${formatted}`;
  if (status === 'soon') return `Expires ${formatted}`;
  return `Valid until ${formatted}`;
}
