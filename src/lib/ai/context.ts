import "server-only";
import type { DB } from "@/app/actions/helpers";
import { stageInfo } from "@/lib/constants";
import { rupees } from "@/lib/format";

export type PageContext = { type: "deal" | "brand" | "invoice" | "transaction" | "page"; id?: string; path?: string };

/** One line telling the AI what you're looking at, so "this deal" / "this payment" works. */
export async function describeContext(db: DB, userId: string, ctx: PageContext | null): Promise<string | null> {
  if (!ctx) return null;
  const id = ctx.id && /^[0-9a-f-]{36}$/.test(ctx.id) ? ctx.id : null;
  if (ctx.type === "deal" && id) {
    const { data: d } = await db.from("deals").select("id, title, stage, amount, due_date, next_follow_up, brand:brands(name)").eq("id", id).eq("user_id", userId).maybeSingle();
    if (d) return `The user is looking at the deal "${d.title}" with ${d.brand?.name} (deal_id ${d.id}; stage ${stageInfo(d.stage).label}; fee ${d.amount ? rupees(d.amount) : "not set"}; deadline ${d.due_date ?? "none"}; follow-up ${d.next_follow_up ?? "none"}). "This deal" / "this" means this deal.`;
  }
  if (ctx.type === "brand" && id) {
    const { data: b } = await db.from("brands").select("id, name").eq("id", id).eq("user_id", userId).maybeSingle();
    if (b) return `The user is looking at the brand ${b.name}. "This brand" means ${b.name}.`;
  }
  if (ctx.type === "invoice" && id) {
    const { data: i } = await db.from("invoices").select("invoice_number, subtotal, status, deal_id, brand:brands(name)").eq("id", id).eq("user_id", userId).maybeSingle();
    if (i) return `The user is looking at invoice ${i.invoice_number} for ${i.brand?.name} (${rupees(i.subtotal)}, ${i.status}${i.deal_id ? `, deal_id ${i.deal_id}` : ""}).`;
  }
  if (ctx.type === "transaction" && id) {
    const { data: t } = await db.from("transactions").select("id, txn_date, amount, direction, counterparty, description").eq("id", id).eq("user_id", userId).maybeSingle();
    if (t) return `The user is looking at the transaction ${t.id}: ${t.direction === "debit" ? "paid" : "received"} ${rupees(t.amount)} on ${t.txn_date} (${t.counterparty ?? t.description}). "This" means this transaction.`;
  }
  if (ctx.path) return `The user is on the "${ctx.path}" screen of the app.`;
  return null;
}
