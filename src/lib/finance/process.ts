import "server-only";
import type { DB } from "@/app/actions/helpers";
import { rupees } from "@/lib/format";
import { findInvoiceMatch, findManualMatch, findRule, loadOpenInvoices, loadRules, loadUnmatchedManual, matchReason, matchText } from "./categorize";
import { ensureCategories } from "./categories-server";
import { checkBalances } from "./checks";
import { extractWithAi, type AiRow } from "./extract";
import { AiError } from "./gemini";
import { PdfPasswordError, extractPdfPages } from "./pdf-text";

export type ProcessResult = {
  status: "done" | "needs_password" | "failed";
  message: string;
  added?: number;
  duplicates?: number;
  review?: number;
  balanceOk?: boolean;
  issues?: string[];
};

const REVIEW_BELOW = 0.75;

function validDate(s: string | null | undefined) {
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return s;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Reads one uploaded statement end-to-end and saves its transactions.
 * Safe to run again: rows already saved (e.g. overlapping statements) are skipped.
 */
export async function processStatement(supabase: DB, statementId: string, passwordOverride?: string): Promise<ProcessResult> {
  const { data: st, error } = await supabase
    .from("statements")
    .select("*, account:bank_accounts(id, name, pdf_password)")
    .eq("id", statementId)
    .single();
  if (error || !st) return { status: "failed", message: "Statement not found." };

  const fail = async (status: "failed" | "needs_password", message: string): Promise<ProcessResult> => {
    await supabase.from("statements").update({ status, error: message, processed_at: new Date().toISOString() }).eq("id", statementId);
    return { status, message };
  };

  await supabase.from("statements").update({ status: "processing", error: null }).eq("id", statementId);

  // 1. Get the PDF and read its text.
  const { data: blob, error: dlError } = await supabase.storage.from("statements").download(st.file_path);
  if (dlError || !blob) return fail("failed", `Couldn't open the uploaded file: ${dlError?.message ?? "missing"}`);
  const bytes = new Uint8Array(await blob.arrayBuffer());

  const password = passwordOverride ?? st.account?.pdf_password ?? undefined;
  let pages: string[];
  try {
    pages = await extractPdfPages(bytes, password);
  } catch (e) {
    if (e instanceof PdfPasswordError) {
      return fail("needs_password", e.wrongPassword ? "The saved PDF password didn't work. Enter the right one." : "This PDF needs a password.");
    }
    return fail("failed", `Couldn't read this PDF: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (passwordOverride && passwordOverride !== st.account?.pdf_password) {
    // It worked — remember it for next month.
    await supabase.from("bank_accounts").update({ pdf_password: passwordOverride }).eq("id", st.account_id);
  }

  // 2. Ask the AI to pull out the rows.
  const categories = await ensureCategories(supabase);
  const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  const textLength = pages.join("").replace(/\s/g, "").length;
  let ex;
  try {
    ex =
      textLength > 200
        ? await extractWithAi({ pages }, categories.map((c) => c.name))
        : password
          ? null
          : await extractWithAi({ pdfBase64: Buffer.from(bytes).toString("base64") }, categories.map((c) => c.name));
  } catch (e) {
    return fail("failed", e instanceof AiError ? e.message : `AI error: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!ex) return fail("failed", "This looks like a scanned (image) PDF with a password. Download the statement again as a normal PDF from net banking.");

  // 3. Clean up rows.
  type Row = AiRow & { idx: number; amount: number; direction: "debit" | "credit"; dateIso: string };
  const rows: Row[] = [];
  ex.rows.forEach((r, idx) => {
    const debit = Math.abs(Number(r.debit) || 0);
    const credit = Math.abs(Number(r.credit) || 0);
    const dateIso = validDate(r.date);
    if (!dateIso || (!debit && !credit)) return;
    rows.push({
      ...r,
      idx,
      dateIso,
      amount: Math.round((debit || credit) * 100) / 100,
      direction: debit ? "debit" : "credit",
      balance: r.balance === null || r.balance === undefined || Number.isNaN(Number(r.balance)) ? null : Number(r.balance),
    });
  });
  if (!rows.length) return fail("failed", "No transactions found in this PDF. Is it a bank statement?");

  // 4. Balance check (also fixes any debit/credit mix-ups).
  const opening = ex.opening_balance === null ? null : Number(ex.opening_balance);
  const closing = ex.closing_balance === null ? null : Number(ex.closing_balance);
  const check = checkBalances(rows, opening, closing);
  const breakSet = new Set(check.breaks);
  const flippedSet = new Set(check.flipped);

  // 5. Skip rows already saved, then categorise.
  const occurrences = new Map<string, number>();
  const keyed = rows.map((r) => {
    const base = `${st.account_id}|${r.dateIso}|${r.direction}|${r.amount.toFixed(2)}|${r.balance ?? ""}|${norm(r.description).slice(0, 60)}`;
    const n = (occurrences.get(base) ?? 0) + 1;
    occurrences.set(base, n);
    return { r, key: r.balance === null ? `${base}#${n}` : base };
  });
  const { data: existing } = await supabase.from("transactions").select("dedupe_key").in("dedupe_key", keyed.map((k) => k.key));
  const existingKeys = new Set((existing ?? []).map((e) => e.dedupe_key));
  const fresh = keyed.filter((k) => !existingKeys.has(k.key));

  const dates = rows.map((r) => r.dateIso).sort();
  const rules = await loadRules(supabase);
  const manual = await loadUnmatchedManual(supabase, dates[0], dates[dates.length - 1]);
  const invoices = await loadOpenInvoices(supabase);
  const taken = new Set<string>();
  const ruleHits = new Map<string, number>();
  const matchedPairs: { manualId: string; bankKey: string }[] = [];

  const toInsert = fresh.map(({ r, key }) => {
    const text = matchText({ counterparty: r.counterparty, upi_id: r.upi_id, description: r.description });
    let category_id: string | null = null;
    let category_source: "ai" | "rule" | "match" | "none" = "none";
    let category_reason = "";
    let needs_review = false;
    let review_reason: string | null = null;
    let note: string | null = null;
    let person: string | null = null;
    let suggested_invoice_id: string | null = null;

    const m = findManualMatch(manual, { txn_date: r.dateIso, amount: r.amount, direction: r.direction }, taken);
    const rule = findRule(rules, text, r.direction);
    if (m) {
      taken.add(m.id);
      matchedPairs.push({ manualId: m.id, bankKey: key });
      category_id = m.category_id;
      category_source = "match";
      category_reason = matchReason(m);
      note = m.note ?? m.description;
      person = m.person;
      needs_review = !m.category_id;
      if (needs_review) review_reason = "Matched your entry, but it has no category yet.";
    } else if (rule) {
      category_id = rule.category_id;
      category_source = "rule";
      category_reason = `Your rule: anything containing "${rule.pattern}"`;
      ruleHits.set(rule.id, (ruleHits.get(rule.id) ?? 0) + 1);
    } else {
      const cat = catByName.get(r.category.toLowerCase());
      category_id = cat?.id ?? null;
      category_source = cat ? "ai" : "none";
      const pct = Math.round(Math.max(0, Math.min(1, Number(r.confidence) || 0)) * 100);
      category_reason = cat ? `AI guess (${pct}% sure): ${r.why}` : `AI wasn't sure: ${r.why}`;
      if (!cat || pct < REVIEW_BELOW * 100) {
        needs_review = true;
        review_reason = cat ? `Not sure this is ${cat.name}.` : "What was this for?";
      }
      if (cat?.kind === "lending") {
        needs_review = true;
        review_reason = "Who was this with?";
      }
    }

    if (r.direction === "credit") {
      const inv = findInvoiceMatch(invoices, { amount: r.amount, text });
      if (inv) {
        suggested_invoice_id = inv.id;
        if (category_source !== "match") {
          category_id = catByName.get("creator income")?.id ?? category_id;
          category_source = category_source === "rule" ? "rule" : "ai";
          category_reason = `Looks like payment for invoice ${inv.invoice_number} (${inv.brand}, ${rupees(inv.balance)} due)`;
        }
        needs_review = true;
        review_reason = `Is this the payment for invoice ${inv.invoice_number}?`;
      }
    }
    if (breakSet.has(r.idx)) {
      needs_review = true;
      review_reason = "The balance doesn't add up at this row — please check the amount against your statement.";
    }
    if (flippedSet.has(r.idx)) category_reason += " · Debit/credit corrected from the running balance.";

    return {
      account_id: st.account_id,
      statement_id: statementId,
      source: "statement" as const,
      txn_date: r.dateIso,
      seq: r.idx,
      description: r.description.slice(0, 500),
      amount: r.amount,
      direction: r.direction,
      balance: r.balance,
      reference: r.reference?.slice(0, 100) ?? null,
      counterparty: r.counterparty?.slice(0, 120) ?? null,
      upi_id: r.upi_id?.slice(0, 120) ?? null,
      category_id,
      category_source,
      category_reason: category_reason.slice(0, 300),
      confidence: category_source === "ai" ? Math.max(0, Math.min(1, Number(r.confidence) || 0)) : null,
      needs_review,
      review_reason,
      note,
      person,
      suggested_invoice_id,
      dedupe_key: key,
    };
  });

  // 6. Save.
  let inserted: { id: string; dedupe_key: string | null; category_id: string | null; category_source: string; category_reason: string | null }[] = [];
  for (let i = 0; i < toInsert.length; i += 200) {
    const { data, error: insError } = await supabase
      .from("transactions")
      .insert(toInsert.slice(i, i + 200))
      .select("id, dedupe_key, category_id, category_source, category_reason");
    if (insError) return fail("failed", `Couldn't save transactions: ${insError.message}`);
    inserted = inserted.concat(data ?? []);
  }

  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const changes = inserted
    .filter((t) => t.category_id)
    .map((t) => ({ transaction_id: t.id, field: "category", old_value: null, new_value: catName.get(t.category_id!) ?? null, source: t.category_source }));
  for (let i = 0; i < changes.length; i += 500) await supabase.from("transaction_changes").insert(changes.slice(i, i + 500));

  const idByKey = new Map(inserted.map((t) => [t.dedupe_key, t.id]));
  for (const p of matchedPairs) {
    const bankId = idByKey.get(p.bankKey);
    if (bankId) await supabase.from("transactions").update({ matched_txn_id: bankId }).eq("id", p.manualId);
  }
  for (const [id, n] of ruleHits) {
    const rule = rules.find((r) => r.id === id);
    if (rule) await supabase.from("category_rules").update({ hits: rule.hits + n }).eq("id", id);
  }

  const issues: string[] = [];
  if (check.totalsOk === false)
    issues.push(`Totals don't match: opening ${rupees(opening)} + money in ${rupees(check.totals.credits)} − money out ${rupees(check.totals.debits)} should equal closing ${rupees(closing)}. A row may be missing or misread.`);
  if (check.breaks.length) issues.push(`${check.breaks.length} row${check.breaks.length === 1 ? "" : "s"} where the running balance doesn't add up (marked for review).`);
  if (check.flipped.length) issues.push(`${check.flipped.length} row${check.flipped.length === 1 ? "" : "s"} had debit/credit swapped — fixed automatically using the balance.`);
  if (check.totalsOk === null && !check.checked) issues.push("This statement has no running balance or totals, so the amounts couldn't be double-checked.");

  const balanceOk = check.breaks.length === 0 && check.totalsOk !== false && (check.totalsOk === true || check.checked > 0);
  const review = toInsert.filter((t) => t.needs_review).length;
  await supabase
    .from("statements")
    .update({
      status: "done",
      error: null,
      period_from: validDate(ex.period_from) ?? dates[0],
      period_to: validDate(ex.period_to) ?? dates[dates.length - 1],
      opening_balance: opening,
      closing_balance: closing,
      rows_found: rows.length,
      rows_added: inserted.length,
      rows_duplicate: rows.length - toInsert.length,
      balance_ok: balanceOk,
      issues,
      model: ex.model,
      processed_at: new Date().toISOString(),
    })
    .eq("id", statementId);
  if (ex.account_last4) await supabase.from("bank_accounts").update({ last4: ex.account_last4.slice(-4) }).eq("id", st.account_id).is("last4", null);

  return {
    status: "done",
    message: `Read ${rows.length} transactions.`,
    added: inserted.length,
    duplicates: rows.length - toInsert.length,
    review,
    balanceOk,
    issues,
  };
}
