import "server-only";
import type { DB } from "@/app/actions/helpers";
import { stageInfo } from "@/lib/constants";
import { loadTxns, monthRange, summarize } from "@/lib/finance/report";
import { rupees, todayIST } from "@/lib/format";

/**
 * A short picture of where things stand, given to the AI up front so most
 * questions are answered in one go (no lookups needed). Kept small on purpose.
 */
export async function buildSnapshot(db: DB, userId: string): Promise<string> {
  const today = todayIST();
  const ym = today.slice(0, 7);
  const { from, to } = monthRange(ym);
  const [txns, deals, invoices, review, follow] = await Promise.all([
    loadTxns(db, from, to, userId),
    db.from("deals").select("id, title, stage, amount, due_date, brand:brands(name)").eq("user_id", userId).not("stage", "in", "(paid,lost)").order("due_date", { ascending: true, nullsFirst: false }).limit(8),
    db.from("invoices").select("invoice_number, subtotal, due_date, status, brand:brands(name), payments(gross_amount)").eq("user_id", userId).in("status", ["sent", "partially_paid"]).order("due_date").limit(6),
    db.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("needs_review", true),
    db.from("deals").select("id", { count: "exact", head: true }).eq("user_id", userId).lte("next_follow_up", today).not("stage", "in", "(paid,lost)"),
  ]);
  const s = summarize(txns);
  const lines: string[] = [];
  lines.push(
    `This month so far (${ym}): income ${rupees(s.income)}, spent ${rupees(s.spent)}, invested ${rupees(s.invested)}. Top spending: ${s.spendingCats.slice(0, 5).map((c) => `${c.name} ${rupees(c.amount)}`).join(", ") || "none"}.`,
  );
  if (s.sajilo.in || s.sajilo.out) lines.push(`Sajilo this month (separate): in ${rupees(s.sajilo.in)}, out ${rupees(s.sajilo.out)}.`);
  lines.push(`Transactions waiting to be sorted: ${review.count ?? 0}. Follow-ups due: ${follow.count ?? 0}.`);
  const d = deals.data ?? [];
  if (d.length) lines.push(`Open deals: ${d.map((x) => `${x.brand?.name ?? "?"} — ${x.title} (${stageInfo(x.stage).label}${x.amount ? `, ${rupees(x.amount)}` : ""}${x.due_date ? `, due ${x.due_date}` : ""}; id ${x.id})`).join("; ")}.`);
  const inv = (invoices.data ?? []).map((i) => ({ ...i, bal: Number(i.subtotal) - (i.payments ?? []).reduce((t, p) => t + Number(p.gross_amount), 0) })).filter((i) => i.bal > 0.5);
  if (inv.length) lines.push(`Unpaid invoices: ${inv.map((i) => `${i.invoice_number} ${i.brand?.name ?? ""} ${rupees(i.bal)}${i.due_date ? ` due ${i.due_date}` : ""}`).join("; ")}.`);
  return lines.join("\n").slice(0, 2500);
}
