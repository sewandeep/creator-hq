// Balance checks — the safety net for AI reading. Every bank statement prints
// a running balance, so each row must satisfy: previous balance ± amount =
// this balance. Rows where that fails are flagged for you to look at.

export type CheckRow = { amount: number; direction: "debit" | "credit"; balance: number | null };

export type CheckResult = {
  newestFirst: boolean;
  /** Indexes (printed order) whose balance doesn't follow from the row before. */
  breaks: number[];
  /** Indexes where debit/credit was read the wrong way round (fixed by the balance). */
  flipped: number[];
  totals: { debits: number; credits: number };
  /** opening + credits − debits = closing? null if the statement didn't show both. */
  totalsOk: boolean | null;
  /** How many rows could be checked against the running balance. */
  checked: number;
};

const near = (a: number, b: number, tol = 0.011) => Math.abs(a - b) <= tol;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function checkBalances(rows: CheckRow[], opening: number | null, closing: number | null): CheckResult {
  // Work out whether the statement lists oldest-first or newest-first.
  let asc = 0;
  let desc = 0;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1].balance;
    const b = rows[i].balance;
    if (a === null || b === null) continue;
    if (near(Math.abs(b - a), rows[i].amount)) asc++;
    if (near(Math.abs(a - b), rows[i - 1].amount)) desc++;
  }
  const newestFirst = desc > asc;
  const ordered = newestFirst ? [...rows.keys()].reverse() : [...rows.keys()];

  const breaks: number[] = [];
  const flipped: number[] = [];
  let checked = 0;
  let prev: number | null = opening;
  for (const idx of ordered) {
    const row = rows[idx];
    if (row.balance !== null && prev !== null) {
      const change = r2(row.balance - prev);
      if (near(Math.abs(change), row.amount)) {
        checked++;
        const dir = change >= 0 ? "credit" : "debit";
        if (dir !== row.direction && row.amount > 0) {
          flipped.push(idx);
          row.direction = dir;
        }
      } else {
        breaks.push(idx);
      }
    }
    if (row.balance !== null) prev = row.balance;
  }

  const debits = r2(rows.filter((r) => r.direction === "debit").reduce((t, r) => t + r.amount, 0));
  const credits = r2(rows.filter((r) => r.direction === "credit").reduce((t, r) => t + r.amount, 0));
  const totalsOk = opening !== null && closing !== null ? near(r2(opening + credits - debits), closing, 0.5) : null;
  return { newestFirst, breaks, flipped, totals: { debits, credits }, totalsOk, checked };
}
