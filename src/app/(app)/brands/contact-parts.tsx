"use client";

import { useState } from "react";
import { createContact, deleteContact, updateContact } from "@/app/actions/contacts";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/forms";
import type { Contact } from "@/lib/types";

function ContactFields({ c, brandId }: { c?: Contact; brandId: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="brand_id" value={brandId} />
      <label className="block">
        <span className="label">Name</span>
        <input name="name" required defaultValue={c?.name} className="input" />
      </label>
      <label className="block">
        <span className="label">Role</span>
        <input name="role" defaultValue={c?.role ?? ""} placeholder="Marketing manager, agency…" className="input" />
      </label>
      <label className="block">
        <span className="label">Email</span>
        <input name="email" type="email" defaultValue={c?.email ?? ""} className="input" />
      </label>
      <label className="block">
        <span className="label">Phone / WhatsApp</span>
        <input name="phone" type="tel" defaultValue={c?.phone ?? ""} className="input" />
      </label>
      <label className="block sm:col-span-2">
        <span className="label">Notes</span>
        <input name="notes" defaultValue={c?.notes ?? ""} className="input" />
      </label>
    </div>
  );
}

export function AddContact({ brandId }: { brandId: string }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className="btn-secondary w-full" onClick={() => setOpen(true)}>
        + Add contact
      </button>
    );
  return (
    <ActionForm action={createContact} onSuccess={() => setOpen(false)} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <ContactFields brandId={brandId} />
      <div className="mt-3 flex gap-2">
        <SubmitButton>Add</SubmitButton>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </ActionForm>
  );
}

export function ContactRow({ c, brandId }: { c: Contact; brandId: string }) {
  const [editing, setEditing] = useState(false);
  if (editing)
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <ActionForm action={updateContact.bind(null, c.id)} onSuccess={() => setEditing(false)}>
          <ContactFields c={c} brandId={brandId} />
          <div className="mt-3 flex gap-2">
            <SubmitButton>Save</SubmitButton>
            <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </ActionForm>
        <div className="mt-2">
          <ConfirmButton action={deleteContact.bind(null, c.id)} confirmText={`Delete ${c.name}?`} className="btn-ghost text-rose-600">
            Delete contact
          </ConfirmButton>
        </div>
      </div>
    );
  return (
    <div className="flex items-start justify-between gap-2 text-sm">
      <div className="min-w-0">
        <div className="font-medium">
          {c.name}
          {c.role && <span className="font-normal text-slate-500"> · {c.role}</span>}
        </div>
        {c.email && <a href={`mailto:${c.email}`} className="link block truncate">{c.email}</a>}
        {c.phone && <a href={`tel:${c.phone}`} className="link block">{c.phone}</a>}
        {c.notes && <div className="text-xs text-slate-500">{c.notes}</div>}
      </div>
      <button type="button" className="text-xs text-brand-600 hover:underline" onClick={() => setEditing(true)}>
        Edit
      </button>
    </div>
  );
}
