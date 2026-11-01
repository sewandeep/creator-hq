import "server-only";
import type { DB } from "@/app/actions/helpers";
import { monthLabel, monthRange, shiftMonth, summarize, loadTxns } from "@/lib/finance/report";
import { addDays, daysBetween, fmtDate, rupees, todayIST } from "@/lib/format";
import { fyOf, fyRange } from "@/lib/fy";
import { esc, type Keyboard } from "./api";

export type BotState = {
  awaiting?: "password";
  statementId?: string;
  pendingFile?: { fileId: string; fileName: string };
  snoozeStatementsUntil?: string;
  lastRecap?: string;
  reviewSkip?: string[];
  proposalId?: string;
};

const ADVANCE_TAX = [
  { md: "06-15", label: "15 June (first instalment, 15%)" },
  { md: "09-15", label: "15 September (45% by now)" },
  { md: "12-15", label: "15 December (75% by now)" },
  { md: "03-15", label: "15 March (100% by now)" },
];

/** The morning message. Empty `lines` = nothing needs you today. */
export async function buildDigest(supabase: DB, userId: string, state: BotState, prefs: { statements?: boolean }) {
  const today = todayIST();
  const lines: string[] = [];
  const keyboard: Keyboard = [];
  const lastMonth = shiftMonth(today.slice(0, 7), -1);
  const lm = monthRange(lastMonth);

  const [{ data: accounts }, { data: statements }, { count: toReview }, { data: followUps }, { data: due }, { data: invoices }] = await Promise.all([
    supabase.from("bank_accounts").select("id, name").eq("user_id", userId).eq("is_archived", false),
    supabase.from("statements").select("account_id, period_to, created_at").eq("user_id", userId).eq("status", "done").gte("period_to", lm.from),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("needs_review", true),
    supabase.from("deals").select("title, next_follow_up, brand:brands(name)").eq("user_id", userId).lte("next_follow_up", today).not("stage", "in", "(paid,lost)").order("next_follow_up"),
    supabase.from("deliverables").select("type, quantity, due_date, deal:deals(title, brand:brands(name))").eq("user_id", userId).neq("status", "posted").gte("due_date", today).lte("due_date", addDays(today, 1)),
    supabase.from("invoices").select("id, invoice_number, due_date, subtotal, brand:brands(name), payments(gross_amount)").eq("user_id", userId).in("status", ["sent", "partially_paid"]).lt("due_date", today),
  ]);

  // 1. Last month's statements — keeps reminding until uploaded.
  // A month counts as uploaded if a statement reaches its last days, or was
  // downloaded after the month ended and includes it (quiet accounts may have
  // no transactions in the final days).
  const covers = (s: { period_to: string | null; created_at: string }) =>
    !!s.period_to && (s.period_to >= addDays(lm.to, -3) || s.created_at.slice(0, 10) > lm.to);
  const missing = (accounts ?? []).filter((a) => !(statements ?? []).some((s) => s.account_id === a.id && covers(s)));
  const snoozed = state.snoozeStatementsUntil && state.snoozeStatementsUntil > today;
  if (prefs.statements !== false && missing.length && Number(today.slice(8)) >= 2 && !snoozed) {
    lines.push(`📄 <b>Upload ${monthLabel(lastMonth)} statement${missing.length > 1 ? "s" : ""}</b> for ${missing.map((a) => esc(a.name)).join(" and ")}. Just forward the PDF here.`);
    keyboard.push([{ text: "⏰ Remind me in 3 days", callback_data: "snooze:3" }]);
  }

  // 2. Transactions to sort.
  if (toReview) {
    lines.push(`🧾 <b>${toReview} transaction${toReview === 1 ? "" : "s"}</b> need you to say what ${toReview === 1 ? "it was" : "they were"}.`);
    keyboard.push([{ text: "Review now", callback_data: "review" }]);
  }

  // 3. Brand follow-ups.
  if (followUps?.length) {
    lines.push(
      `📞 <b>Follow up today:</b>\n${followUps
        .slice(0, 6)
        .map((f) => `• ${esc(f.brand?.name ?? "")} — ${esc(f.title)}${f.next_follow_up! < today ? ` (${daysBetween(f.next_follow_up!, today)}d overdue)` : ""}`)
        .join("\n")}`,
    );
  }

  // 4. Content due.
  if (due?.length) {
    lines.push(
      `🎬 <b>Content due:</b>\n${due
        .map((d) => `• ${d.quantity > 1 ? `${d.quantity}× ` : ""}${esc(d.type)} for ${esc(d.deal?.brand?.name ?? "")} — ${d.due_date === today ? "today" : "tomorrow"}`)
        .join("\n")}`,
    );
  }

  // 5. Unpaid invoices past their due date.
  if (invoices?.length) {
    lines.push(
      `💸 <b>Overdue invoices:</b>\n${invoices
        .map((i) => {
          const bal = Number(i.subtotal) - i.payments.reduce((s, p) => s + Number(p.gross_amount), 0);
          return `• ${esc(i.brand?.name ?? "")} ${esc(i.invoice_number)} — ${rupees(bal)}, ${daysBetween(i.due_date!, today)} days late`;
        })
        .join("\n")}`,
    );
  }

  // 6. Advance tax (only in the week before each due date).
  const year = Number(today.slice(0, 4));
  const tax = ADVANCE_TAX.map((t) => ({ ...t, date: `${year}-${t.md}` })).find((t) => t.date >= today && daysBetween(today, t.date) <= 7);
  if (tax) {
    const { from, to } = fyRange(fyOf(today));
    const { data: pay } = await supabase.from("payments").select("gross_amount, tds_amount").eq("user_id", userId).gte("received_date", from).lte("received_date", to);
    const gross = (pay ?? []).reduce((s, p) => s + Number(p.gross_amount), 0);
    const tds = (pay ?? []).reduce((s, p) => s + Number(p.tds_amount), 0);
    lines.push(`🏛️ <b>Advance tax due ${tax.label}.</b> Creator income this FY so far: ${rupees(gross)} (TDS already cut: ${rupees(tds)}). If your total tax for the year will be over ₹10,000 after TDS, pay this instalment — check with your CA.`);
  }

  // 7. Monthly recap, once all of last month's statements are in.
  let recapFor: string | null = null;
  if ((accounts ?? []).length && !missing.length && state.lastRecap !== lastMonth) {
    const s = summarize(await loadTxns(supabase, lm.from, lm.to, userId));
    const top = s.spendingCats.slice(0, 4).map((c) => `${c.emoji ?? ""} ${esc(c.name)} ${rupees(c.amount)}`).join("\n• ");
    lines.push(`📊 <b>${monthLabel(lastMonth)} wrap-up</b>\nIncome ${rupees(s.income)} · Spent ${rupees(s.spent)} · Invested ${rupees(s.invested)}\n${top ? `Biggest spends:\n• ${top}` : ""}`);
    recapFor = lastMonth;
  }

  return { lines, keyboard, recapFor };
}

export function digestText(lines: string[]) {
  const today = todayIST();
  return `☀️ <b>Good morning!</b> ${fmtDate(today)}\n\n${lines.join("\n\n")}`;
}
