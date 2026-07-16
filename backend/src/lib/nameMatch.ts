const NAME_PREFIXES = /^(mr|mrs|ms|miss|shri|smt|dr|prof)\.?\s+/i;

/** Normalize a person name for fuzzy comparison. */
export function normalizePersonName(name: string): string {
  return name
    .toLowerCase()
    .replace(NAME_PREFIXES, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const next = Math.min(row[j] + 1, prev + 1, row[j - 1] + cost);
      row[j - 1] = prev;
      prev = next;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

/** Score 0–1 for how closely two names match. */
export function scoreNameMatch(accountName: string, rcName: string): number {
  const a = normalizePersonName(accountName);
  const b = normalizePersonName(rcName);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const aTokens = a.split(' ').filter(Boolean);
  const bTokens = b.split(' ').filter(Boolean);
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  let overlap = 0;
  for (const t of aSet) {
    if (bSet.has(t)) overlap++;
  }
  const tokenScore = overlap / Math.max(aSet.size, bSet.size, 1);

  const maxLen = Math.max(a.length, b.length);
  const editScore = 1 - levenshtein(a, b) / maxLen;

  return Math.max(tokenScore, editScore * 0.9);
}

export const OWNER_NAME_MATCH_THRESHOLD = 0.75;
