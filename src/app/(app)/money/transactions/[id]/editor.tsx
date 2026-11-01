"use client";

import { useState, useTransition } from "react";
import { setCategory } from "@/app/actions/finance";
import { CategorySelect, type Cat } from "../../category-select";

export function CategoryEditor({
  t,
  categories,
  defaultPattern,
}: {
  t: { id: string; category_id: string | null; note: string | null; person: string | null; source: string };
  categories: Cat[];
  defaultPattern: string;
}) {
  const [categoryId, setCategoryId] = useState(t.category_id ?? "");
  const [note, setNote] = useState(t.note ?? "");
  const [person, setPerson] = useState(t.person ?? "");
  const [remember, setRemember] = useState(false);
  const [pattern, setPattern] = useState(defaultPattern);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const kind = categories.find((c) => c.id === categoryId)?.kind;

  return (
    <div className="space-y-3">
      <CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} />
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note — what was this?" className="input" />
      {(kind === "lending" || person) && <input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Person" className="input" />}
      {t.source === "statement" && (
        <label className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Also use this for every payment containing
          <input value={pattern} onChange={(e) => setPattern(e.target.value)} disabled={!remember} className="rounded border border-slate-300 px-1.5 py-0.5 text-sm disabled:bg-slate-50" />
        </label>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          className="btn-primary"
          onClick={() =>
            start(async () => {
              const r = await setCategory({ transactionId: t.id, categoryId: categoryId || null, remember, pattern, note, person: person || null });
              setMsg(r.error ?? (r.alsoUpdated ? `Saved. ${r.alsoUpdated} similar transaction${r.alsoUpdated === 1 ? "" : "s"} updated too.` : "Saved."));
            })
          }
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
      </div>
    </div>
  );
}

export function RestoreButton({ transactionId, categoryId, label }: { transactionId: string; categoryId: string | null; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => void (await setCategory({ transactionId, categoryId })))}
      className="text-xs text-brand-600 hover:underline"
    >
      {pending ? "…" : `Go back to “${label}”`}
    </button>
  );
}
