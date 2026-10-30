/** Rounds a head-count for display: exact below 100, then to the nearest 10, 100 or 1,000. */
export function roundPeople(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n < 100) return Math.round(n);
  if (n < 1000) return Math.round(n / 10) * 10;
  if (n < 100_000) return Math.round(n / 100) * 100;
  return Math.round(n / 1000) * 1000;
}

/** "≈ 52,300" for an estimate, "52,300" for a count. */
export function formatPeople(n: number, approx: boolean): string {
  const v = approx ? roundPeople(n) : Math.round(n);
  return `${approx ? '≈ ' : ''}${v.toLocaleString('en')}`;
}

export function percentOf(part: number, whole: number): string {
  if (!(whole > 0)) return '-';
  const p = (100 * part) / whole;
  if (part > 0 && p < 1) return '<1%';
  return `${Math.round(p)}%`;
}
