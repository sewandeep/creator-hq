import "server-only";
import type { DB } from "@/app/actions/helpers";
import { addDays } from "@/lib/format";
import { round2 } from "@/lib/money";
import { findManualMatch, matchReason } from "./categorize";

export async function logChange(supabase: DB, transactionId: string, field: string, oldValue: string | null, newValue: string | null, source: string) {
  if ((oldValue ?? "") === (newValue ?? "")) return;
  await supabase.from("transaction_changes").insert({ transaction_id: transactionId, field, old_value: oldValue, new_value: newValue, source });
}

/** Adds an entry you typed, and links it to a matching bank line if one is already imported. */
export async function addEntry(supabase: DB, e: {
  amount: number;
  direction: "debit" | "credit";
  description: string;
  date: string;
  isCash: boolean;
  person: string | null;
  categoryId: string | null;
  note?: string | null;
  source: "manual" | "telegram";
}): Promise<{ id: string; matchedTo: { id: string; description: string } | null }> {
  const { data: row, error } = await supabase
    .from("transactions")
    .insert({
      source: e.source,
      txn_date: e.date,
      description: e.description.slice(0, 500),
      amount: round2(e.amount),
      direction: e.direction,
      is_cash: e.isCash,
      person: e.person,
      note: e.note ?? null,
      category_id: e.categoryId,
      category_source: e.categoryId ? "user" : "none",
      category_reason: e.categoryId ? "You set this when adding it" : null,
      needs_review: !e.categoryId,
      review_reason: e.categoryId ? null : "What was this for?",
    })
    .select("id, txn_date, amount, direction, description, note, person, category_id")
    .single();
  if (error) throw error;
  if (e.categoryId) await logChange(supabase, row.id, "category", null, "(set when added)", "user");

  if (e.isCash) return { id: row.id, matchedTo: null };
  // Look for the same payment already imported from a statement.
  const { data: bank } = await supabase
    .from("transactions")
    .select("id, txn_date, amount, direction, description, category_id, category_source, needs_review")
    .eq("source", "statement")
    .eq("direction", e.direction)
    .eq("amount", round2(e.amount))
    .gte("txn_date", addDays(e.date, -2))
    .lte("txn_date", addDays(e.date, 5));
  const { data: alreadyLinked } = await supabase.from("transactions").select("matched_txn_id").in("source", ["manual", "telegram"]).not("matched_txn_id", "is", null);
  const linked = new Set((alreadyLinked ?? []).map((l) => l.matched_txn_id));
  const candidates = (bank ?? []).filter((b) => !linked.has(b.id)).map((b) => ({ ...b, amount: Number(b.amount) }));
  // Reuse the same "closest date" logic, flipped around.
  const best = candidates
    .map((b) => ({ b, m: findManualMatch([{ ...row, amount: Number(row.amount) }], { txn_date: b.txn_date, amount: b.amount, direction: b.direction }, new Set()) }))
    .filter((x) => x.m)
    .sort((a, b) => Math.abs(Date.parse(a.b.txn_date) - Date.parse(e.date)) - Math.abs(Date.parse(b.b.txn_date) - Date.parse(e.date)))[0]?.b;
  if (!best) return { id: row.id, matchedTo: null };

  await supabase.from("transactions").update({ matched_txn_id: best.id }).eq("id", row.id);
  if (best.category_source !== "user") {
    await supabase
      .from("transactions")
      .update({
        category_id: e.categoryId ?? best.category_id,
        category_source: "match",
        category_reason: matchReason({ ...row, amount: Number(row.amount) }),
        note: e.note ?? e.description,
        person: e.person,
        needs_review: !(e.categoryId ?? best.category_id),
      })
      .eq("id", best.id);
    await logChange(supabase, best.id, "matched", null, `your entry "${e.description}"`, "match");
  }
  return { id: row.id, matchedTo: { id: best.id, description: best.description } };
}

