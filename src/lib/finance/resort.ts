import "server-only";
import type { DB } from "@/app/actions/helpers";
import type { JobCtx } from "@/lib/jobs";
import { autoCategorize, type CatRow } from "./auto-categorize";
import { fitsDirection } from "./categories";
import { ensureCategories } from "./categories-server";
import { findRule, loadRules, matchText } from "./categorize";

const REVIEW_BELOW = 0.75;

/**
 * Re-sorts every bank transaction you haven't set yourself, with everything the
 * app knows now: your rules, its memory of each payee, clear patterns, and the
 * AI once for payees it hasn't seen. Anything still unclear is flagged for you.
 */
export async function resortTransactions(db: DB, userId: string, job: JobCtx) {
  const categories = await ensureCategories(db);
  const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  const rules = await loadRules(db);
  const { data: owner } = await db.from("profile").select("legal_name, display_name").eq("user_id", userId).maybeSingle();

  await job.step("Loading your transactions");
  type Row = { id: string; direction: "debit" | "credit"; amount: number; description: string; counterparty: string | null; upi_id: string | null; note: string | null; person: string | null; category_id: string | null; category_source: string; needs_review: boolean };
  const all: Row[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await db
      .from("transactions")
      .select("id, direction, amount, description, counterparty, upi_id, note, person, category_id, category_source, needs_review")
      .eq("user_id", userId)
      .eq("source", "statement")
      .neq("category_source", "user")
      .is("pair_id", null)
      .is("payment_id", null)
      .order("txn_date")
      .range(start, start + 999);
    if (error) throw new Error(error.message);
    all.push(...((data ?? []) as Row[]).map((r) => ({ ...r, amount: Number(r.amount) })));
    if (!data || data.length < 1000) break;
  }
  await job.step(`Re-sorting ${all.length} transactions you haven't set yourself`);

  // Rules first (they're your explicit choices), then the rest.
  const ruled = new Map<string, { categoryId: string; pattern: string }>();
  for (const r of all) {
    const rule = findRule(rules, matchText(r), r.direction);
    if (rule) ruled.set(r.id, { categoryId: rule.category_id, pattern: rule.pattern });
  }
  const rest = all.filter((r) => !ruled.has(r.id));
  const catRows: (CatRow & { id: string })[] = rest.map((r) => ({ id: r.id, description: r.description, counterparty: r.counterparty, upi_id: r.upi_id, note: r.note, direction: r.direction, amount: r.amount, category: "Uncategorized", confidence: 0, why: "" }));
  const stats = await autoCategorize(db, catRows, { categories, rules, useAi: true, ownerName: [owner?.legal_name, owner?.display_name].filter(Boolean).join(","), step: job.step });
  await job.checkpoint();

  await job.step("Saving");
  let changed = 0;
  let flagged = 0;
  const byId = new Map(all.map((r) => [r.id, r]));
  const save = async (r: Row, next: { category_id: string | null; category_source: "rule" | "ai" | "none"; category_reason: string; needs_review: boolean; review_reason: string | null }) => {
    if (next.needs_review) flagged++;
    if (r.category_id === next.category_id && r.needs_review === next.needs_review) return;
    await db.from("transactions").update(next).eq("id", r.id);
    changed++;
  };
  for (const [id, m] of ruled) {
    const r = byId.get(id)!;
    const cat = categories.find((c) => c.id === m.categoryId);
    const needsPerson = cat?.kind === "lending" && !r.person;
    await save(r, { category_id: m.categoryId, category_source: "rule", category_reason: `Your rule: anything containing "${m.pattern}"`, needs_review: needsPerson, review_reason: needsPerson ? "Who was this with?" : null });
  }
  for (const c of catRows) {
    const r = byId.get(c.id)!;
    const found = byName.get(c.category.toLowerCase());
    const cat = found && fitsDirection(found, r.direction) ? found : undefined;
    const unsure = !cat || c.confidence < REVIEW_BELOW;
    const needsPerson = cat?.kind === "lending" && !r.person;
    await save(r, {
      category_id: cat?.id ?? null,
      category_source: cat ? (c.source === "ai" ? "ai" : "rule") : "none",
      category_reason: (cat ? (c.source === "memory" ? `Remembered: ${c.why}` : c.source === "ai" ? `AI guess (${Math.round(c.confidence * 100)}% sure): ${c.why}` : c.why) : `Not sure: ${c.why || "no clue from the bank text"}`).slice(0, 300),
      needs_review: unsure || needsPerson,
      review_reason: needsPerson ? "Who was this with?" : unsure ? (cat ? `Probably ${cat.name} — right?` : "What was this for?") : null,
    });
  }
  const summary = `Re-sorted ${all.length}: ${stats.rule + ruled.size} by your rules, ${stats.memory} from memory, ${stats.pattern} by clear patterns, ${stats.ai} by AI · ${flagged} left for you to sort · ${changed} changed`;
  await job.step(summary);
  return { summary, result: { total: all.length, changed, flagged } };
}
