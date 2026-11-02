"use client";

import { useState } from "react";

export type MonthBar = { key: string; label: string; value: number; detail?: string };

const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
const short = (n: number) => (n >= 100000 ? `₹${(n / 100000).toFixed(n % 100000 ? 1 : 0)}L` : n >= 1000 ? `₹${Math.round(n / 1000)}k` : `₹${Math.round(n)}`);

/** One series of monthly bars with a hover/tap tooltip and a table view. */
export function MonthBars({ data, color = "#7c3aed", height = 160, valueLabel }: { data: MonthBar[]; color?: string; height?: number; valueLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = 10 ** Math.floor(Math.log10(max));
  const top = Math.ceil(max / step) * step;
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <p className="py-8 text-center text-sm text-slate-500">Nothing recorded yet.</p>;
  return (
    <div>
      <div className="relative flex gap-2" style={{ height: height + 22 }}>
        <div className="relative w-9 shrink-0 text-right text-[10px] text-slate-400" style={{ height }}>
          {[0, top / 2, top].map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: height - (t / top) * height }}>{short(t)}</span>
          ))}
        </div>
        <div className="relative flex-1">
          {[0, top / 2, top].map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-slate-100" style={{ top: height - (t / top) * height }} />
          ))}
          <div className="absolute inset-x-0 top-0 flex items-end gap-[2px]" style={{ height }}>
            {data.map((d, i) => (
              <div key={d.key} className="relative flex h-full flex-1 items-end justify-center" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(hover === i ? null : i)}>
                <div className={`w-full max-w-6 rounded-t-[4px] transition-opacity ${hover === null || hover === i ? "" : "opacity-50"}`} style={{ height: Math.max(d.value ? 2 : 0, (d.value / top) * height), background: color }} />
                {hover === i && (
                  <div className="pointer-events-none absolute bottom-full z-10 mb-2 w-max rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-lg">
                    <div className="font-semibold">{d.label}</div>
                    <div>{valueLabel} {inr(d.value)}</div>
                    {d.detail && <div className="text-slate-500">{d.detail}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="absolute inset-x-0 flex gap-[2px] text-center text-[10px] text-slate-400" style={{ top: height + 5 }}>
            {data.map((d) => <span key={d.key} className="flex-1 truncate">{d.label.split(" ")[0]}</span>)}
          </div>
        </div>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-slate-500">Show as table</summary>
        <table className="mt-2 w-full text-xs">
          <tbody className="divide-y divide-slate-100">
            {data.map((d) => (
              <tr key={d.key}><td className="py-1 text-slate-600">{d.label}</td><td className="py-1 text-right tabular-nums">{inr(d.value)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
