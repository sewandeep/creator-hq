"use client";

import { useMemo, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import type { ActionState } from "@/lib/forms";
import { TDS_SECTIONS } from "@/lib/money";

export type BrandOption = {
  id: string;
  name: string;
  legal_name: string | null;
  billing_address: string | null;
  gstin: string | null;
  pan: string | null;
};
export type DealOption = { id: string; title: string; brand_id: string };
export type ItemRow = { description: string; quantity: string; rate: string };

export type InvoiceDefaults = {
  brand_id: string;
  deal_id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  bill_to_name: string;
  bill_to_address: string;
  bill_to_gstin: string;
  bill_to_pan: string;
  tds_rate: string;
  tds_section: string;
  notes: string;
  items: ItemRow[];
};

const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
const num = (s: string) => {
  const n = Number(s.replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export function InvoiceForm({
  action,
  brands,
  deals,
  defaults,
  numberPlaceholder,
  submitLabel,
  mode,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  brands: BrandOption[];
  deals: DealOption[];
  defaults: InvoiceDefaults;
  numberPlaceholder: string;
  submitLabel: string;
  mode: "create" | "edit";
}) {
  const [brandId, setBrandId] = useState(defaults.brand_id);
  const [billTo, setBillTo] = useState({
    name: defaults.bill_to_name,
    address: defaults.bill_to_address,
    gstin: defaults.bill_to_gstin,
    pan: defaults.bill_to_pan,
  });
  const [items, setItems] = useState<ItemRow[]>(defaults.items.length ? defaults.items : [{ description: "", quantity: "1", rate: "" }]);
  const [tdsRate, setTdsRate] = useState(defaults.tds_rate);

  const total = useMemo(() => items.reduce((t, it) => t + num(it.quantity) * num(it.rate), 0), [items]);
  const tds = Math.round(total * num(tdsRate)) / 100;

  function pickBrand(id: string) {
    setBrandId(id);
    const b = brands.find((x) => x.id === id);
    if (b) setBillTo({ name: b.legal_name || b.name, address: b.billing_address ?? "", gstin: b.gstin ?? "", pan: b.pan ?? "" });
  }

  function setItem(i: number, patch: Partial<ItemRow>) {
    setItems((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  return (
    <ActionForm action={action} className="space-y-6">
      <section className="card grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
        <label className="block">
          <span className="label">Brand</span>
          <select name="brand_id" value={brandId} onChange={(e) => pickBrand(e.target.value)} required className="input">
            <option value="">Choose a brand…</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Deal (optional)</span>
          <select name="deal_id" defaultValue={defaults.deal_id} className="input">
            <option value="">—</option>
            {deals.filter((d) => !brandId || d.brand_id === brandId).map((d) => (
              <option key={d.id} value={d.id}>{d.title}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Invoice number</span>
          <input name="invoice_number" defaultValue={defaults.invoice_number} placeholder={numberPlaceholder} required={mode === "edit"} className="input" />
          {mode === "create" && <span className="mt-1 block text-xs text-slate-400">Leave empty to use {numberPlaceholder}</span>}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Invoice date</span>
            <input type="date" name="issue_date" defaultValue={defaults.issue_date} required className="input" />
          </label>
          <label className="block">
            <span className="label">Due date</span>
            <input type="date" name="due_date" defaultValue={defaults.due_date} className="input" />
          </label>
        </div>
      </section>

      <section className="card space-y-4 p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Bill to</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Company name</span>
            <input name="bill_to_name" value={billTo.name} onChange={(e) => setBillTo({ ...billTo, name: e.target.value })} required className="input" />
          </label>
          <label className="block">
            <span className="label">GSTIN (theirs, optional)</span>
            <input name="bill_to_gstin" value={billTo.gstin} onChange={(e) => setBillTo({ ...billTo, gstin: e.target.value })} className="input uppercase" />
          </label>
          <label className="block">
            <span className="label">Address</span>
            <textarea name="bill_to_address" rows={2} value={billTo.address} onChange={(e) => setBillTo({ ...billTo, address: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="label">PAN (theirs, optional)</span>
            <input name="bill_to_pan" value={billTo.pan} onChange={(e) => setBillTo({ ...billTo, pan: e.target.value })} className="input uppercase" />
          </label>
        </div>
        <p className="text-xs text-slate-400">Tip: save these on the brand page (Billing details) and they&apos;ll fill in automatically next time.</p>
      </section>

      <section className="card p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-semibold">Items</h2>
        <div className="space-y-3">
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-12 items-end gap-2">
              <label className="col-span-12 block sm:col-span-6">
                {i === 0 && <span className="label">Description</span>}
                <input name="item_description" value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder="Instagram Reel — Diwali campaign" className="input" />
              </label>
              <label className="col-span-3 block sm:col-span-1">
                {i === 0 && <span className="label">Qty</span>}
                <input name="item_quantity" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} inputMode="decimal" className="input" />
              </label>
              <label className="col-span-5 block sm:col-span-2">
                {i === 0 && <span className="label">Rate (₹)</span>}
                <input name="item_rate" value={it.rate} onChange={(e) => setItem(i, { rate: e.target.value })} inputMode="decimal" placeholder="25000" className="input" />
              </label>
              <div className="col-span-3 py-2 text-right text-sm font-medium tabular-nums sm:col-span-2">{inr(num(it.quantity) * num(it.rate))}</div>
              <button
                type="button"
                aria-label="Remove line"
                onClick={() => setItems((rows) => (rows.length > 1 ? rows.filter((_, j) => j !== i) : rows))}
                className="col-span-1 py-2 text-slate-400 hover:text-rose-600"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setItems((r) => [...r, { description: "", quantity: "1", rate: "" }])} className="btn-ghost mt-2 text-brand-600">
          + Add line
        </button>

        <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">TDS they&apos;ll cut (%)</span>
              <input name="tds_rate" value={tdsRate} onChange={(e) => setTdsRate(e.target.value)} inputMode="decimal" className="input" />
            </label>
            <label className="block">
              <span className="label">Section</span>
              <select name="tds_section" defaultValue={defaults.tds_section} className="input">
                {TDS_SECTIONS.map((t) => (
                  <option key={t.id} value={t.id}>{t.id === "other" ? "Other" : t.id}</option>
                ))}
              </select>
            </label>
          </div>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between text-base font-semibold">
              <dt>Invoice total</dt>
              <dd className="tabular-nums">{inr(total)}</dd>
            </div>
            <div className="flex justify-between text-slate-500">
              <dt>TDS @ {num(tdsRate)}%</dt>
              <dd className="tabular-nums">− {inr(tds)}</dd>
            </div>
            <div className="flex justify-between font-medium text-emerald-700">
              <dt>Expected in your bank</dt>
              <dd className="tabular-nums">{inr(total - tds)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="card p-4 sm:p-5">
        <label className="block">
          <span className="label">Notes on the invoice (optional)</span>
          <textarea name="notes" rows={2} defaultValue={defaults.notes} placeholder="PO number, campaign reference…" className="input" />
        </label>
      </section>

      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
