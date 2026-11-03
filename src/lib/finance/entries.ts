import "server-only";
import type { DB } from "@/app/actions/helpers";
import { addDays } from "@/lib/format";
import { round2 } from "@/lib/money";
import { rupees, todayIST } from "@/lib/format";
import { FormError } from "@/lib/forms";
import { findManualMatch, matchReason, matchText, suggestPattern } from "./categorize";
import { ensureCategories } from "./categories-server";
import { parseQuickEntry } from "./quick-add";

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


export type SetCategoryInput = {
  transactionId: string;
  categoryId: string | null;
  remember?: boolean;
  pattern?: string;
  note?: string | null;
  person?: string | null;
};
export type SetCategoryResult = { ok?: boolean; error?: string; alsoUpdated?: number; pattern?: string; groupId?: string };

/**
 * Set a transaction's category. With `remember`, also creates a rule
 * ("always put <payee> under <category>") and applies it to every other
 * matching transaction you haven't set by hand.
 */
export async function applyCategory(supabase: DB, input: SetCategoryInput): Promise<SetCategoryResult> {
  const categories = await ensureCategories(supabase);
  const name = (id: string | null) => categories.find((c) => c.id === id)?.name ?? null;
  const { data: t, error } = await supabase
    .from("transactions")
    .select("id, category_id, direction, description, counterparty, upi_id, note, person, matched_txn_id, source")
    .eq("id", input.transactionId)
    .single();
  if (error || !t) return { error: "Transaction not found." };
  if (input.categoryId && !categories.some((c) => c.id === input.categoryId)) return { error: "Unknown category." };

  const update: { category_id: string | null; category_source: "user"; category_reason: string; needs_review: boolean; review_reason: null; note?: string | null; person?: string | null } = {
    category_id: input.categoryId,
    category_source: "user",
    category_reason: "You set this",
    needs_review: false,
    review_reason: null,
  };
  if (input.note !== undefined) update.note = input.note?.trim() || null;
  if (input.person !== undefined) update.person = input.person?.trim() || null;
  const { error: upError } = await supabase.from("transactions").update(update).eq("id", t.id);
  if (upError) return { error: upError.message };
  await logChange(supabase, t.id, "category", name(t.category_id), name(input.categoryId), "user");
  if (update.note !== undefined) await logChange(supabase, t.id, "note", t.note, update.note, "user");
  if (update.person !== undefined) await logChange(supabase, t.id, "person", t.person, update.person, "user");

  let alsoUpdated = 0;
  if (input.remember && input.categoryId) {
    const pattern = (input.pattern?.trim() || suggestPattern(t)).toLowerCase().slice(0, 80);
    if (pattern.length < 2) return { error: "That payee name is too short to remember." };
    const { data: existing } = await supabase.from("category_rules").select("id").ilike("pattern", pattern).eq("direction", t.direction).maybeSingle();
    if (existing) await supabase.from("category_rules").update({ category_id: input.categoryId }).eq("id", existing.id);
    else await supabase.from("category_rules").insert({ pattern, direction: t.direction, category_id: input.categoryId });

    // Apply to past transactions that you haven't set by hand.
    const lendingPerson = categories.find((c) => c.id === input.categoryId)?.kind === "lending" ? (update.person ?? t.person) : null;
    const { data: others } = await supabase
      .from("transactions")
      .select("id, category_id, description, counterparty, upi_id, note, person")
      .eq("direction", t.direction)
      .neq("category_source", "user")
      .neq("id", t.id)
      .limit(5000);
    for (const o of others ?? []) {
      if (!matchText(o).includes(pattern) || o.category_id === input.categoryId) continue;
      await supabase
        .from("transactions")
        .update({
          category_id: input.categoryId,
          category_source: "rule",
          category_reason: `Your rule: anything containing "${pattern}"`,
          needs_review: false,
          review_reason: null,
          ...(lendingPerson && !o.person ? { person: lendingPerson } : {}),
        })
        .eq("id", o.id);
      await logChange(supabase, o.id, "category", name(o.category_id), name(input.categoryId), "rule");
      alsoUpdated++;
    }
  }
  return { ok: true, alsoUpdated };
}

/** "450 cab" → saved entry. Shared by the web quick-add box and the Telegram bot. */
export async function quickAddCore(supabase: DB, raw: string, source: "manual" | "telegram", chosenCategoryId?: string | null) {
  const parsed = parseQuickEntry(raw, todayIST());
  if (!parsed) throw new FormError('Couldn\'t find an amount. Try "450 cab" or "lent 2000 to rahul".');
  const categories = await ensureCategories(supabase);
  const hint = parsed.categoryHint ? categories.find((c) => c.name === parsed.categoryHint)?.id ?? null : null;
  // Your rules apply to typed entries too.
  const { data: rules } = await supabase.from("category_rules").select("pattern, direction, category_id");
  const rule = (rules ?? [])
    .sort((a, b) => b.pattern.length - a.pattern.length)
    .find((r) => (!r.direction || r.direction === parsed.direction) && raw.toLowerCase().includes(r.pattern.toLowerCase()));
  const categoryId = chosenCategoryId ?? rule?.category_id ?? hint;
  const res = await addEntry(supabase, { ...parsed, categoryId, source });
  const cat = categories.find((c) => c.id === categoryId);
  const message = `Added ${rupees(parsed.amount)} ${parsed.direction === "debit" ? "spent" : "received"}${cat ? ` · ${cat.emoji ?? ""} ${cat.name}` : " · needs a category"}${parsed.person ? ` · ${parsed.person}` : ""}${parsed.isCash ? " · cash" : ""}${res.matchedTo ? " · linked to the bank entry" : ""}.`;
  return { id: res.id, parsed, category: cat ?? null, matched: Boolean(res.matchedTo), message };
}
