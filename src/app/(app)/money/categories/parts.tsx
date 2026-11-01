"use client";

import { useState } from "react";
import { saveCategory } from "@/app/actions/finance";
import { ActionForm, SubmitButton } from "@/components/forms";
import { KIND_LABEL } from "@/lib/finance/categories";

type C = { id: string; name: string; kind: string; emoji: string | null; is_business: boolean };

export function CategoryForm({ c, onDone }: { c?: C; onDone?: () => void }) {
  return (
    <ActionForm action={saveCategory.bind(null, c?.id ?? null)} resetOnSuccess={!c} onSuccess={onDone} className="grid gap-2 sm:grid-cols-6">
      <input name="emoji" defaultValue={c?.emoji ?? ""} placeholder="🙂" className="input sm:col-span-1" aria-label="Emoji" />
      <input name="name" defaultValue={c?.name} required placeholder="Name" className="input sm:col-span-2" aria-label="Name" />
      <select name="kind" defaultValue={c?.kind ?? "expense"} className="input sm:col-span-2" aria-label="Counts as">
        {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <SubmitButton>{c ? "Save" : "Add"}</SubmitButton>
      <label className="flex items-center gap-1.5 text-xs text-slate-600 sm:col-span-6">
        <input type="checkbox" name="is_business" defaultChecked={c?.is_business} /> Creator work expense (shown separately for tax time)
      </label>
    </ActionForm>
  );
}

export function EditCategory({ c }: { c: C }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <div className="mt-2 w-full rounded-lg bg-slate-50 p-3"><CategoryForm c={c} onDone={() => setOpen(false)} /></div>
  ) : (
    <button type="button" onClick={() => setOpen(true)} className="text-xs text-brand-600 hover:underline">Edit</button>
  );
}
