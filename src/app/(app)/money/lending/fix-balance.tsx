"use client";

import { useState, useTransition } from "react";
import { setLendingBalance } from "@/app/actions/finance";
import { toast } from "@/components/toast";

/** Say what's actually true with this person; the app adds an opening balance to match. */
export function FixBalance({ person }: { person: string }) {
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState<"they" | "me" | "settled">("settled");
  const [amount, setAmount] = useState("");
  const [, start] = useTransition();
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-xs text-slate-500 underline hover:text-slate-800">
        Not right? Fix the balance
      </button>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(amount.replace(/[₹,\s]/g, "")) || 0;
        const actual = who === "settled" ? 0 : who === "they" ? n : -n;
        setOpen(false);
        start(async () => {
          const r = await setLendingBalance(person, actual);
          if (r.error) toast(r.error, { tone: "error" });
          else toast(r.message ?? "Saved", { undoGroup: r.groupId });
        });
      }}
      className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2.5 text-sm"
    >
      <span className="text-slate-600">Right now:</span>
      <select value={who} onChange={(e) => setWho(e.target.value as typeof who)} className="input w-auto py-1 text-sm">
        <option value="settled">we&apos;re settled</option>
        <option value="they">{person} owes me</option>
        <option value="me">I owe {person}</option>
      </select>
      {who !== "settled" && <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="₹" className="input w-28 py-1 text-sm" />}
      <button className="btn-primary px-3 py-1 text-xs">Save</button>
      <button type="button" onClick={() => setOpen(false)} className="btn-ghost px-2 py-1 text-xs">Cancel</button>
    </form>
  );
}
