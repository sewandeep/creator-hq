import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { isEmailConfigured } from "@/lib/email";
import { AiTest } from "./ai-test";

export const metadata: Metadata = { title: "Setup check" };

// Which database update file creates which tables.
const MIGRATIONS = [
  {
    file: "supabase/migrations/20261101000000_phase1_crm.sql",
    label: "Phase 1 — deals, brands, contacts",
    tables: ["brands", "contacts", "deals", "deliverables", "activities", "deal_files"],
  },
  {
    file: "supabase/migrations/20261101100000_phase2_money.sql",
    label: "Phase 2 — invoices, payments, TDS, emails",
    tables: ["profile", "invoices", "invoice_items", "payments", "tds_checks", "email_templates", "email_log", "rate_card"],
  },
  {
    file: "supabase/migrations/20261102000000_phase3_finance.sql",
    label: "Phase 3 — personal money, statements",
    tables: ["bank_accounts", "statements", "categories", "category_rules", "transactions", "transaction_changes"],
  },
] as const;

type Check = { ok: boolean; warn?: boolean; title: string; detail?: React.ReactNode };

export default async function SetupPage() {
  const { supabase } = await requireUser();

  const migrationChecks: Check[] = [];
  for (const m of MIGRATIONS) {
    const missing: string[] = [];
    for (const t of m.tables) {
      const { error } = await supabase.from(t).select("*").limit(0);
      if (error && (error.code === "PGRST205" || error.code === "42P01" || /could not find the table|does not exist/i.test(error.message))) missing.push(t);
    }
    migrationChecks.push(
      missing.length === 0
        ? { ok: true, title: m.label }
        : {
            ok: false,
            title: `${m.label}: database update not applied`,
            detail: (
              <>
                Missing tables: {missing.join(", ")}. In Supabase open <b>SQL Editor → New query</b>, paste the whole file{" "}
                <a className="link" href={`https://github.com/sewandeep/creator-hq/blob/main/${m.file}`} target="_blank" rel="noreferrer">
                  {m.file.split("/").pop()}
                </a>{" "}
                from GitHub, and press <b>Run</b>. Then reload this page.
              </>
            ),
          },
    );
  }

  const { error: phase4Error } = await supabase.from("profile").select("telegram_chat_id").limit(0);
  if (phase4Error)
    migrationChecks.push({
      ok: false,
      title: "Phase 4 — Telegram & reminders: database update not applied",
      detail: (
        <>
          Run{" "}
          <a className="link" href="https://github.com/sewandeep/creator-hq/blob/main/supabase/migrations/20261103000000_phase4_telegram.sql" target="_blank" rel="noreferrer">
            20261103000000_phase4_telegram.sql
          </a>{" "}
          in the Supabase SQL Editor, then reload this page.
        </>
      ),
    });
  else migrationChecks.push({ ok: true, title: "Phase 4 — Telegram & reminders" });
  const { error: phase5Error } = await supabase.from("ai_proposals").select("id").limit(0);
  migrationChecks.push(
    phase5Error
      ? {
          ok: false,
          title: "Phase 5 — AI assistant: database update not applied",
          detail: (
            <>
              Run{" "}
              <a className="link" href="https://github.com/sewandeep/creator-hq/blob/main/supabase/migrations/20261104000000_phase5_assistant.sql" target="_blank" rel="noreferrer">
                20261104000000_phase5_assistant.sql
              </a>{" "}
              in the Supabase SQL Editor, then reload this page.
            </>
          ),
        }
      : { ok: true, title: "Phase 5 — AI assistant" },
  );
  const { error: bucketError } = await supabase.storage.from("deal-files").list("", { limit: 1 });
  const { error: stmtBucketError } = await supabase.storage.from("statements").list("", { limit: 1 });
  const { data: profile } = await supabase.from("profile").select("legal_name, pan, bank_account_number").maybeSingle();

  const checks: Check[] = [
    ...migrationChecks,
    bucketError
      ? { ok: false, title: "File storage (briefs & contracts)", detail: `Storage isn't ready: ${bucketError.message}. Re-run the Phase 1 file in the SQL Editor.` }
      : { ok: true, title: "File storage (briefs & contracts)" },
    stmtBucketError
      ? { ok: false, title: "Statement storage", detail: `Storage for bank statements isn't ready: ${stmtBucketError.message}. Run the Phase 3 file in the SQL Editor.` }
      : { ok: true, title: "Statement storage" },
    process.env.GEMINI_API_KEY
      ? { ok: true, title: "AI (Gemini key)", detail: <AiTest /> }
      : { ok: false, warn: true, title: "AI statement reader (Gemini key)", detail: <>Not added yet — get a free key at <b>aistudio.google.com/apikey</b> and add it in Vercel as <code className="rounded bg-slate-100 px-1">GEMINI_API_KEY</code>, then redeploy.</> },
    profile?.legal_name && profile.pan
      ? { ok: true, title: "Your invoice details (name & PAN)" }
      : { ok: false, warn: true, title: "Your invoice details (name & PAN)", detail: <>Not filled in yet — <Link href="/settings" className="link">add them in Settings</Link>.</> },
    isEmailConfigured()
      ? { ok: true, title: "Sending emails from Gmail" }
      : { ok: false, warn: true, title: "Sending emails from Gmail (optional)", detail: <>Not connected — see <Link href="/settings" className="link">Settings → Email sending</Link>. The app works without it.</> },
  ];
  const blocking = checks.filter((c) => !c.ok && !c.warn).length;

  return (
    <div className="max-w-2xl">
      <PageHeader title="Setup check" subtitle={blocking ? `${blocking} thing${blocking === 1 ? "" : "s"} to fix` : "Everything needed is in place ✓"} />
      <Card>
        <ul className="divide-y divide-slate-100">
          {checks.map((c) => (
            <li key={c.title} className="flex items-start gap-3 py-3">
              <span className="mt-0.5 text-lg leading-none">{c.ok ? "✅" : c.warn ? "⚠️" : "❌"}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {c.title}
                  {!c.ok && <Badge tone={c.warn ? "amber" : "red"}>{c.warn ? "Recommended" : "Needs fixing"}</Badge>}
                </div>
                {c.detail && <div className="mt-1 text-sm text-slate-600">{c.detail}</div>}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
