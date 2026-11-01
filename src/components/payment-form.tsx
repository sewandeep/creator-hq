"use client";

import { useState } from "react";
import { recordPayment } from "@/app/actions/payments";
import { ActionForm, SubmitButton } from "@/components/forms";
import { PAYMENT_MODES, TDS_SECTIONS } from "@/lib/money";

const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
const num = (s: string) => {
  const n = Number(s.replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Record a payment. You type what reached your bank and the TDS the brand cut;
 * the invoice amount it covers is worked out (net + TDS).
 */
export function PaymentForm({
  invoiceId,
  expectedNet,
  expectedTds,
  tdsSection,
  today,
  brands,
  deals,
  onDone,
}: {
  invoiceId?: string;
  expectedNet?: number;
  expectedTds?: number;
  tdsSection?: string | null;
  today: string;
  brands?: { id: string; name: string }[];
  deals?: { id: string; title: string; brand_id: string }[];
  onDone?: () => void;
}) {
  const [net, setNet] = useState(expectedNet ? String(expectedNet) : "");
  const [tds, setTds] = useState(expectedTds ? String(expectedTds) : "");
  const [brandId, setBrandId] = useState("");
  const gross = num(net) + num(tds);

  return (
    <ActionForm action={recordPayment} resetOnSuccess onSuccess={onDone} className="space-y-3">
      {invoiceId && <input type="hidden" name="invoice_id" value={invoiceId} />}
      <input type="hidden" name="gross_amount" value={gross ? String(Math.round(gross * 100) / 100) : ""} />

      {brands && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Brand</span>
            <select name="brand_id" value={brandId} onChange={(e) => setBrandId(e.target.value)} required className="input">
              <option value="">Choose…</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Deal (optional)</span>
            <select name="deal_id" className="input">
              <option value="">—</option>
              {(deals ?? []).filter((d) => d.brand_id === brandId).map((d) => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="label">Received in bank (₹)</span>
          <input name="net_amount" value={net} onChange={(e) => setNet(e.target.value)} inputMode="decimal" required className="input" />
        </label>
        <label className="block">
          <span className="label">TDS they cut (₹)</span>
          <input name="tds_amount" value={tds} onChange={(e) => setTds(e.target.value)} inputMode="decimal" placeholder="0" className="input" />
        </label>
        <label className="block">
          <span className="label">Date received</span>
          <input type="date" name="received_date" defaultValue={today} required className="input" />
        </label>
      </div>
      <p className="text-sm text-slate-600">
        Counts as <span className="font-semibold">{inr(gross)}</span> of the invoice ({inr(num(net))} in bank + {inr(num(tds))} TDS)
      </p>

      <details className="text-sm">
        <summary className="cursor-pointer text-slate-600">More details (TDS section, UTR, mode)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="label">TDS section</span>
            <select name="tds_section" defaultValue={tdsSection ?? "194J"} className="input">
              {TDS_SECTIONS.map((t) => (
                <option key={t.id} value={t.id}>{t.id === "other" ? "Other" : t.id}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Mode</span>
            <select name="mode" defaultValue="Bank transfer" className="input">
              {PAYMENT_MODES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">UTR / reference</span>
            <input name="reference" className="input" />
          </label>
          <label className="block sm:col-span-3">
            <span className="label">Notes</span>
            <input name="notes" className="input" />
          </label>
        </div>
      </details>

      {brands && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="mark_deal_paid" defaultChecked /> Mark the deal as Paid
        </label>
      )}
      <SubmitButton>Save payment</SubmitButton>
    </ActionForm>
  );
}
