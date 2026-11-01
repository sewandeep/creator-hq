"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { PLATFORMS, SOURCES, STAGES } from "@/lib/constants";
import type { ActionState } from "@/lib/forms";
import type { Deal } from "@/lib/types";

type Option = { id: string; name: string };
type ContactOption = Option & { brand_id: string | null; email: string | null };

export function DealForm({
  action,
  brands,
  contacts,
  deal,
  defaults = {},
  today,
  submitLabel,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  brands: Option[];
  contacts: ContactOption[];
  deal?: Deal;
  defaults?: { brand_id?: string; stage?: string };
  today: string;
  submitLabel: string;
}) {
  const [brandId, setBrandId] = useState(deal?.brand_id ?? defaults.brand_id ?? "");
  const [newBrand, setNewBrand] = useState(brands.length === 0);
  const [stage, setStage] = useState(deal?.stage ?? defaults.stage ?? "lead");
  const [barter, setBarter] = useState(deal?.is_barter ?? false);
  const brandContacts = contacts.filter((c) => !brandId || c.brand_id === brandId);

  return (
    <ActionForm action={action} className="space-y-6">
      <section className="card space-y-4 p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-800">Brand & deal</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="label mb-0">Brand</span>
              {brands.length > 0 && (
                <button type="button" onClick={() => setNewBrand((v) => !v)} className="text-xs text-brand-600 hover:underline">
                  {newBrand ? "Pick existing brand" : "+ New brand"}
                </button>
              )}
            </div>
            {newBrand ? (
              <input name="new_brand" placeholder="e.g. boAt, Mamaearth" required className="input" autoFocus={!deal} />
            ) : (
              <select name="brand_id" value={brandId} onChange={(e) => setBrandId(e.target.value)} required className="input">
                <option value="">Choose a brand…</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <label className="block">
            <span className="label">Deal name</span>
            <input name="title" defaultValue={deal?.title} required placeholder="e.g. Diwali reel campaign" className="input" />
          </label>
          <label className="block">
            <span className="label">Stage</span>
            <select name="stage" value={stage} onChange={(e) => setStage(e.target.value)} className="input">
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">How it came in</span>
            <select name="source" defaultValue={deal?.source ?? ""} className="input">
              <option value="">—</option>
              {SOURCES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Platform</span>
            <input name="platform" list="platforms" defaultValue={deal?.platform ?? ""} placeholder="Instagram" className="input" />
            <datalist id="platforms">
              {PLATFORMS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
          <label className="block">
            <span className="label">Contact person</span>
            <select name="contact_id" defaultValue={deal?.contact_id ?? ""} className="input" disabled={newBrand}>
              <option value="">{newBrand ? "Add contacts on the brand page" : "—"}</option>
              {brandContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.email ? ` (${c.email})` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="card space-y-4 p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-800">Money</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="label">Fee (₹, before TDS)</span>
            <input name="amount" inputMode="decimal" defaultValue={deal?.amount ?? ""} placeholder="25000" className="input" />
          </label>
          <label className="flex items-center gap-2 pt-6 text-sm text-slate-700">
            <input type="checkbox" name="is_barter" checked={barter} onChange={(e) => setBarter(e.target.checked)} />
            Barter / free products
          </label>
          {barter && (
            <label className="block">
              <span className="label">Product value (₹)</span>
              <input name="barter_value" inputMode="decimal" defaultValue={deal?.barter_value ?? ""} className="input" />
            </label>
          )}
        </div>
      </section>

      <section className="card space-y-4 p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-800">Dates</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="label">Deal date</span>
            <input type="date" name="deal_date" defaultValue={deal?.deal_date ?? today} className="input" />
            <span className="mt-1 block text-xs text-slate-400">When it came in / was done — used for reports</span>
          </label>
          <label className="block">
            <span className="label">Content deadline</span>
            <input type="date" name="due_date" defaultValue={deal?.due_date ?? ""} className="input" />
          </label>
          <label className="block">
            <span className="label">Next follow-up</span>
            <input type="date" name="next_follow_up" defaultValue={deal?.next_follow_up ?? ""} className="input" />
          </label>
        </div>
        {stage === "lost" && (
          <label className="block">
            <span className="label">Why was it lost?</span>
            <input name="lost_reason" defaultValue={deal?.lost_reason ?? ""} placeholder="Budget too low, went with someone else…" className="input" />
          </label>
        )}
        <label className="block">
          <span className="label">Notes</span>
          <textarea name="notes" rows={4} defaultValue={deal?.notes ?? ""} placeholder="Brief summary, usage rights, special terms…" className="input" />
        </label>
      </section>

      <div className="flex gap-2">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}
