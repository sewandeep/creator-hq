"use client";

import { useState } from "react";
import { deleteTemplate, saveTemplate } from "@/app/actions/email";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/forms";

type T = { id: string; name: string; subject: string; body: string; attach_invoice: boolean };

export function TemplateEditor({ t }: { t?: T }) {
  const [open, setOpen] = useState(!t ? false : false);
  if (!open)
    return t ? (
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="font-medium">{t.name}{t.attach_invoice ? " 📎" : ""}</div>
          <div className="truncate text-sm text-slate-500">{t.subject}</div>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="text-sm text-brand-600 hover:underline">Edit</button>
      </div>
    ) : (
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary">+ New template</button>
    );

  return (
    <div className={t ? "bg-slate-50 px-4 py-4" : "card p-4"}>
      <ActionForm action={saveTemplate.bind(null, t?.id ?? null)} onSuccess={() => setOpen(false)} className="space-y-3">
        <label className="block">
          <span className="label">Template name</span>
          <input name="name" defaultValue={t?.name} required className="input" />
        </label>
        <label className="block">
          <span className="label">Subject</span>
          <input name="subject" defaultValue={t?.subject} required className="input" />
        </label>
        <label className="block">
          <span className="label">Message</span>
          <textarea name="body" defaultValue={t?.body} rows={10} required className="input leading-relaxed" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="attach_invoice" defaultChecked={t?.attach_invoice} /> Attach the invoice PDF when used from an invoice
        </label>
        <div className="flex gap-2">
          <SubmitButton>Save</SubmitButton>
          <button type="button" onClick={() => setOpen(false)} className="btn-ghost">Cancel</button>
        </div>
      </ActionForm>
      {t && (
        <div className="mt-3">
          <ConfirmButton action={deleteTemplate.bind(null, t.id)} confirmText={`Delete template "${t.name}"?`} className="text-sm text-rose-600 hover:underline">
            Delete template
          </ConfirmButton>
        </div>
      )}
    </div>
  );
}
