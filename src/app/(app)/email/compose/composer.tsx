"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { sendEmail } from "@/app/actions/email";
import { fillTemplate, missingPlaceholders, type TemplateVars } from "@/lib/templates";

type Template = { id: string; name: string; subject: string; body: string; attach_invoice: boolean };
type Contact = { name: string; email: string };

function contactVars(c: Contact | undefined): TemplateVars {
  if (!c) return {};
  return { contact_name: c.name, first_name: c.name.split(/\s+/)[0] };
}

export function Composer({
  templates,
  baseVars,
  contacts,
  defaultTo,
  initialTemplate,
  invoice,
  brandId,
  dealId,
  configured,
  fromLine,
  backHref,
}: {
  templates: Template[];
  baseVars: TemplateVars;
  contacts: Contact[];
  defaultTo: string;
  initialTemplate: string | null;
  invoice: { id: string; number: string; fileName: string } | null;
  brandId: string | null;
  dealId: string | null;
  configured: boolean;
  fromLine: string;
  backHref: string;
}) {
  const start = templates.find((t) => t.name === initialTemplate) ?? (invoice ? templates.find((t) => t.attach_invoice) : undefined) ?? null;
  const [to, setTo] = useState(defaultTo);
  const [cc, setCc] = useState("");
  const contact = contacts.find((c) => to.split(/[,;\s]+/)[0]?.toLowerCase() === c.email.toLowerCase());
  const vars = useMemo(() => ({ ...baseVars, ...contactVars(contact) }), [baseVars, contact]);

  const [templateId, setTemplateId] = useState(start?.id ?? "");
  const [subject, setSubject] = useState(start ? fillTemplate(start.subject, vars) : "");
  const [body, setBody] = useState(start ? fillTemplate(start.body, vars) : "");
  const [attach, setAttach] = useState(Boolean(invoice && (start?.attach_invoice ?? true)));
  const [step, setStep] = useState<"edit" | "preview" | "sent">("edit");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setSubject(fillTemplate(t.subject, vars));
    setBody(fillTemplate(t.body, vars));
    if (invoice) setAttach(t.attach_invoice);
  }

  // Re-fill name placeholders if the recipient changes after picking a template.
  function changeTo(value: string) {
    setTo(value);
    const c = contacts.find((x) => value.split(/[,;\s]+/)[0]?.toLowerCase() === x.email.toLowerCase());
    const v = { ...baseVars, ...contactVars(c) };
    setSubject((s) => fillTemplate(s, v));
    setBody((b) => fillTemplate(b, v));
  }

  const missing = [...new Set([...missingPlaceholders(subject), ...missingPlaceholders(body)])];
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}${cc ? `&cc=${encodeURIComponent(cc)}` : ""}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  function send() {
    setError(null);
    startTransition(async () => {
      const r = await sendEmail({ to, cc, subject, body, brandId, dealId, invoiceId: invoice?.id ?? null, attachInvoice: attach });
      if (r.ok) setStep("sent");
      else setError(r.error ?? "Couldn't send.");
    });
  }

  if (step === "sent") {
    return (
      <div className="card p-6 text-center">
        <div className="text-3xl">✅</div>
        <h2 className="mt-2 text-lg font-semibold">Email sent to {to}</h2>
        <p className="text-sm text-slate-500">It&apos;s logged on the deal timeline and in your Gmail Sent folder.</p>
        <Link href={backHref} className="btn-primary mt-4">Done</Link>
      </div>
    );
  }

  if (step === "preview") {
    return (
      <div className="space-y-4">
        <div className="card overflow-hidden">
          <div className="space-y-1 border-b border-slate-100 bg-slate-50 px-5 py-3 text-sm">
            <div><span className="inline-block w-16 text-slate-500">From</span>{fromLine}</div>
            <div><span className="inline-block w-16 text-slate-500">To</span>{to}</div>
            {cc && <div><span className="inline-block w-16 text-slate-500">Cc</span>{cc}</div>}
            <div><span className="inline-block w-16 text-slate-500">Subject</span><span className="font-semibold">{subject}</span></div>
          </div>
          <div className="px-5 py-4 text-sm leading-relaxed whitespace-pre-wrap">{body}</div>
          {invoice && attach && (
            <div className="border-t border-slate-100 px-5 py-3">
              <a href={`/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                📎 {invoice.fileName}
              </a>
            </div>
          )}
        </div>

        {missing.length > 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            ⚠ Still has blanks: {missing.map((m) => `{{${m}}}`).join(", ")} — go back and fill them in before sending.
          </p>
        )}
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        <div className="flex flex-wrap gap-2">
          {configured ? (
            <button type="button" onClick={send} disabled={pending || missing.length > 0} className="btn-primary">
              {pending ? "Sending…" : "Send now"}
            </button>
          ) : (
            <>
              <a href={gmailUrl} target="_blank" rel="noreferrer" className="btn-primary">Open in Gmail</a>
              {invoice && attach && <a href={`/invoices/${invoice.id}/pdf?download`} className="btn-secondary">Download PDF to attach</a>}
            </>
          )}
          <button type="button" onClick={() => setStep("edit")} className="btn-secondary">← Edit</button>
        </div>
        {!configured && (
          <p className="text-xs text-slate-500">
            Direct sending isn&apos;t connected yet (<Link href="/settings" className="link">set it up in Settings</Link>). Gmail opens with everything filled in — attach the PDF there.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="card space-y-4 p-4 sm:p-5">
      <label className="block">
        <span className="label">Template</span>
        <select value={templateId} onChange={(e) => applyTemplate(e.target.value)} className="input">
          <option value="">Blank email</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}{t.attach_invoice ? " 📎" : ""}</option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">To</span>
          <input value={to} onChange={(e) => changeTo(e.target.value)} list="contact-emails" placeholder="name@brand.com" className="input" />
          <datalist id="contact-emails">
            {contacts.map((c) => (
              <option key={c.email} value={c.email}>{c.name}</option>
            ))}
          </datalist>
          {contacts.length > 1 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {contacts.map((c) => (
                <button key={c.email} type="button" onClick={() => changeTo(c.email)} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-200">
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </label>
        <label className="block">
          <span className="label">Cc (optional)</span>
          <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="manager@agency.com" className="input" />
        </label>
      </div>
      <label className="block">
        <span className="label">Subject</span>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} className="input" />
      </label>
      <label className="block">
        <span className="label">Message</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} className="input leading-relaxed" />
      </label>
      {invoice && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} /> Attach invoice {invoice.number} (PDF)
        </label>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={() => setStep("preview")} disabled={!to.trim() || !subject.trim() || !body.trim()} className="btn-primary">
          Preview →
        </button>
        <Link href={backHref} className="btn-ghost">Cancel</Link>
      </div>
    </div>
  );
}
