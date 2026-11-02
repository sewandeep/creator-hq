"use client";

import Link from "next/link";
import { useState } from "react";
import { createStatement } from "@/app/actions/finance";
import { readStatement } from "@/lib/statement-client";
import { createClient } from "@/lib/supabase/client";

type Account = { id: string; name: string; bank: string; hasPassword: boolean };
type Result = { status: string; message: string; added?: number; duplicates?: number; review?: number; balanceOk?: boolean; issues?: string[] };

export function Uploader({ accounts, userId, aiReady }: { accounts: Account[]; userId: string; aiReady: boolean }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [askPassword, setAskPassword] = useState(false);
  const [step, setStep] = useState<"idle" | "uploading" | "reading" | "done">("idle");
  const [statementId, setStatementId] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const account = accounts.find((a) => a.id === accountId);
  const showPassword = askPassword || (account?.bank === "sbi" && !account.hasPassword);

  async function process(id: string) {
    setStep("reading");
    const r = (await readStatement(id, password)) as Result;
    if (r.status === "needs_password") {
      setAskPassword(true);
      setError(r.message);
      setStep("idle");
      return;
    }
    if (r.status !== "done") {
      setError(r.message);
      setStep("idle");
      return;
    }
    setResult(r);
    setStep("done");
  }

  async function start() {
    setError(null);
    if (!accountId) return setError("Choose the bank account.");
    // Retry after a password prompt: the file is already uploaded.
    if (statementId) return process(statementId).catch((e) => { setError(String(e)); setStep("idle"); });
    if (!file) return setError("Choose the statement PDF.");
    if (file.size > 15 * 1024 * 1024) return setError("That file is over 15 MB.");
    try {
      setStep("uploading");
      const path = `${userId}/${crypto.randomUUID()}.pdf`;
      const { error: upError } = await createClient().storage.from("statements").upload(path, file, { contentType: "application/pdf" });
      if (upError) throw new Error(upError.message);
      const created = await createStatement({ accountId, path, fileName: file.name });
      if (!created.id) throw new Error(created.error ?? "Couldn't save the upload.");
      setStatementId(created.id);
      await process(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("idle");
    }
  }

  function reset() {
    setFile(null);
    setStatementId(null);
    setResult(null);
    setPassword("");
    setAskPassword(false);
    setStep("idle");
  }

  if (step === "done" && result) {
    return (
      <div className="card space-y-3 p-5">
        <h2 className="text-lg font-semibold">✅ {result.message}</h2>
        <ul className="space-y-1 text-sm text-slate-700">
          <li>{result.added} new transaction{result.added === 1 ? "" : "s"} added{result.duplicates ? ` · ${result.duplicates} already imported earlier (skipped)` : ""}</li>
          <li>
            {result.balanceOk ? "✓ Balance check passed — every row adds up with the running balance." : "⚠️ Balance check found problems — see below."}
          </li>
          {result.review ? <li>{result.review} need you to say what they were.</li> : <li>Everything was categorised.</li>}
        </ul>
        {result.issues?.length ? (
          <ul className="list-disc space-y-1 rounded-lg bg-amber-50 py-2 pr-3 pl-7 text-sm text-amber-900">
            {result.issues.map((i) => <li key={i}>{i}</li>)}
          </ul>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {result.review ? <Link href="/money/review" className="btn-primary">Review {result.review} now</Link> : <Link href="/money" className="btn-primary">See the summary</Link>}
          <button type="button" onClick={reset} className="btn-secondary">Upload another</button>
        </div>
      </div>
    );
  }

  const busy = step === "uploading" || step === "reading";
  return (
    <div className="card space-y-4 p-5">
      {!aiReady && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          The AI reader isn&apos;t connected yet. Add your free Gemini key first — see <Link href="/setup" className="underline">Setup check</Link>.
        </p>
      )}
      <label className="block">
        <span className="label">Account</span>
        <select value={accountId} onChange={(e) => { setAccountId(e.target.value); setStatementId(null); }} className="input" disabled={busy}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      {!statementId && (
        <label className="block">
          <span className="label">Statement PDF (as downloaded from net banking)</span>
          <input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700" />
        </label>
      )}
      {showPassword && (
        <label className="block">
          <span className="label">PDF password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" className="input" disabled={busy} />
          <span className="mt-1 block text-xs text-slate-400">
            SBI usually uses the last 5 digits of your mobile number + your date of birth (DDMMYY). It&apos;s saved for this account once it works, so you won&apos;t need it next month.
          </span>
        </label>
      )}
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <button type="button" onClick={start} disabled={busy || !aiReady} className="btn-primary">
        {step === "uploading" ? "Uploading…" : step === "reading" ? "Reading with AI… (up to a minute)" : statementId ? "Try again" : "Upload & read"}
      </button>
      {step === "reading" && <p className="text-xs text-slate-500">Reading every row, checking balances and sorting categories. Keep this page open.</p>}
    </div>
  );
}
