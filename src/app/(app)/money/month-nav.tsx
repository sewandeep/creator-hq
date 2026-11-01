import Link from "next/link";
import { monthLabel, shiftMonth } from "@/lib/finance/report";

export function MonthNav({ ym, base, current, extra = "" }: { ym: string; base: string; current: string; extra?: string }) {
  return (
    <div className="flex items-center gap-1">
      <Link href={`${base}?month=${shiftMonth(ym, -1)}${extra}`} className="btn-secondary px-2.5" aria-label="Previous month">←</Link>
      <span className="min-w-32 text-center text-sm font-medium">{monthLabel(ym)}</span>
      {ym < current ? (
        <Link href={`${base}?month=${shiftMonth(ym, 1)}${extra}`} className="btn-secondary px-2.5" aria-label="Next month">→</Link>
      ) : (
        <span className="btn-secondary pointer-events-none px-2.5 opacity-40">→</span>
      )}
    </div>
  );
}
