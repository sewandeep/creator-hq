"use client";

import { useState } from "react";

export type MonthPoint = { key: string; label: string; gross: number; tds: number };

const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
const short = (n: number) => (n >= 100000 ? `₹${(n / 100000).toFixed(n % 100000 ? 1 : 0)}L` : n >= 1000 ? `₹${Math.round(n / 1000)}k` : `₹${n}`);

/** Single-series monthly income bars with a hover tooltip. */
export function IncomeChart({ data }: { data: MonthPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.gross));
  // Round the top gridline up to a tidy number.
  const step = 10 ** Math.floor(Math.log10(max));
  const top = Math.ceil(max / step) * step;
  const ticks = [0, top / 2, top];
  const h = 180;

  return (
    <div>
      <div className="relative flex gap-2" style={{ height: h + 24 }}>
        {/* y-axis labels */}
        <div className="relative w-10 shrink-0 text-right text-[11px] text-slate-400" style={{ height: h }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: h - (t / top) * h }}>
              {short(t)}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-slate-100" style={{ top: h - (t / top) * h }} />
          ))}
          <div className="absolute inset-x-0 top-0 flex items-end gap-[2px]" style={{ height: h }}>
            {data.map((d, i) => (
              <div
                key={d.key}
                className="group relative flex h-full flex-1 cursor-default items-end justify-center"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onClick={() => setHover(hover === i ? null : i)}
              >
                <div
                  className={`w-full max-w-7 rounded-t-[4px] transition-opacity ${hover === null || hover === i ? "opacity-100" : "opacity-50"}`}
                  style={{ height: Math.max(d.gross ? 2 : 0, (d.gross / top) * h), background: "#7c3aed" }}
                />
                {hover === i && (
                  <div className="pointer-events-none absolute bottom-full z-10 mb-2 w-max rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                    <div className="font-semibold text-slate-900">{d.label}</div>
                    <div className="text-slate-700">Income {inr(d.gross)}</div>
                    <div className="text-slate-500">In bank {inr(d.gross - d.tds)} · TDS {inr(d.tds)}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="absolute inset-x-0 flex gap-[2px] text-center text-[11px] text-slate-400" style={{ top: h + 6 }}>
            {data.map((d) => (
              <span key={d.key} className="flex-1 truncate">{d.label.split(" ")[0]}</span>
            ))}
          </div>
        </div>
      </div>
      {/* Table view for exact numbers / screen readers */}
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-xs text-slate-500">Show as table</summary>
        <table className="mt-2 w-full text-xs">
          <tbody className="divide-y divide-slate-100">
            {data.map((d) => (
              <tr key={d.key}>
                <td className="py-1 text-slate-600">{d.label}</td>
                <td className="py-1 text-right tabular-nums">{inr(d.gross)}</td>
                <td className="py-1 text-right text-slate-500 tabular-nums">TDS {inr(d.tds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
