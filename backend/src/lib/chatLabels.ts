/** Short label so owners can tell multiple Anonymous chats apart (matches frontend). */
export function anonymousScannerLabel(sessionId: string): string {
  const short = sessionId.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase() || 'USER';
  return `Anonymous · ${short}`;
}

export function displayScannerLabel(session: {
  id: string;
  scannerName?: string | null;
}): string {
  const name = session.scannerName?.trim();
  if (name) return name;
  return anonymousScannerLabel(session.id);
}
