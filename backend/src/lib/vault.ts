import type { VaultDocumentType } from '@prisma/client';

export const VAULT_PHOTO_SLOTS = ['front', 'back', 'left', 'right'] as const;
export type VaultPhotoSlot = (typeof VAULT_PHOTO_SLOTS)[number];

export const VAULT_SINGLE_TYPES: VaultDocumentType[] = [
  'RC',
  'INSURANCE',
  'PUC',
  'DRIVING_LICENSE',
];

export const VAULT_EXPIRY_TYPES: VaultDocumentType[] = ['INSURANCE', 'PUC'];

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

export type VaultExpiryStatus = 'none' | 'ok' | 'soon' | 'expired';

const SOON_DAYS = 30;

export function getExpiryStatus(expiresAt: Date | string | null | undefined): VaultExpiryStatus {
  if (!expiresAt) return 'none';
  const date = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  if (Number.isNaN(date.getTime())) return 'none';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const expDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((expDay.getTime() - startOfToday.getTime()) / 86400000);
  if (diffDays < 0) return 'expired';
  if (diffDays <= SOON_DAYS) return 'soon';
  return 'ok';
}

export function parseVaultType(value: string): VaultDocumentType | null {
  const upper = value.toUpperCase().replace(/-/g, '_');
  if (upper === 'RC') return 'RC';
  if (upper === 'INSURANCE') return 'INSURANCE';
  if (upper === 'PUC') return 'PUC';
  if (upper === 'DRIVING_LICENSE' || upper === 'DL') return 'DRIVING_LICENSE';
  if (upper === 'VEHICLE_PHOTO' || upper === 'PHOTO') return 'VEHICLE_PHOTO';
  return null;
}

export function isPhotoSlot(value: string): value is VaultPhotoSlot {
  return (VAULT_PHOTO_SLOTS as readonly string[]).includes(value);
}
