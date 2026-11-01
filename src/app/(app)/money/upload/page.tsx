import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { isAiConfigured } from "@/lib/finance/gemini";
import { AccountForm } from "../statements/account-form";
import { Uploader } from "./uploader";

export const metadata: Metadata = { title: "Upload statement" };

export default async function UploadPage() {
  const { supabase, userId } = await requireUser();
  const { data: accounts } = await supabase.from("bank_accounts").select("id, name, bank, pdf_password").eq("is_archived", false).order("created_at");

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Upload a bank statement" subtitle="Any PDF straight from net banking — Kotak, SBI or others. The AI reads it, checks every balance, and sorts it into categories." />
      {accounts?.length ? (
        <Uploader userId={userId} aiReady={isAiConfigured()} accounts={accounts.map((a) => ({ id: a.id, name: a.name, bank: a.bank, hasPassword: Boolean(a.pdf_password) }))} />
      ) : (
        <Card title="First, add your bank account">
          <AccountForm />
        </Card>
      )}
      <Card title="Good to know">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
          <li>Uploading the same period twice is safe — rows already imported are skipped.</li>
          <li>Things you added yourself (like &quot;450 cab&quot;) get linked to the matching bank line automatically, so nothing counts twice.</li>
          <li>Account numbers are hidden (only the last 4 digits are kept) before the text goes to the AI. Google&apos;s free AI tier may use what it receives to improve its products.</li>
          <li>
            Kotak: Net banking → Statements → Account statement → PDF. SBI: Account statement → Download PDF. <Link href="/money/statements" className="link">Manage accounts & past statements →</Link>
          </li>
        </ul>
      </Card>
    </div>
  );
}
