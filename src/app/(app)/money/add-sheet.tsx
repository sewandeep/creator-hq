"use client";

import { useState, useTransition } from "react";
import { addEntryQuick } from "@/app/actions/finance";
import { toast } from "@/components/toast";
import { CategorySelect, type Cat } from "./category-select";

/** "+ Add": money out or in, with only the categories that fit. */
export function AddSheet({ categories, today, className = "btn-primary" }: { categories: Cat[]; today: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [dir, setDir] = useState<"debit" | "credit">("debit");
  const [amount, setAmount] = useState("");
  const [what, setWhat] = useState("");
  const [date, setDate] = useState(today);
  const [categoryId, setCategoryId] = useState("");
  const [person, setPerson] = useState("");
  const [note, setNote] = useState("");
  const [cash, setCash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const kind = categories.find((c) => c.id === categoryId)?.kind;
  const needsPerson = kind === "lending" || kind === "family";

  const reset = () => {
    setAmount("");
    setWhat("");
    setCategoryId("");
    setPerson("");
    setNote("");
    setCash(false);
    setError(null);
  };

  function submit() {
    const n = Number(amount.replace(/[₹,\s]/g, "").replace(/k$/i, "000"));
    if (!(n > 0)) return setError("Enter an amount.");
    if (!what.trim()) return setError("Say what it was.");
    if (kind === "lending" && !person.trim()) return setError("Who was it with?");
    const payload = { amount: n, direction: dir, description: what, date, categoryId: categoryId || null, person: person || null, note: note || null, isCash: cash };
    setOpen(false); // close straight away; saves in the background
    start(async () => {
      const r = await addEntryQuick(payload).catch(() => ({ error: "Couldn't reach the app — try again.", groupId: undefined, message: undefined }));
      if (r.error) {
        setOpen(true);
        setError(r.error);
        toast(r.error, { tone: "error" });
      } else {
        reset();
        toast(r.message ?? "Added", { undoGroup: r.groupId });
      }
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>+ Add</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add an entry</h2>
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost px-2" aria-label="Close">✕</button>
            </div>
            <div className="mb-4 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm">
              {(["debit", "credit"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setDir(d);
                    setCategoryId("");
                  }}
                  className={`rounded-lg py-2 font-medium ${dir === d ? (d === "debit" ? "bg-white text-slate-900 shadow-sm" : "bg-white text-emerald-700 shadow-sm") : "text-slate-500"}`}
                >
                  {d === "debit" ? "⬆️ Money out" : "⬇️ Money in"}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="label">Amount (₹)</span>
                  <input autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="450" className="input" />
                </label>
                <label className="block">
                  <span className="label">Date</span>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
                </label>
              </div>
              <label className="block">
                <span className="label">What was it</span>
                <input value={what} onChange={(e) => setWhat(e.target.value)} placeholder={dir === "debit" ? "Ring light for studio" : "Payment from client"} className="input" />
              </label>
              <label className="block">
                <span className="label">Category</span>
                <CategorySelect categories={categories} direction={dir} value={categoryId} onChange={setCategoryId} placeholder="Choose… (or leave it for later)" />
              </label>
              {needsPerson && (
                <label className="block">
                  <span className="label">{kind === "family" ? "Who in the family?" : "Who with?"}</span>
                  <input value={person} onChange={(e) => setPerson(e.target.value)} placeholder={kind === "family" ? "Dad" : "Rahul"} className="input" />
                </label>
              )}
              <label className="block">
                <span className="label">Note (optional)</span>
                <input value={note} onChange={(e) => setNote(e.target.value)} className="input" />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={cash} onChange={(e) => setCash(e.target.checked)} /> Cash (won&apos;t appear on a bank statement)
              </label>
              {error && <p className="text-sm text-rose-600">{error}</p>}
              <button className="btn-primary w-full">Add</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
