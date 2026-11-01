"use client";

import { saveRate } from "@/app/actions/ratecard";
import { ActionForm, SubmitButton } from "@/components/forms";
import { DELIVERABLE_TYPES, PLATFORMS } from "@/lib/constants";

export function RateForm() {
  return (
    <ActionForm action={saveRate} resetOnSuccess className="grid gap-2 sm:grid-cols-6">
      <input name="type" list="rate-types" placeholder="Reel" required className="input sm:col-span-2" aria-label="Type" />
      <datalist id="rate-types">
        {DELIVERABLE_TYPES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <input name="platform" list="rate-platforms" placeholder="Instagram (optional)" className="input sm:col-span-2" aria-label="Platform" />
      <datalist id="rate-platforms">
        {PLATFORMS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <input name="price" inputMode="decimal" placeholder="Price ₹" required className="input" aria-label="Price" />
      <SubmitButton>Save rate</SubmitButton>
    </ActionForm>
  );
}
