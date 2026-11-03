import Link from "next/link";
import { Tap, TapRow } from "@/components/tap";
import { followedUp, invoiceAndSend } from "@/app/actions/quick";
import { markDealPaid, markInvoicePaid, removeContent } from "@/app/actions/work";
import { moveDealToStage } from "@/app/actions/deals";
import { AskButton } from "@/components/assistant";
import { requireUser } from "@/lib/auth";
import { fmtDate, fmtDateTime, relativeDay, rupees, todayIST } from "@/lib/format";
import { isOverdue } from "@/lib/money";
import { UploadForm } from "./[id]/parts";
import { ContentAdder, InlineField, NoteAdder, PostedButton, StagePicker } from "./work-parts";

/** Everything about one deal, opened next to the list. */
export async function DealPanel({ id, closeHref }: { id: string; closeHref: string }) {
  const { supabase } = await requireUser();
  const today = todayIST();
  const [{ data: deal }, { data: content }, { data: invoices }, { data: notes }, { data: files }] = await Promise.all([
    supabase.from("deals").select("*, brand:brands(id, name), contact:contacts(name, email, phone)").eq("id", id).maybeSingle(),
    supabase.from("deliverables").select("id, type, quantity, due_date, status, link").eq("deal_id", id).order("created_at"),
    supabase.from("invoices").select("id, invoice_number, subtotal, status, due_date, tds_rate, payments(gross_amount, tds_amount)").eq("deal_id", id).neq("status", "cancelled").order("issue_date"),
    supabase.from("activities").select("id, kind, body, created_at").eq("deal_id", id).order("created_at", { ascending: false }).limit(6),
    supabase.from("deal_files").select("id, name, kind").eq("deal_id", id).order("created_at", { ascending: false }),
  ]);
  if (!deal) return <p className="p-6 text-sm text-slate-500">This deal was deleted. <Link href={closeHref} className="link">Back</Link></p>;

  const stage = deal.stage;
  const items = content ?? [];
  const inv = invoices?.[0];
  const balance = inv ? Number(inv.subtotal) - inv.payments.reduce((s, p) => s + Number(p.gross_amount), 0) : 0;
  const allPosted = items.length > 0 && items.every((d) => d.status === "posted");

  // ---- The one thing to do next ----
  let next: React.ReactNode = null;
  if (["lead", "contacted", "negotiating"].includes(stage)) {
    next = (
      <Step title="Still talking" text={deal.next_follow_up ? `Next follow-up ${relativeDay(deal.next_follow_up, today).toLowerCase()}.` : "No follow-up reminder set."}>
        <Tap action={followedUp.bind(null, id, 3)} className="btn-secondary px-3 py-1.5 text-sm" hideRow saved="Follow-up logged">Followed up ✓ (remind in 3 days)</Tap>
        <Tap action={moveDealToStage.bind(null, id, "confirmed")} className="btn-primary px-3 py-1.5 text-sm" done="✓" saved="Moved">They said yes →</Tap>
        <Tap action={moveDealToStage.bind(null, id, "lost")} className="btn-ghost px-3 py-1.5 text-sm text-slate-500" done="✓" saved="Moved">Didn&apos;t happen</Tap>
      </Step>
    );
  } else if (["confirmed", "in_progress"].includes(stage)) {
    next = (
      <Step title="Make the content" text={items.length ? `${items.filter((d) => d.status === "posted").length} of ${items.length} posted. Tap “Mark posted” on each one when it goes live.` : "Add what you need to make below (e.g. “1 reel”)."}>
        {allPosted && <Tap action={moveDealToStage.bind(null, id, "posted")} className="btn-primary px-3 py-1.5 text-sm" done="✓" saved="Moved">All posted →</Tap>}
      </Step>
    );
  } else if (stage === "posted" && !inv) {
    next = (
      <Step title="Get paid" text={deal.amount ? `Send the invoice for ${rupees(deal.amount)} — it's filled in for you; you just check and send.` : "Add the fee above first, then send the invoice."} tone="brand">
        {deal.amount ? <Tap action={invoiceAndSend.bind(null, id)} className="btn-primary px-3 py-1.5 text-sm" done="Opening…" saved="">Create & send invoice</Tap> : null}
        <Tap action={markDealPaid.bind(null, id)} className="btn-ghost px-3 py-1.5 text-sm" done="Paid ✓" saved="Marked as paid">Already paid</Tap>
      </Step>
    );
  } else if (inv && balance > 0.5 && stage !== "paid") {
    const overdue = isOverdue(inv, today);
    next = (
      <Step title={overdue ? "Payment is late" : "Waiting for payment"} text={`${rupees(balance)} due on ${inv.invoice_number}${inv.due_date ? ` · ${relativeDay(inv.due_date, today).toLowerCase()}` : ""}.`} tone={overdue ? "red" : "brand"}>
        <Tap action={markInvoicePaid.bind(null, inv.id)} className="btn-primary px-3 py-1.5 text-sm" done="Paid ✓" saved="Marked as paid">Got paid ✓</Tap>
        {inv.status === "draft" ? (
          <Link href={`/email/compose?invoice=${inv.id}&template=${encodeURIComponent("Send invoice")}`} className="btn-secondary px-3 py-1.5 text-sm">Send invoice</Link>
        ) : (
          <Link href={`/email/compose?invoice=${inv.id}&template=${encodeURIComponent("Payment reminder")}`} className="btn-secondary px-3 py-1.5 text-sm">Send reminder</Link>
        )}
      </Step>
    );
  } else if (stage === "paid") {
    const got = (invoices ?? []).flatMap((i) => i.payments).reduce((s, p) => s + Number(p.gross_amount) - Number(p.tds_amount), 0);
    next = <Step title="All done 🎉" text={got ? `${rupees(got)} reached your bank.` : "Marked as paid."} tone="green" />;
  } else if (stage === "lost") {
    next = (
      <Step title="Didn't happen" text={deal.lost_reason ?? "Marked as lost."}>
        <Tap action={moveDealToStage.bind(null, id, "negotiating")} className="btn-secondary px-3 py-1.5 text-sm" done="✓" saved="Moved">Reopen</Tap>
      </Step>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/brands/${deal.brand?.id}`} className="text-sm font-medium text-slate-500 hover:underline">{deal.brand?.name}</Link>
          <h2 className="text-xl font-semibold tracking-tight">
            <InlineField key={`t-${deal.title}`} dealId={id} field="title" value={deal.title} />
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <StagePicker dealId={id} stage={stage} />
          <Link href={closeHref} className="btn-ghost px-2" aria-label="Close">✕</Link>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-4">
        <Fact label="Fee"><InlineField key={`a-${deal.amount}`} dealId={id} field="amount" value={deal.amount} kind="money" placeholder={deal.is_barter ? "Barter" : "Add fee"} /></Fact>
        <Fact label="Deadline"><InlineField key={`d-${deal.due_date}`} dealId={id} field="due_date" value={deal.due_date} kind="date" placeholder="Set date" /></Fact>
        <Fact label="Follow up"><InlineField key={`f-${deal.next_follow_up}`} dealId={id} field="next_follow_up" value={deal.next_follow_up} kind="date" placeholder="Set date" /></Fact>
        <Fact label="Platform"><InlineField key={`p-${deal.platform}`} dealId={id} field="platform" value={deal.platform} placeholder="Instagram?" /></Fact>
        {deal.contact && (
          <Fact label="Contact" wide>
            {deal.contact.name}
            {deal.contact.email && <> · <a href={`mailto:${deal.contact.email}`} className="link">{deal.contact.email}</a></>}
          </Fact>
        )}
      </dl>

      {next}

      <Section title="Content">
        {items.length > 0 && (
          <ul className="mb-3 divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
            {items.map((d) => (
              <TapRow key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{d.quantity > 1 ? `${d.quantity}× ` : ""}{d.type}</span>
                  {d.due_date && d.status !== "posted" && <span className={`ml-2 text-xs ${d.due_date < today ? "text-rose-600" : "text-slate-500"}`}>due {fmtDate(d.due_date, true)}</span>}
                  {d.link && <a href={d.link} target="_blank" rel="noreferrer" className="link ml-2 text-xs">view post ↗</a>}
                </span>
                <span className="flex items-center gap-2">
                  <PostedButton deliverableId={d.id} posted={d.status === "posted"} />
                  <Tap action={removeContent.bind(null, d.id)} className="text-xs text-slate-400 hover:text-rose-600" hideRow saved="Removed">✕</Tap>
                </span>
              </TapRow>
            ))}
          </ul>
        )}
        <ContentAdder dealId={id} />
      </Section>

      {(invoices?.length ?? 0) > 0 && (
        <Section title="Money">
          <ul className="space-y-2 text-sm">
            {invoices!.map((i) => {
              const paid = i.payments.reduce((s, p) => s + Number(p.gross_amount), 0);
              const tds = i.payments.reduce((s, p) => s + Number(p.tds_amount), 0);
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2.5 ring-1 ring-slate-200">
                  <Link href={`/invoices/${i.id}`} className="link font-medium">{i.invoice_number}</Link>
                  <span className="text-slate-600">
                    {rupees(i.subtotal)}
                    {paid > 0 ? ` · ${rupees(paid - tds)} in bank${tds ? ` + ${rupees(tds)} TDS` : ""}` : ` · ${i.status === "draft" ? "not sent yet" : "unpaid"}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <Section title="Notes">
        <NoteAdder dealId={id} />
        {notes?.length ? (
          <ul className="mt-3 space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="text-sm">
                <span className="text-xs text-slate-400">{fmtDateTime(n.created_at)} · </span>
                <span className="text-slate-700">{n.body}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {deal.notes && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm whitespace-pre-wrap text-amber-950">{deal.notes}</p>}
      </Section>

      <Section title="Brief & contract">
        {files?.length ? (
          <ul className="mb-3 space-y-1 text-sm">
            {files.map((f) => (
              <li key={f.id}><a href={`/files/${f.id}`} target="_blank" rel="noreferrer" className="link">{f.name}</a> <span className="text-xs text-slate-400">· {f.kind}</span></li>
            ))}
          </ul>
        ) : null}
        <UploadForm dealId={id} />
      </Section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <AskButton className="btn-secondary" label="✨ Ask AI about this deal" />
        <Link href={`/deals/${id}`} className="text-sm text-slate-500 hover:underline">All details & history →</Link>
      </div>
    </div>
  );
}

function Fact({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2 sm:col-span-4" : ""}>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Step({ title, text, tone = "slate", children }: { title: string; text: string; tone?: "slate" | "brand" | "red" | "green"; children?: React.ReactNode }) {
  const tones = { slate: "bg-white ring-slate-200", brand: "bg-brand-50 ring-brand-100", red: "bg-rose-50 ring-rose-200", green: "bg-emerald-50 ring-emerald-200" };
  return (
    <div className={`rounded-2xl p-4 ring-1 ${tones[tone]}`}>
      <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Next step</div>
      <div className="mt-0.5 font-semibold">{title}</div>
      <p className="text-sm text-slate-600">{text}</p>
      {children && <div className="mt-3 flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
