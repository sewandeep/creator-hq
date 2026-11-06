"use client";

import { useState, useTransition } from "react";
import { updatePartyField, type PartyFieldName } from "@/app/actions/deal-money";
import { toast } from "@/components/toast";

/** One detail of an agency/brand: tap to change, Enter or tap away to save. */
export function PartyField({ brandId, field, label, value, placeholder = "Add", long = false }: { brandId: string; field: PartyFieldName; label: string; value: string | null; placeholder?: string; long?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [shown, setShown] = useState(value ?? "");
  const [, start] = useTransition();
  const save = (raw: string) => {
    setEditing(false);
    if (raw.trim() === (shown ?? "").trim()) return;
    const before = shown;
    setShown(raw.trim());
    start(async () => {
      const r = await updatePartyField(brandId, field, raw);
      if (r.error) {
        setShown(before);
        toast(r.error, { tone: "error" });
      } else toast(`${label} saved`, { undoGroup: r.groupId });
    });
  };
  return (
    <div className={long ? "sm:col-span-2" : ""}>
      <div className="text-xs text-slate-500">{label}</div>
      {editing ? (
        long ? (
          <textarea autoFocus rows={2} defaultValue={shown} onBlur={(e) => save(e.currentTarget.value)} onKeyDown={(e) => e.key === "Escape" && setEditing(false)} className="input mt-0.5 py-1" />
        ) : (
          <input
            autoFocus
            defaultValue={shown}
            onBlur={(e) => save(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setEditing(false);
            }}
            className="input mt-0.5 py-1"
          />
        )
      ) : (
        <button type="button" onClick={() => setEditing(true)} className={`-mx-1 mt-0.5 block w-full rounded-md px-1 text-left hover:bg-slate-100 ${shown ? "font-medium" : "text-slate-400"} ${long ? "whitespace-pre-wrap" : "truncate"}`}>
          {shown || placeholder}
        </button>
      )}
    </div>
  );
}
