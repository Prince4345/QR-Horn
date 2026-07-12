export function normalizePlate(number: string): string {
  return number.replace(/\s+/g, '').toUpperCase();
}
