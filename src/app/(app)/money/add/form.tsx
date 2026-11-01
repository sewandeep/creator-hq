"use client";

import { addEntryForm } from "@/app/actions/finance";
import { ActionForm, SubmitButton } from "@/components/forms";
import { CategorySelect, type Cat } from "../category-select";

export function AddForm({ categories, today }: { categories: Cat[]; today: string }) {
  return (
    <ActionForm action={addEntryForm} resetOnSuccess className="card grid gap-4 p-5 sm:grid-cols-2">
      <label className="block">
        <span className="label">Amount (₹)</span>
        <input name="amount" inputMode="decimal" required className="input" />
      </label>
      <label className="block">
        <span className="label">Type</span>
        <select name="direction" className="input" defaultValue="debit">
          <option value="debit">Money out (spent / lent / paid)</option>
          <option value="credit">Money in (received / returned)</option>
        </select>
      </label>
      <label className="block sm:col-span-2">
        <span className="label">What was it</span>
        <input name="description" required placeholder="Cab to shoot location" className="input" />
      </label>
      <label className="block">
        <span className="label">Category</span>
        <CategorySelect name="category_id" categories={categories} />
      </label>
      <label className="block">
        <span className="label">Date</span>
        <input name="txn_date" type="date" defaultValue={today} className="input" />
      </label>
      <label className="block">
        <span className="label">Person (for lending, optional)</span>
        <input name="person" className="input" />
      </label>
      <label className="block">
        <span className="label">Note (optional)</span>
        <input name="note" className="input" />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
        <input type="checkbox" name="is_cash" /> Paid in cash (won&apos;t appear on any bank statement)
      </label>
      <div className="sm:col-span-2"><SubmitButton>Add</SubmitButton></div>
    </ActionForm>
  );
}
