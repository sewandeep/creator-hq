"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { importDeals, type ImportResult } from "@/app/actions/import";
import { StageBadge } from "@/components/ui";
import { fmtDate, rupees } from "@/lib/format";
import { IMPORT_FIELDS, buildRows, guessMapping, parseTable, type ColumnMapping, type ImportFieldId } from "@/lib/import";

const EXAMPLE = `Brand\tDate\tDeliverables\tAmount\tPlatform\tStatus
boAt\t15/03/2025\t1 reel + 2 stories\t35,000\tInstagram\tPaid
Mamaearth\tMar 2025\t2 reels\t40k\tInstagram\tPaid
Noise\t2025-05-02\t1 YT integration\t60000\tYouTube\tInvoiced
Lenskart\t10 Jun 2025\t3 stories\tBarter\tInstagram\tPosted`;

export function ImportWizard() {
  const [raw, setRaw] = useState("");
  const [hasHeader, setHasHeader] = useState(true);
  const [mappingOverride, setMappingOverride] = useState<ColumnMapping | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  const table = useMemo(() => parseTable(raw), [raw]);
  const width = Math.max(0, ...table.map((r) => r.length));
  const headers = hasHeader && table[0] ? table[0] : Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
  const guessed = useMemo(() => (hasHeader && table[0] ? guessMapping(table[0]) : headers.map(() => "" as const)), [table, hasHeader]); // eslint-disable-line react-hooks/exhaustive-deps
  const mapping: ColumnMapping = mappingOverride && mappingOverride.length === headers.length ? mappingOverride : guessed;
  const dataRows = hasHeader ? table.slice(1) : table;
  const rows = useMemo(() => buildRows(dataRows, mapping), [dataRows, mapping]);

  const valid = rows.filter((r) => r.brand);
  const warnings = rows.filter((r) => r.warnings.length).length;
  const total = valid.reduce((t, r) => t + Number(r.amount ?? 0), 0);

  function setColumn(i: number, field: ImportFieldId | "") {
    const next = [...mapping];
    // A field can only be used by one column.
    if (field) next.forEach((f, j) => f === field && (next[j] = ""));
    next[i] = field;
    setMappingOverride(next);
  }

  async function onFile(file: File) {
    setRaw(await file.text());
    setMappingOverride(null);
    setResult(null);
  }

  function save() {
    setResult(null);
    startTransition(async () => {
      const r = await importDeals({ text: raw, mapping, hasHeader });
      setResult(r);
      if (!r.error) {
        setRaw("");
        setMappingOverride(null);
      }
    });
  }

  if (result && !result.error) {
    return (
      <div className="card p-6 text-center">
        <div className="text-3xl">✅</div>
        <h2 className="mt-2 text-lg font-semibold">Imported {result.deals} collaborations</h2>
        <p className="text-sm text-slate-500">
          {result.brands} new brand{result.brands === 1 ? "" : "s"} added
          {result.skipped ? ` · ${result.skipped} rows skipped (no brand)` : ""}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Link href="/history" className="btn-primary">See your history</Link>
          <button className="btn-secondary" onClick={() => setResult(null)}>Import more</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="card space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">1. Paste your data</h2>
          <div className="flex items-center gap-3 text-sm">
            <label className="btn-secondary cursor-pointer">
              Upload CSV
              <input type="file" accept=".csv,.tsv,.txt,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
            <button type="button" className="text-brand-600 hover:underline" onClick={() => { setRaw(EXAMPLE); setMappingOverride(null); }}>
              Try an example
            </button>
          </div>
        </div>
        <textarea
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setMappingOverride(null);
            setResult(null);
          }}
          rows={8}
          placeholder={"Copy the rows (with the header row) from your sheet and paste here.\n\nI understand things like: 15/03/2025, Mar 2025, 35,000, 40k, 1.2L, Barter, \"1 reel + 2 stories\"."}
          className="input font-mono text-xs"
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={hasHeader} onChange={(e) => { setHasHeader(e.target.checked); setMappingOverride(null); }} />
          First row is a header
        </label>
      </section>

      {table.length > 0 && (
        <section className="card space-y-3 p-4 sm:p-5">
          <h2 className="text-sm font-semibold">2. Check the columns</h2>
          <p className="text-sm text-slate-500">I guessed what each column is. Fix any that are wrong. Only &quot;Brand&quot; is required; anything without a status is saved as Paid.</p>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {headers.map((h, i) => (
              <label key={i} className="block">
                <span className="label truncate">“{h || `Column ${i + 1}`}” is…</span>
                <select value={mapping[i] ?? ""} onChange={(e) => setColumn(i, e.target.value as ImportFieldId | "")} className={`input ${mapping[i] ? "" : "text-slate-400"}`}>
                  <option value="">Ignore this column</option>
                  {IMPORT_FIELDS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </section>
      )}

      {rows.length > 0 && (
        <section className="card p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              3. Preview — {valid.length} collaboration{valid.length === 1 ? "" : "s"}, {rupees(total)}
            </h2>
            {warnings > 0 && <span className="text-sm text-amber-700">⚠ {warnings} row{warnings === 1 ? "" : "s"} need a look</span>}
          </div>
          <div className="-mx-4 overflow-x-auto sm:-mx-5">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead>
                <tr>
                  <th className="th">Brand</th>
                  <th className="th">Deal</th>
                  <th className="th">Date</th>
                  <th className="th">Deliverables</th>
                  <th className="th text-right">Amount</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.slice(0, 200).map((r, i) => (
                  <tr key={i} className={r.warnings.length ? "bg-amber-50/60" : ""}>
                    <td className="td font-medium">{r.brand || <span className="text-rose-600">missing</span>}</td>
                    <td className="td">{r.title}</td>
                    <td className="td whitespace-nowrap">{r.deal_date ? fmtDate(r.deal_date) : <span className="text-slate-400">today</span>}</td>
                    <td className="td">{r.deliverables.map((d) => `${d.quantity > 1 ? `${d.quantity}× ` : ""}${d.type}`).join(", ") || "—"}</td>
                    <td className="td text-right tabular-nums">{r.amount ? rupees(r.amount) : r.is_barter ? "Barter" : "—"}</td>
                    <td className="td">
                      <StageBadge stage={r.stage} />
                      {r.warnings.map((w) => (
                        <div key={w} className="mt-1 text-xs text-amber-800">{w}</div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 200 && <p className="px-5 pt-2 text-xs text-slate-500">Showing the first 200 of {rows.length} rows.</p>}
          </div>
          {result?.error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{result.error}</p>}
          <div className="mt-4">
            <button type="button" onClick={save} disabled={pending || valid.length === 0 || !mapping.includes("brand")} className="btn-primary">
              {pending ? "Importing…" : `Import ${valid.length} collaboration${valid.length === 1 ? "" : "s"}`}
            </button>
            {!mapping.includes("brand") && <span className="ml-3 text-sm text-rose-600">Pick which column is the Brand.</span>}
          </div>
        </section>
      )}
    </div>
  );
}
