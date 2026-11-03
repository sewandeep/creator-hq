"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { acceptGuess, dismissInvoiceSuggestion, recordAsInvoicePayment, setCategory } from "@/app/actions/finance";
import { toast } from "@/components/toast";
import { CategorySelect, type Cat } from "./category-select";

export type ReviewTxn = {
  id: string;
  txn_date: string;
  amount: number;
  direction: "debit" | "credit";
  description: string;
  counterparty: string | null;
  account: string | null;
  source: string;
  category_id: string | null;
  category_reason: string | null;
  review_reason: string | null;
  note: string | null;
  person: string | null;
  pattern: string;
  invoice: { id: string; number: string; brand: string } | null;
};

const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
const day = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", weekday: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

export function ReviewCard({ t, categories, quick }: { t: ReviewTxn; categories: Cat[]; quick: Cat[] }) {
  const [categoryId, setCategoryId] = useState(t.category_id ?? "");
  const [remember, setRemember] = useState(t.source === "statement" && t.pattern.length >= 3);
  const [pattern, setPattern] = useState(t.pattern);
  const [note, setNote] = useState(t.note ?? "");
  const [person, setPerson] = useState(t.person ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const chosen = categories.find((c) => c.id === categoryId);
  const guess = categories.find((c) => c.id === t.category_id);

  function save(id = categoryId) {
    if (!id) {
      setMsg("Pick a category first.");
      return;
    }
    // Done on screen straight away; the save happens in the background.
    setCategoryId(id);
    setDone(true);
    setMsg(null);
    start(async () => {
      const r = await setCategory({ transactionId: t.id, categoryId: id, remember, pattern, note, person: person || null }).catch((e: unknown) => ({ error: e instanceof Error ? e.message : "Couldn't save.", alsoUpdated: 0, groupId: undefined }));
      if (r.error) {
        setDone(false);
        setMsg(r.error);
        toast(`Couldn't save: ${r.error}`, { tone: "error" });
      } else {
        if (r.alsoUpdated) setMsg(`${r.alsoUpdated} similar transaction${r.alsoUpdated === 1 ? "" : "s"} updated too.`);
        toast(r.alsoUpdated ? `Saved + ${r.alsoUpdated} similar` : "Saved", { undoGroup: r.groupId });
      }
    });
  }

  if (done) return <div className="card px-4 py-3 text-sm text-emerald-700">✓ {inr(t.amount)} · {t.counterparty || t.description.slice(0, 30)} → {chosen?.emoji} {chosen?.name}{msg ? `. ${msg}` : ""}</div>;

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-slate-500">
            {day(t.txn_date)} · {t.account ?? (t.source === "statement" ? "Bank" : "Your entry")}
          </div>
          <div className="mt-0.5 font-semibold">{t.counterparty || t.description}</div>
          <div className="truncate text-xs text-slate-500" title={t.description}>{t.description}</div>
        </div>
        <div className={`text-lg font-semibold tabular-nums ${t.direction === "debit" ? "text-slate-900" : "text-emerald-700"}`}>
          {t.direction === "debit" ? "−" : "+"}
          {inr(t.amount)}
        </div>
      </div>

      {t.review_reason && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-amber-900">{t.review_reason}</p>}
      {t.category_reason && <p className="mt-1 text-xs text-slate-500">Why: {t.category_reason}</p>}

      {t.invoice && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-brand-100 bg-brand-50 p-3 text-sm">
          <span>
            Payment from <b>{t.invoice.brand}</b> for <Link href={`/invoices/${t.invoice.id}`} className="link">{t.invoice.number}</Link>?
          </span>
          <button
            type="button"
            disabled={pending}
            className="btn-primary px-3 py-1"
            onClick={() => {
              setDone(true);
              setMsg(`Recorded as payment for ${t.invoice!.number}.`);
              start(async () => {
                try {
                  const r = await recordAsInvoicePayment(t.id, t.invoice!.id);
                  toast(`Payment recorded for ${t.invoice!.number}`, { undoGroup: r?.groupId });
                } catch (e) {
                  setDone(false);
                  setMsg(e instanceof Error ? e.message : "Couldn't record it.");
                }
              });
            }}
          >
            Yes, record payment
          </button>
          <button type="button" disabled={pending} className="btn-ghost px-3 py-1" onClick={() => start(async () => { await dismissInvoiceSuggestion(t.id); })}>
            No
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {quick.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => save(c.id)}
            title="Tap to save"
            className={`rounded-full px-2.5 py-1 text-xs ${categoryId === c.id ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
          >
            {c.emoji} {c.name}
          </button>
        ))}
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} placeholder="All categories…" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional) — e.g. dinner with friends" className="input" />
        {chosen?.kind === "lending" && <input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Who? (e.g. Rahul)" className="input" />}
      </div>
      {t.source === "statement" && (
        <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Always use this category for payments containing
          <input value={pattern} onChange={(e) => setPattern(e.target.value)} disabled={!remember} className="rounded border border-slate-300 px-1.5 py-0.5 text-xs disabled:bg-slate-50" />
        </label>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => save()} disabled={pending} className="btn-primary">
          {pending ? "Saving…" : "Save"}
        </button>
        {guess && !t.invoice && (
          <button
            type="button"
            onClick={() => {
              setDone(true);
              setMsg("Kept the suggestion.");
              start(async () => {
                try {
                  const r = await acceptGuess(t.id);
                  toast("Kept", { undoGroup: r?.groupId });
                } catch {
                  setDone(false);
                  setMsg("Couldn't save — try again.");
                }
              });
            }}
            disabled={pending}
            className="btn-secondary"
          >
            Keep “{guess.name}”
          </button>
        )}
        <Link href={`/money/transactions/${t.id}`} className="text-xs text-slate-500 hover:underline">Details & history</Link>
        {msg && <span className="text-sm text-rose-600">{msg}</span>}
      </div>
    </div>
  );
}

/**
 * Keeps the cards you've just finished on screen (with their "Saved" note)
 * even after the page refreshes in the background.
 */
export function ReviewList({ items, categories }: { items: { t: ReviewTxn; quick: Cat[] }[]; categories: Cat[] }) {
  const [list] = useState(items);
  return (
    <>
      {list.map(({ t, quick }) => (
        <ReviewCard key={t.id} t={t} categories={categories} quick={quick} />
      ))}
    </>
  );
}
