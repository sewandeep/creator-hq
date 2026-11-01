"use client";

import { quickAdd } from "@/app/actions/finance";
import { ActionForm, SubmitButton } from "@/components/forms";

export function QuickAdd() {
  return (
    <ActionForm action={quickAdd} resetOnSuccess className="card p-3">
      <div className="flex gap-2">
        <input
          name="text"
          required
          autoComplete="off"
          placeholder='Quick add: "450 cab", "200 chai cash", "lent 2000 to rahul"'
          className="input flex-1"
        />
        <SubmitButton pendingText="Adding…">Add</SubmitButton>
      </div>
    </ActionForm>
  );
}
