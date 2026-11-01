// Indian financial year: 1 April → 31 March.

export function fyOf(isoDate: string) {
  const [y, m] = isoDate.split("-").map(Number);
  return m >= 4 ? y : y - 1; // FY 2026 = Apr 2026 – Mar 2027
}

export function fyRange(startYear: number) {
  return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` };
}

export function fyLabel(startYear: number) {
  return `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}
