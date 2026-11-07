"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addDealPayment, createDealInvoice, paymentCandidates, removePayment, saveInvoiceSimple, setDealAgency, setDealBrand, setDealTds } from "@/app/actions/deal-money";
import { Tap, TapRow } from "@/components/tap";
import { toast } from "@/components/toast";

const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
const day = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

type R = { error?: string; groupId?: string; message?: string };
function done(r: R) {
  if (r.error) toast(r.error, { tone: "error" });
  else toast(r.message ?? "Saved", { undoGroup: r.groupId });
}

/** Agency (or direct) + the deal's TDS setting. */
export function DealParties({ dealId, brand, brandIsAgency, brands, agency, agencies, tdsRate, ruleHint }: { dealId: string; brand: string; brandIsAgency: boolean; brands: string[]; agency: string | null; agencies: string[]; tdsRate: number | null; ruleHint: string | null }) {
  const [brandName, setBrandName] = useState(brandIsAgency && !agency ? "" : brand);
  const [name, setName] = useState(agency ?? (brandIsAgency ? brand : ""));
  const [rate, setRate] = useState(tdsRate === null ? "" : String(tdsRate));
  const [, start] = useTransition();
  const saveAgency = (v: string) => {
    if (v.trim() === (agency ?? (brandIsAgency ? brand : ""))) return;
    start(async () => done(await setDealAgency(dealId, v)));
  };
  const fieldClass = "-mx-1 w-full rounded-md bg-transparent px-1 font-medium placeholder:font-normal placeholder:text-slate-400 hover:bg-slate-100 focus:bg-white focus:ring-1 focus:ring-brand-300 focus:outline-none";
  return (
    <>
      <div>
        <dt className="text-xs text-slate-500">Brand</dt>
        <dd>
          <input
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            onBlur={(e) => {
              const v = e.currentTarget.value.trim();
              if (v && v !== brand) start(async () => done(await setDealBrand(dealId, v)));
            }}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            list={`brands-${dealId}`}
            placeholder="Which brand?"
            className={`${fieldClass} ${!brandName ? "ring-1 ring-amber-300" : ""}`}
          />
          <datalist id={`brands-${dealId}`}>{brands.map((b) => <option key={b} value={b} />)}</datalist>
        </dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">Through agency</dt>
        <dd>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={(e) => saveAgency(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            list={`agencies-${dealId}`}
            placeholder="Direct with brand"
            className={fieldClass}
          />
          <datalist id={`agencies-${dealId}`}>{agencies.map((a) => <option key={a} value={a} />)}</datalist>
        </dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">TDS</dt>
        <dd>
          <select
            value={rate}
            onChange={(e) => {
              setRate(e.target.value);
              start(async () => done(await setDealTds(dealId, Number(e.target.value))));
            }}
            className="-mx-1 rounded-md bg-transparent px-0.5 font-medium hover:bg-slate-100"
            title={ruleHint ?? undefined}
          >
            {rate === "" && <option value="">Not set</option>}
            <option value="10">10% cut</option>
            <option value="2">2% cut</option>
            <option value="0">No TDS</option>
          </select>
        </dd>
      </div>
    </>
  );
}

export type InvoiceView = {
  id: string;
  number: string;
  status: string;
  issueDate: string;
  dueDate: string | null;
  billToId: string;
  subtotal: number;
  items: { description: string; quantity: number; rate: number }[];
};

/** The deal's invoice: summary, PDF / send, and a simple editor. */
export function InvoiceBox({ dealId, invoice, parties, hasFee }: { dealId: string; invoice: InvoiceView | null; parties: { id: string; name: string; role: string }[]; hasFee: boolean }) {
  const [editing, setEditing] = useState(false);
  const [billTo, setBillTo] = useState(invoice?.billToId ?? parties[0]?.id ?? "");
  const [issue, setIssue] = useState(invoice?.issueDate ?? "");
  const [due, setDue] = useState(invoice?.dueDate ?? "");
  const [items, setItems] = useState(invoice?.items.map((i) => ({ ...i, quantity: String(i.quantity), rate: String(i.rate) })) ?? []);
  const [pending, start] = useTransition();

  if (!invoice)
    return (
      <div className="rounded-xl border border-dashed border-slate-200 p-3 text-sm text-slate-500">
        No invoice yet.{" "}
        {hasFee ? (
          <Tap action={() => createDealInvoice(dealId)} className="link" saved="Invoice created (draft)">Create it</Tap>
        ) : (
          "Add the fee above first."
        )}
      </div>
    );

  const total = items.reduce((s, i) => s + (Number(i.quantity) || 1) * (Number(i.rate) || 0), 0);
  const billedTo = parties.find((p) => p.id === invoice.billToId);
  if (!editing)
    return (
      <div className="rounded-xl p-3 ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <Link href={`/invoices/${invoice.id}`} className="link font-medium">{invoice.number}</Link>
            <span className="ml-2 text-sm text-slate-600">{inr(invoice.subtotal)}</span>
            <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] ${invoice.status === "paid" ? "bg-emerald-50 text-emerald-700" : invoice.status === "draft" ? "bg-slate-100 text-slate-600" : "bg-sky-50 text-sky-800"}`}>
              {invoice.status === "partially_paid" ? "part paid" : invoice.status}
            </span>
          </div>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setEditing(true)} className="btn-secondary px-2.5 py-1 text-xs">Edit</button>
            <a href={`/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer" className="btn-secondary px-2.5 py-1 text-xs">PDF</a>
            <Link href={`/email/compose?invoice=${invoice.id}&template=${encodeURIComponent(invoice.status === "draft" ? "Send invoice" : "Payment reminder")}`} className="btn-secondary px-2.5 py-1 text-xs">
              {invoice.status === "draft" ? "Send" : "Remind"}
            </Link>
          </div>
        </div>
        <div className="mt-1 text-xs text-slate-500">
          To {billedTo ? `${billedTo.name} (${billedTo.role})` : "—"} · dated {day(invoice.issueDate)}{invoice.dueDate ? ` · due ${day(invoice.dueDate)}` : ""}
        </div>
      </div>
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveInvoiceSimple(invoice.id, { billToId: billTo, issueDate: issue, dueDate: due, items: items.map((i) => ({ description: i.description, quantity: Number(i.quantity) || 1, rate: Number(i.rate) || 0 })) });
          done(r);
          if (!r.error) setEditing(false);
        });
      }}
      className="space-y-3 rounded-xl p-3 ring-1 ring-brand-200"
    >
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block">
          <span className="label">Invoice to</span>
          <select value={billTo} onChange={(e) => setBillTo(e.target.value)} className="input py-1.5">
            {parties.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.role})</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Date</span>
          <input type="date" value={issue} onChange={(e) => setIssue(e.target.value)} className="input py-1.5" />
        </label>
        <label className="block">
          <span className="label">Due</span>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="input py-1.5" />
        </label>
      </div>
      <div className="space-y-1.5">
        <span className="label">Lines</span>
        {items.map((it, i) => (
          <div key={i} className="flex gap-1.5">
            <input value={it.description} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} placeholder="1 Instagram reel" className="input min-w-0 flex-1 py-1.5" />
            <input value={it.quantity} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} inputMode="decimal" className="input w-14 py-1.5" aria-label="Quantity" />
            <input value={it.rate} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)))} inputMode="decimal" placeholder="₹" className="input w-28 py-1.5" aria-label="Rate" />
            <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} className="btn-ghost px-2 text-slate-400" aria-label="Remove line">✕</button>
          </div>
        ))}
        <button type="button" onClick={() => setItems([...items, { description: "", quantity: "1", rate: "" }])} className="text-xs text-brand-600 hover:underline">+ Add a line</button>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Total {inr(total)}</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditing(false)} className="btn-ghost px-3 py-1.5 text-sm">Cancel</button>
          <button disabled={pending} className="btn-primary px-3 py-1.5 text-sm">{pending ? "Saving…" : "Save invoice"}</button>
        </div>
      </div>
    </form>
  );
}

export type PaymentView = { id: string; date: string; net: number; tds: number; from: string | null; bank: boolean };

/** Every payment on the deal (advances, parts, final), and adding one. */
export function PaymentsBox({ dealId, payments, expected, rate }: { dealId: string; payments: PaymentView[]; expected: number; rate: number }) {
  const received = payments.reduce((s, p) => s + p.net, 0);
  const tds = payments.reduce((s, p) => s + p.tds, 0);
  const counted = received + tds;
  const pct = expected > 0 ? Math.min(100, Math.round((counted / expected) * 100)) : 0;
  return (
    <div className="space-y-2.5">
      {expected > 0 && (
        <div>
          <div className="flex justify-between text-xs text-slate-600">
            <span>{inr(received)} received{tds ? ` + ${inr(tds)} TDS` : ""}</span>
            <span>of {inr(expected)}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${pct >= 100 ? "bg-emerald-500" : "bg-brand-500"}`} style={{ width: `${Math.max(pct, payments.length ? 3 : 0)}%` }} />
          </div>
        </div>
      )}
      {payments.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
          {payments.map((p) => (
            <TapRow key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                {day(p.date)} · {p.bank ? `🏦 ${p.from ?? "Bank"}` : `✋ ${p.from ?? "Added by hand"}`}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="tabular-nums font-medium">{inr(p.net)}</span>
                {p.tds > 0 && <span className="text-xs text-slate-400">+{inr(p.tds)} TDS</span>}
                <Tap action={() => removePayment(p.id)} hideRow saved="Payment removed" className="text-xs text-slate-400 hover:text-rose-600" title="Remove this payment">✕</Tap>
              </span>
            </TapRow>
          ))}
        </ul>
      )}
      <AddPayment dealId={dealId} rate={rate} />
    </div>
  );
}

function AddPayment({ dealId, rate }: { dealId: string; rate: number }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Awaited<ReturnType<typeof paymentCandidates>> | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [find, setFind] = useState("");
  const [, start] = useTransition();
  const needle = find.trim().toLowerCase().replace(/[₹,]/g, "");
  const shown = (list?.items ?? [])
    .filter((t) => !needle || `${t.who} ${t.note ?? ""} ${t.amount} ${t.date}`.toLowerCase().includes(needle))
    .slice(0, needle ? 30 : 10);

  if (!open)
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          start(async () => setList(await paymentCandidates(dealId)));
        }}
        className="btn-secondary px-3 py-1.5 text-sm"
      >
        + Add payment
      </button>
    );
  const add = (input: Parameters<typeof addDealPayment>[1]) => {
    setOpen(false);
    start(async () => done(await addDealPayment(dealId, input)));
  };
  return (
    <div className="space-y-2 rounded-xl bg-slate-50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Which money was it?</span>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost px-2 py-0.5 text-xs">✕</button>
      </div>
      {rate > 0 && <p className="text-xs text-slate-500">TDS is on ({rate}%), so the amount that reached you is taken as after TDS.</p>}
      <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search: name (e.g. zixi) or amount" className="input py-1.5 text-sm" />
      {!list ? (
        <p className="text-sm text-slate-500">Looking at your bank…</p>
      ) : shown.length ? (
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {shown.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => add({ txnId: t.id })} className="flex w-full items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-left text-sm ring-1 ring-slate-200 hover:ring-brand-300">
                <span className="min-w-0 truncate">
                  {day(t.date)} · {t.who}
                  {t.note ? <span className="text-slate-400"> · {t.note}</span> : null}
                  {t.category ? <span className="text-slate-400"> · {t.category}</span> : null}
                </span>
                <span className={`shrink-0 tabular-nums font-medium ${Math.abs(t.amount - list.remainingNet) < 1 ? "text-emerald-700" : ""}`}>{inr(t.amount)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">{needle ? "Nothing matches — try part of the name or the exact amount." : "No unlinked money in found."}</p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add({ amount: Number(amount.replace(/[₹,\s]/g, "")), date: date || undefined });
        }}
        className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2"
      >
        <span className="text-xs text-slate-500">Not in the bank list (cash, another account)?</span>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="₹ received" className="input w-28 py-1 text-sm" />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input w-auto py-1 text-sm" />
        <button disabled={!amount.trim()} className="btn-primary px-3 py-1 text-xs">Add</button>
      </form>
    </div>
  );
}
