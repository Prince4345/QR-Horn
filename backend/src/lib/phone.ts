export function formatE164(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (trimmed.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  if (digits.length >= 11) return `+${digits}`;

  return null;
}

/** Fast2SMS expects a 10-digit Indian mobile (no +91). */
export function formatIndianMobile(phone: string): string | null {
  const e164 = formatE164(phone);
  if (!e164) return null;
  const digits = e164.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return digits.slice(2);
  if (digits.length === 10) return digits;
  return null;
}
