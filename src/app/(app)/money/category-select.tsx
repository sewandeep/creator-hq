"use client";

import { setCategory } from "@/app/actions/finance";
import { KIND_LABEL, type CategoryKind } from "@/lib/finance/categories";

export type Cat = { id: string; name: string; kind: string; emoji: string | null };

/** A category dropdown grouped by Spending / Income / Transfer / Savings / Lending. */
export function CategorySelect({
  categories,
  value,
  onChange,
  name,
  className = "input",
  placeholder = "Choose a category…",
}: {
  categories: Cat[];
  value?: string;
  onChange?: (id: string) => void;
  name?: string;
  className?: string;
  placeholder?: string;
}) {
  const kinds = Object.keys(KIND_LABEL) as CategoryKind[];
  return (
    <select name={name} value={value} onChange={onChange ? (e) => onChange(e.target.value) : undefined} className={className}>
      <option value="">{placeholder}</option>
      {kinds.map((k) => {
        const items = categories.filter((c) => c.kind === k);
        if (!items.length) return null;
        return (
          <optgroup key={k} label={KIND_LABEL[k]}>
            {items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji ? `${c.emoji} ` : ""}
                {c.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}

/** Inline category changer for transaction lists (no "remember"). */
export function InlineCategory({ transactionId, categories, value }: { transactionId: string; categories: Cat[]; value: string | null }) {
  return (
    <form>
      <CategorySelect
        categories={categories}
        value={value ?? ""}
        placeholder="❓ Choose…"
        className={`w-full max-w-52 rounded-md border bg-white px-2 py-1 text-xs ${value ? "border-slate-200 text-slate-700" : "border-amber-300 text-amber-800"}`}
        onChange={(id) => void setCategory({ transactionId, categoryId: id || null })}
      />
    </form>
  );
}
