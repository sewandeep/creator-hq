"use client";

import { useState } from "react";
import { saveAccount } from "@/app/actions/finance";
import { ActionForm, SubmitButton } from "@/components/forms";

type Account = { id: string; name: string; bank: string; last4: string | null; hasPassword: boolean };

export function AccountForm({ account, onDone }: { account?: Account; onDone?: () => void }) {
  return (
    <ActionForm action={saveAccount.bind(null, account?.id ?? null)} resetOnSuccess={!account} onSuccess={onDone} className="grid gap-3 sm:grid-cols-2">
      <label className="block">
        <span className="label">Name</span>
        <input name="name" required defaultValue={account?.name} placeholder="Kotak Savings" className="input" />
      </label>
      <label className="block">
        <span className="label">Bank</span>
        <select name="bank" defaultValue={account?.bank ?? "kotak"} className="input">
          <option value="kotak">Kotak Mahindra</option>
          <option value="sbi">State Bank of India</option>
          <option value="hdfc">HDFC</option>
          <option value="icici">ICICI</option>
          <option value="axis">Axis</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className="block">
        <span className="label">Last 4 digits (optional)</span>
        <input name="last4" defaultValue={account?.last4 ?? ""} inputMode="numeric" maxLength={4} className="input" />
      </label>
      <label className="block">
        <span className="label">Statement PDF password (if any)</span>
        <input name="pdf_password" type="password" autoComplete="off" placeholder={account?.hasPassword ? "•••••• saved — type to change" : "Leave empty if none"} className="input" />
        {account?.hasPassword && (
          <label className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
            <input type="checkbox" name="clear_password" /> Remove saved password
          </label>
        )}
      </label>
      <div className="sm:col-span-2">
        <SubmitButton>{account ? "Save" : "Add account"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function EditAccount({ account }: { account: Account }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <div className="mt-3 rounded-lg bg-slate-50 p-3">
      <AccountForm account={account} onDone={() => setOpen(false)} />
    </div>
  ) : (
    <button type="button" onClick={() => setOpen(true)} className="text-xs text-brand-600 hover:underline">Edit</button>
  );
}

export function RetryStatement({ id, needsPassword }: { id: string; needsPassword: boolean }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {needsPassword && <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="PDF password" className="input w-44 py-1" />}
      <button
        type="button"
        disabled={busy}
        className="btn-secondary px-3 py-1 text-xs"
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          const r = await fetch(`/api/statements/${id}/process`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: password || undefined }) })
            .then((x) => x.json())
            .catch(() => ({ message: "Server error — try again." }));
          setBusy(false);
          setMsg(r.message);
          if (r.status === "done") window.location.reload();
        }}
      >
        {busy ? "Reading…" : "Try again"}
      </button>
      {msg && <span className="text-xs text-slate-600">{msg}</span>}
    </div>
  );
}
