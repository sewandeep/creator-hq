import type { Metadata } from "next";
import Link from "next/link";
import { saveProfile } from "@/app/actions/settings";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { emailConfig } from "@/lib/email";
import { todayIST } from "@/lib/format";
import { fyOf } from "@/lib/fy";
import { TDS_SECTIONS, formatInvoiceNumber } from "@/lib/money";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { supabase, email } = await requireUser();
  const { data: p } = await supabase.from("profile").select("*").maybeSingle();
  const mail = emailConfig();
  const fy = fyOf(todayIST());

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Settings" subtitle="These details are printed on your invoices." actions={<Link href="/setup" className="btn-secondary">Run setup check</Link>} />

      <ActionForm action={saveProfile} className="space-y-6">
        <Card title="Your details">
          <div className="grid gap-4 sm:grid-cols-2">
            <F label="Full legal name (as on PAN)" name="legal_name" v={p?.legal_name} required />
            <F label="Creator / display name" name="display_name" v={p?.display_name} hint="Used as the email sender name" />
            <F label="PAN" name="pan" v={p?.pan} placeholder="ABCDE1234F" className="uppercase" />
            <F label="Phone" name="phone" v={p?.phone} />
            <F label="Email shown on invoices" name="email" v={p?.email ?? email} type="email" />
            <label className="block sm:col-span-2">
              <span className="label">Address</span>
              <textarea name="address" rows={2} defaultValue={p?.address ?? ""} className="input" />
            </label>
          </div>
        </Card>

        <Card title="Bank & UPI (where brands pay you)">
          <div className="grid gap-4 sm:grid-cols-2">
            <F label="Account holder name" name="bank_account_name" v={p?.bank_account_name} />
            <F label="Bank" name="bank_name" v={p?.bank_name} placeholder="Kotak Mahindra Bank" />
            <F label="Account number" name="bank_account_number" v={p?.bank_account_number} inputMode="numeric" />
            <F label="IFSC" name="bank_ifsc" v={p?.bank_ifsc} placeholder="KKBK0001234" className="uppercase" />
            <F label="UPI ID" name="upi_id" v={p?.upi_id} placeholder="name@kotak" />
          </div>
        </Card>

        <Card title="Invoices">
          <div className="grid gap-4 sm:grid-cols-2">
            <F
              label="Invoice number prefix"
              name="invoice_prefix"
              v={p?.invoice_prefix ?? "INV"}
              hint={`Next invoice looks like ${formatInvoiceNumber(p?.invoice_prefix ?? "INV", fy, 1)} — restarts every financial year`}
            />
            <F label="Payment due after (days)" name="payment_terms_days" v={String(p?.payment_terms_days ?? 15)} type="number" />
            <F label="Usual TDS rate brands cut (%)" name="default_tds_rate" v={String(p?.default_tds_rate ?? 10)} inputMode="decimal" />
            <label className="block">
              <span className="label">Usual TDS section</span>
              <select name="default_tds_section" defaultValue={p?.default_tds_section ?? "194J"} className="input">
                {TDS_SECTIONS.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="label">Footer note on every invoice (optional)</span>
              <input name="invoice_footer" defaultValue={p?.invoice_footer ?? ""} placeholder="Thank you for working with me!" className="input" />
            </label>
          </div>
        </Card>

        <SubmitButton>Save settings</SubmitButton>
      </ActionForm>

      <Card title="Email sending" action={mail ? <Badge tone="green">Connected</Badge> : <Badge tone="amber">Not set up</Badge>}>
        {mail ? (
          <p className="text-sm text-slate-700">
            Emails are sent from <span className="font-medium">{mail.user}</span>. They also appear in your Gmail &quot;Sent&quot; folder.
          </p>
        ) : (
          <div className="space-y-2 text-sm text-slate-700">
            <p>To send invoices and emails straight from here, connect your Gmail once:</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Turn on <b>2-Step Verification</b> in your Google Account (Security).</li>
              <li>Open <b>myaccount.google.com/apppasswords</b>, create an app password named &quot;Creator HQ&quot;, and copy the 16 letters.</li>
              <li>
                In Vercel → your project → <b>Settings → Environment Variables</b>, add <code className="rounded bg-slate-100 px-1">GMAIL_USER</code> (your Gmail address) and{" "}
                <code className="rounded bg-slate-100 px-1">GMAIL_APP_PASSWORD</code> (the 16 letters), then <b>Redeploy</b>.
              </li>
            </ol>
            <p className="text-slate-500">Until then, the email screen gives you an &quot;Open in Gmail&quot; button instead.</p>
          </div>
        )}
        <Link href="/email/templates" className="link mt-3 inline-block text-sm">Edit email templates →</Link>
      </Card>
    </div>
  );
}

function F({
  label,
  name,
  v,
  hint,
  ...rest
}: { label: string; name: string; v?: string | null; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input name={name} defaultValue={v ?? ""} {...rest} className={`input ${rest.className ?? ""}`} />
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}
