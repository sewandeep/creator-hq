"use client";

import { useState } from "react";
import { addActivity } from "@/app/actions/activities";
import { logFollowUp } from "@/app/actions/deals";
import { addDeliverable, deleteDeliverable, updateDeliverable } from "@/app/actions/deliverables";
import { uploadDealFile } from "@/app/actions/files";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/forms";
import { ACTIVITY_KINDS, DELIVERABLE_STATUSES, DELIVERABLE_TYPES, FILE_KINDS } from "@/lib/constants";
import type { Deliverable } from "@/lib/types";

function DeliverableFields({ d, platform }: { d?: Deliverable; platform?: string | null }) {
  return (
    <div className="grid gap-3 sm:grid-cols-6">
      <label className="block sm:col-span-2">
        <span className="label">Type</span>
        <input name="type" list="deliverable-types" defaultValue={d?.type ?? "Reel"} required className="input" />
        <datalist id="deliverable-types">
          {DELIVERABLE_TYPES.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </label>
      <label className="block">
        <span className="label">Qty</span>
        <input name="quantity" type="number" min={1} defaultValue={d?.quantity ?? 1} className="input" />
      </label>
      <label className="block sm:col-span-3">
        <span className="label">Status</span>
        <select name="status" defaultValue={d?.status ?? "todo"} className="input">
          {DELIVERABLE_STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block sm:col-span-2">
        <span className="label">Due</span>
        <input name="due_date" type="date" defaultValue={d?.due_date ?? ""} className="input" />
      </label>
      <label className="block sm:col-span-2">
        <span className="label">Posted on</span>
        <input name="posted_date" type="date" defaultValue={d?.posted_date ?? ""} className="input" />
      </label>
      <label className="block sm:col-span-2">
        <span className="label">Platform</span>
        <input name="platform" defaultValue={d?.platform ?? platform ?? ""} className="input" />
      </label>
      <label className="block sm:col-span-6">
        <span className="label">Post link</span>
        <input name="link" type="url" defaultValue={d?.link ?? ""} placeholder="https://instagram.com/reel/…" className="input" />
      </label>
      <label className="block sm:col-span-6">
        <span className="label">Notes</span>
        <input name="notes" defaultValue={d?.notes ?? ""} className="input" />
      </label>
    </div>
  );
}

export function AddDeliverable({ dealId, platform }: { dealId: string; platform: string | null }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary w-full">
        + Add deliverable
      </button>
    );
  return (
    <ActionForm action={addDeliverable.bind(null, dealId)} onSuccess={() => setOpen(false)} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <DeliverableFields platform={platform} />
      <div className="mt-3 flex gap-2">
        <SubmitButton>Add</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
          Cancel
        </button>
      </div>
    </ActionForm>
  );
}

export function EditDeliverable({ d }: { d: Deliverable }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs text-brand-600 hover:underline">
        {open ? "Close" : "Edit"}
      </button>
      {open && (
        <div className="mt-3 w-full basis-full rounded-lg border border-slate-200 bg-slate-50 p-3">
          <ActionForm action={updateDeliverable.bind(null, d.id)} onSuccess={() => setOpen(false)}>
            <DeliverableFields d={d} />
            <div className="mt-3 flex gap-2">
              <SubmitButton>Save</SubmitButton>
            </div>
          </ActionForm>
          <div className="mt-2">
            <ConfirmButton action={deleteDeliverable.bind(null, d.id)} confirmText="Delete this deliverable?" className="btn-ghost text-rose-600">
              Delete
            </ConfirmButton>
          </div>
        </div>
      )}
    </>
  );
}

export function FollowUpForm({ dealId }: { dealId: string }) {
  return (
    <ActionForm action={logFollowUp.bind(null, dealId)} resetOnSuccess className="space-y-3">
      <input name="note" placeholder="What happened? (e.g. Sent rate card on email)" className="input" />
      <div>
        <span className="label">Next follow-up</span>
        <div className="flex flex-wrap gap-2 text-sm">
          {[
            ["2", "In 2 days"],
            ["4", "In 4 days"],
            ["7", "In a week"],
            ["14", "In 2 weeks"],
            ["0", "No more"],
          ].map(([v, label]) => (
            <label key={v} className="cursor-pointer rounded-lg border border-slate-300 px-2.5 py-1 has-checked:border-brand-500 has-checked:bg-brand-50 has-checked:text-brand-700">
              <input type="radio" name="in_days" value={v} defaultChecked={v === "4"} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
        <input type="date" name="next_date" className="input mt-2" aria-label="Or pick a date" />
        <span className="mt-1 block text-xs text-slate-400">Or pick an exact date (overrides the buttons)</span>
      </div>
      <SubmitButton>Log follow-up</SubmitButton>
    </ActionForm>
  );
}

export function NoteForm({ dealId }: { dealId: string }) {
  return (
    <ActionForm action={addActivity.bind(null, dealId)} resetOnSuccess className="space-y-2">
      <textarea name="body" rows={2} required placeholder="Add a note, call summary, what they said…" className="input" />
      <div className="flex gap-2">
        <select name="kind" className="input w-auto" defaultValue="note">
          {ACTIVITY_KINDS.filter((k) => k.id !== "follow_up").map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
        <SubmitButton>Add</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function UploadForm({ dealId }: { dealId: string }) {
  return (
    <ActionForm action={uploadDealFile.bind(null, dealId)} resetOnSuccess className="space-y-2">
      <input name="file" type="file" required className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700" />
      <div className="flex gap-2">
        <select name="kind" className="input w-auto" defaultValue="brief">
          {FILE_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
        <SubmitButton pendingText="Uploading…">Upload</SubmitButton>
      </div>
    </ActionForm>
  );
}
