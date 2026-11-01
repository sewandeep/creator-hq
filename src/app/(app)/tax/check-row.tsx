"use client";

import { useState } from "react";
import { saveTdsCheck } from "@/app/actions/tds";
import { ActionForm, SubmitButton } from "@/components/forms";

export function CheckForm({
  fy,
  brandId,
  tan,
  tds,
  amount,
  notes,
}: {
  fy: number;
  brandId: string;
  tan: string | null;
  tds: number | null;
  amount: number | null;
  notes: string | null;
}) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-brand-600 hover:underline">
        {tds === null ? "Enter 26AS figure" : "Edit"}
      </button>
    );
  return (
    <ActionForm action={saveTdsCheck.bind(null, fy, brandId)} onSuccess={() => setOpen(false)} className="mt-2 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-4">
      <label className="block">
        <span className="label">TDS in 26AS (₹)</span>
        <input name="tds_in_26as" defaultValue={tds ?? ""} inputMode="decimal" className="input" autoFocus />
      </label>
      <label className="block">
        <span className="label">Amount paid in 26AS (₹)</span>
        <input name="amount_in_26as" defaultValue={amount ?? ""} inputMode="decimal" className="input" />
      </label>
      <label className="block">
        <span className="label">Brand&apos;s TAN</span>
        <input name="tan" defaultValue={tan ?? ""} className="input uppercase" />
      </label>
      <label className="block">
        <span className="label">Notes</span>
        <input name="notes" defaultValue={notes ?? ""} className="input" />
      </label>
      <div className="flex items-center gap-2 sm:col-span-4">
        <SubmitButton>Save</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">Cancel</button>
        <span className="text-xs text-slate-500">Clear both amounts and save to remove the check.</span>
      </div>
    </ActionForm>
  );
}
