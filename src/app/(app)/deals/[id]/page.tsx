import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteActivity } from "@/app/actions/activities";
import { deleteDeal, moveDealToStageForm } from "@/app/actions/deals";
import { deleteDealFile } from "@/app/actions/files";
import { ConfirmButton } from "@/components/forms";
import { Badge, Card, Empty, PageHeader, StageBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { DELIVERABLE_STATUSES, SOURCES, STAGES, stageInfo } from "@/lib/constants";
import { fmtDate, fmtDateTime, relativeDay, rupees, todayIST } from "@/lib/format";
import { InvoiceBadge } from "@/components/invoice-badge";
import { isOverdue } from "@/lib/money";
import { AddDeliverable, EditDeliverable, FollowUpForm, NoteForm, UploadForm } from "./parts";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data } = await supabase.from("deals").select("title").eq("id", id).maybeSingle();
  return { title: data?.title ?? "Deal" };
}

const statusTone = { todo: "slate", in_progress: "amber", sent_for_approval: "violet", approved: "violet", posted: "green" } as const;

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const today = todayIST();

  const [{ data: deal }, { data: deliverables }, { data: activities }, { data: files }, { data: invoices }, { data: loosePayments }] = await Promise.all([
    supabase
      .from("deals")
      .select("*, brand:brands(id, name), contact:contacts(id, name, email, phone, role)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("deliverables").select("*").eq("deal_id", id).order("due_date", { nullsFirst: false }).order("created_at"),
    supabase.from("activities").select("*").eq("deal_id", id).order("created_at", { ascending: false }),
    supabase.from("deal_files").select("*").eq("deal_id", id).order("created_at", { ascending: false }),
    supabase.from("invoices").select("id, invoice_number, issue_date, due_date, subtotal, status, payments(gross_amount, tds_amount)").eq("deal_id", id).order("issue_date"),
    supabase.from("payments").select("id, received_date, gross_amount, tds_amount, net_amount").eq("deal_id", id).is("invoice_id", null),
  ]);
  if (!deal) notFound();

  const stageIndex = STAGES.findIndex((s) => s.id === deal.stage);
  const nextStage = deal.stage !== "lost" && deal.stage !== "paid" ? STAGES[stageIndex + 1] : null;

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/deals" className="text-slate-500 hover:underline">Deals</Link>
        <span className="mx-1.5 text-slate-300">/</span>
        <Link href={`/brands/${deal.brand?.id}`} className="text-slate-500 hover:underline">{deal.brand?.name}</Link>
      </div>
      <PageHeader
        title={deal.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StageBadge stage={deal.stage} />
            <span className="font-medium text-slate-700">{deal.amount ? rupees(deal.amount) : deal.is_barter ? "Barter" : "No amount yet"}</span>
            {deal.is_barter && deal.barter_value ? <span>· products worth {rupees(deal.barter_value)}</span> : null}
          </span>
        }
        actions={
          <>
            {nextStage && (
              <form action={moveDealToStageForm.bind(null, deal.id, nextStage.id)}>
                <button className="btn-primary">Move to {nextStage.label} →</button>
              </form>
            )}
            <Link href={`/email/compose?deal=${deal.id}`} className="btn-secondary">Email brand</Link>
            <Link href={`/deals/${deal.id}/edit`} className="btn-secondary">Edit</Link>
            <ConfirmButton action={deleteDeal.bind(null, deal.id)} confirmText="Delete this deal, its deliverables, notes and files? This can't be undone.">
              Delete
            </ConfirmButton>
          </>
        }
      />

      {/* Stage stepper */}
      <div className="no-print mb-6 flex gap-1 overflow-x-auto pb-1">
        {STAGES.map((s, i) => {
          const current = s.id === deal.stage;
          const passed = deal.stage !== "lost" && i < stageIndex && s.id !== "lost";
          return (
            <form key={s.id} action={moveDealToStageForm.bind(null, deal.id, s.id)}>
              <button
                disabled={current}
                className={`rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ${
                  current ? `${stageInfo(s.id).color} ring-2 ring-current/30` : passed ? "bg-brand-50 text-brand-700 hover:bg-brand-100" : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {passed ? "✓ " : ""}
                {s.label}
              </button>
            </form>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={`Deliverables${deliverables?.length ? ` (${deliverables.length})` : ""}`}>
            <ul className="mb-3 divide-y divide-slate-100">
              {deliverables?.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {d.quantity > 1 ? `${d.quantity}× ` : ""}
                      {d.type}
                      {d.platform ? <span className="font-normal text-slate-500"> · {d.platform}</span> : null}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                      {d.due_date && d.status !== "posted" && (
                        <span className={d.due_date < today ? "font-medium text-rose-600" : ""}>Due {fmtDate(d.due_date, true)} ({relativeDay(d.due_date, today)})</span>
                      )}
                      {d.posted_date && <span>Posted {fmtDate(d.posted_date, true)}</span>}
                      {d.link && (
                        <a href={d.link} target="_blank" rel="noreferrer" className="link">View post ↗</a>
                      )}
                      {d.notes && <span>{d.notes}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={statusTone[d.status as keyof typeof statusTone] ?? "slate"}>
                      {DELIVERABLE_STATUSES.find((s) => s.id === d.status)?.label}
                    </Badge>
                    <EditDeliverable d={d} />
                  </div>
                </li>
              ))}
            </ul>
            <AddDeliverable dealId={deal.id} platform={deal.platform} />
          </Card>

          <Card title="Timeline">
            <NoteForm dealId={deal.id} />
            <ol className="mt-5 space-y-4 border-l border-slate-200 pl-4">
              {activities?.map((a) => (
                <li key={a.id} className="group relative">
                  <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-500" />
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-600 capitalize">{a.kind.replace("_", " ")}</span>
                    <span>{fmtDateTime(a.created_at)}</span>
                    {!["stage_change", "system"].includes(a.kind) && (
                      <span className="opacity-0 group-hover:opacity-100">
                        <ConfirmButton action={deleteActivity.bind(null, a.id)} confirmText="Delete this note?" className="text-xs text-rose-500 hover:underline">
                          delete
                        </ConfirmButton>
                      </span>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap text-slate-800">
                    {a.kind === "stage_change"
                      ? a.body
                          .split(" → ")
                          .map((s) => stageInfo(s).label)
                          .join(" → ")
                      : a.body}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Details">
            <dl className="space-y-3 text-sm">
              <Row label="Brand">
                <Link href={`/brands/${deal.brand?.id}`} className="link">{deal.brand?.name}</Link>
              </Row>
              <Row label="Contact">
                {deal.contact ? (
                  <div>
                    <div>{deal.contact.name}{deal.contact.role ? <span className="text-slate-500"> · {deal.contact.role}</span> : null}</div>
                    {deal.contact.email && <a href={`mailto:${deal.contact.email}`} className="link block">{deal.contact.email}</a>}
                    {deal.contact.phone && <a href={`tel:${deal.contact.phone}`} className="link block">{deal.contact.phone}</a>}
                  </div>
                ) : (
                  <Link href={`/brands/${deal.brand?.id}#contacts`} className="text-slate-400 hover:underline">Add a contact</Link>
                )}
              </Row>
              <Row label="Platform">{deal.platform ?? "—"}</Row>
              <Row label="Came in via">{SOURCES.find((s) => s.id === deal.source)?.label ?? "—"}</Row>
              <Row label="Deal date">{fmtDate(deal.deal_date)}</Row>
              <Row label="Deadline">{fmtDate(deal.due_date)}</Row>
              {deal.lost_reason && <Row label="Lost because">{deal.lost_reason}</Row>}
            </dl>
            {deal.notes && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-wrap text-slate-700">{deal.notes}</p>}
          </Card>

          <Card
            title="Invoices & payments"
            action={<Link href={`/invoices/new?deal=${deal.id}`} className="link text-xs">+ Invoice</Link>}
          >
            {invoices?.length || loosePayments?.length ? (
              <ul className="space-y-3 text-sm">
                {invoices?.map((inv) => {
                  const paid = inv.payments.reduce((t, p) => t + Number(p.gross_amount), 0);
                  const tds = inv.payments.reduce((t, p) => t + Number(p.tds_amount), 0);
                  return (
                    <li key={inv.id}>
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/invoices/${inv.id}`} className="link font-medium">{inv.invoice_number}</Link>
                        <InvoiceBadge status={inv.status} overdue={isOverdue(inv, today)} />
                      </div>
                      <div className="text-xs text-slate-500">
                        {rupees(inv.subtotal)} · {fmtDate(inv.issue_date, true)}
                        {paid > 0 && ` · ${rupees(paid - tds)} in bank${tds ? ` + ${rupees(tds)} TDS` : ""}`}
                      </div>
                    </li>
                  );
                })}
                {loosePayments?.map((p) => (
                  <li key={p.id} className="text-xs text-slate-600">
                    Payment {fmtDate(p.received_date, true)}: {rupees(p.net_amount)} in bank{Number(p.tds_amount) ? ` + ${rupees(p.tds_amount)} TDS` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-slate-500">No invoice yet.</p>
                <Link href={`/invoices/new?deal=${deal.id}`} className="btn-secondary w-full">Create invoice from this deal</Link>
              </div>
            )}
          </Card>

          {deal.stage !== "paid" && deal.stage !== "lost" && (
            <Card
              title="Follow-up"
              action={
                deal.next_follow_up ? (
                  <Badge tone={deal.next_follow_up < today ? "red" : deal.next_follow_up === today ? "amber" : "slate"}>
                    {relativeDay(deal.next_follow_up, today)}
                  </Badge>
                ) : (
                  <span className="text-xs text-slate-400">None set</span>
                )
              }
            >
              <FollowUpForm dealId={deal.id} />
            </Card>
          )}

          <Card title="Briefs & contracts">
            {files?.length ? (
              <ul className="mb-4 space-y-2">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 text-sm">
                    <a href={`/files/${f.id}`} target="_blank" rel="noreferrer" className="link min-w-0 truncate">
                      {f.name}
                    </a>
                    <span className="flex shrink-0 items-center gap-2">
                      <Badge>{f.kind}</Badge>
                      <ConfirmButton action={deleteDealFile.bind(null, f.id)} confirmText={`Delete ${f.name}?`} className="text-xs text-rose-500 hover:underline">
                        ✕
                      </ConfirmButton>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mb-4">
                <Empty>No files yet.</Empty>
              </div>
            )}
            <UploadForm dealId={deal.id} />
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="col-span-2 min-w-0 break-words">{children}</dd>
    </div>
  );
}
