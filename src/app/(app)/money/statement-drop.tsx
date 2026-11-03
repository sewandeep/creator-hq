"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createStatement } from "@/app/actions/finance";
import { JobProgress } from "@/components/job-progress";
import { readStatement } from "@/lib/statement-client";
import { createClient } from "@/lib/supabase/client";
import { useJob } from "@/lib/use-job";

type Account = { id: string; name: string; bank: string; hasPassword: boolean };
type Result = { status: string; message: string; added?: number; duplicates?: number; review?: number; balanceOk?: boolean; issues?: string[] };

/** Drop a statement PDF (or tap to pick one) — it's read right here. */
export function StatementDrop({ accounts, userId, aiReady }: { accounts: Account[]; userId: string; aiReady: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [password, setPassword] = useState("");
  const [needPassword, setNeedPassword] = useState(false);
  const [statementId, setStatementId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);
  const account = accounts.find((a) => a.id === accountId);

  if (!accounts.length)
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-200 p-5 text-center text-sm text-slate-600">
        Add your bank account once, then drop statements here.
        <div className="mt-3"><Link href="/money/statements" className="btn-primary">Add bank account</Link></div>
      </div>
    );

  async function read(id: string) {
    setBusy("Starting…");
    setJobId(null);
    const r: Result = await readStatement(id, password, undefined, setJobId);
    setBusy(null);
    setJobId(null);
    if (r.status === "needs_password") {
      setNeedPassword(true);
      setError(r.message);
      return;
    }
    if (r.status !== "done") return setError(r.message);
    setResult(r);
    router.refresh();
  }

  async function go(f = file) {
    setError(null);
    if (!f) return;
    if (!aiReady) return setError("Add your Gemini key first (Setup check).");
    if (statementId) return read(statementId);
    try {
      setBusy("Uploading…");
      const path = `${userId}/${crypto.randomUUID()}.pdf`;
      const { error: upError } = await createClient().storage.from("statements").upload(path, f, { contentType: "application/pdf" });
      if (upError) throw new Error(upError.message);
      const created = await createStatement({ accountId, path, fileName: f.name });
      if (!created.id) throw new Error(created.error ?? "Couldn't save the upload.");
      setStatementId(created.id);
      await read(created.id);
    } catch (e) {
      setBusy(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function pick(f: File | undefined) {
    if (!f) return;
    if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) return setError("Please choose the statement PDF.");
    setFile(f);
    setResult(null);
    setStatementId(null);
    setNeedPassword(account?.bank === "sbi" && !account.hasPassword);
    // One account and no password needed: start straight away.
    if (accounts.length === 1 && !(account?.bank === "sbi" && !account.hasPassword)) void go(f);
  }

  if (result)
    return (
      <div className="rounded-2xl bg-emerald-50 p-4 text-sm ring-1 ring-emerald-200">
        <div className="font-semibold text-emerald-900">✅ {result.message} {result.added} new{result.duplicates ? `, ${result.duplicates} already had` : ""}.</div>
        <div className="mt-0.5 text-emerald-800">{result.balanceOk ? "Balance check passed ✓" : "⚠️ Balance check found problems — have a look at the flagged rows."}</div>
        <div className="mt-3 flex gap-2">
          {result.review ? <Link href="#to-sort" className="btn-primary px-3 py-1.5 text-xs">Sort {result.review} now</Link> : null}
          <button type="button" onClick={() => { setResult(null); setFile(null); }} className="btn-secondary px-3 py-1.5 text-xs">Upload another</button>
        </div>
      </div>
    );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files?.[0]); }}
      className={`rounded-2xl border-2 border-dashed p-4 text-center transition ${over ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-white"}`}
    >
      <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      {busy ? (
        <div className="py-2 text-left">{jobId ? <JobProgress job={job} fallback="Starting…" /> : <p className="text-sm text-slate-600"><span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand-500 border-t-transparent align-middle" />{busy}</p>}</div>
      ) : file ? (
        <div className="space-y-2 text-left text-sm">
          <div className="truncate font-medium">📄 {file.name}</div>
          {accounts.length > 1 && (
            <select value={accountId} onChange={(e) => { setAccountId(e.target.value); setStatementId(null); }} className="input py-1.5">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
          {needPassword && (
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="PDF password (saved for next time)" className="input py-1.5" autoComplete="off" />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => go()} className="btn-primary px-3 py-1.5 text-xs">{statementId ? "Try again" : "Read it"}</button>
            <button type="button" onClick={() => { setFile(null); setError(null); }} className="btn-ghost px-3 py-1.5 text-xs">Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => input.current?.click()} className="w-full py-2 text-sm text-slate-600">
          <span className="block text-2xl">📄</span>
          <span className="font-medium text-slate-900">Drop a bank statement PDF here</span>
          <span className="block text-xs text-slate-500">or tap to choose · Kotak, SBI (with password), others</span>
        </button>
      )}
      {error && <p className="mt-2 text-left text-sm text-rose-700">{error}</p>}
    </div>
  );
}
