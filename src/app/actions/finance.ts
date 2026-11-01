"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { rupees, todayIST } from "@/lib/format";
import { FormError, bool, date, money, oneOf, requiredText, text, toActionError, type ActionState } from "@/lib/forms";
import { matchText, suggestPattern } from "@/lib/finance/categorize";
import { addEntry, logChange } from "@/lib/finance/entries";
import { ensureCategories } from "@/lib/finance/categories-server";
import { parseQuickEntry } from "@/lib/finance/quick-add";
import { round2 } from "@/lib/money";
import { refreshAll } from "./helpers";

const BANKS = ["kotak", "sbi", "hdfc", "icici", "axis", "other"] as const;

// ---------------------------------------------------------------------------
// Bank accounts
// ---------------------------------------------------------------------------
export async function saveAccount(id: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  try {
    const row: { name: string; bank: (typeof BANKS)[number]; last4: string | null; pdf_password?: string | null } = {
      name: requiredText(fd, "name", "Account name"),
      bank: oneOf(fd, "bank", BANKS) ?? "other",
      last4: text(fd, "last4")?.replace(/\D/g, "").slice(-4) || null,
    };
    const pw = fd.get("pdf_password");
    if (typeof pw === "string" && (pw !== "" || bool(fd, "clear_password"))) row.pdf_password = pw || null;
    const { error } = id ? await supabase.from("bank_accounts").update(row).eq("id", id) : await supabase.from("bank_accounts").insert(row);
    if (error) throw error;
  } catch (e) {
    return toActionError(e);
  }
  refreshAll();
  return { ok: true, message: "Saved." };
}

export async function deleteAccount(id: string) {
  const { supabase, userId } = await requireUser();
  const { data: files } = await supabase.from("statements").select("file_path").eq("account_id", id);
  if (files?.length) await supabase.storage.from("statements").remove(files.map((f) => f.file_path).filter((p) => p.startsWith(`${userId}/`)));
  const { error } = await supabase.from("bank_accounts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refreshAll();
}

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------
/** Called after the browser uploads the PDF to storage. */
export async function createStatement(input: { accountId: string; path: string; fileName: string }): Promise<{ id?: string; error?: string }> {
  const { supabase, userId } = await requireUser();
  if (!input.path.startsWith(`${userId}/`)) return { error: "Invalid upload." };
  const { data, error } = await supabase
    .from("statements")
    .insert({ account_id: input.accountId, file_path: input.path, file_name: input.fileName.slice(0, 200) })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: data.id };
}

export async function deleteStatement(id: string) {
  const { supabase, userId } = await requireUser();
  const { data: st } = await supabase.from("statements").select("file_path").eq("id", id).single();
  // Its transactions go with it (and any of your typed entries matched to them become unmatched again).
  const { error } = await supabase.from("statements").delete().eq("id", id);
  if (error) throw new Error(error.message);
  if (st?.file_path.startsWith(`${userId}/`)) await supabase.storage.from("statements").remove([st.file_path]);
  refreshAll();
}

// ---------------------------------------------------------------------------
// Categorising
// ---------------------------------------------------------------------------
export type SetCategoryResult = { ok?: boolean; error?: string; alsoUpdated?: number };

/**
 * Set a transaction's category. With `remember`, also creates a rule
 * ("always put <payee> under <category>") and applies it to every other
 * matching transaction you haven't set by hand.
 */
export async function setCategory(input: {
  transactionId: string;
  categoryId: string | null;
  remember?: boolean;
  pattern?: string;
  note?: string | null;
  person?: string | null;
}): Promise<SetCategoryResult> {
  const { supabase } = await requireUser();
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
  refreshAll();
  return { ok: true, alsoUpdated };
}

/** Keep the AI's guess and take it off the review list. */
export async function acceptGuess(transactionId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("transactions").update({ needs_review: false, review_reason: null }).eq("id", transactionId);
  if (error) throw new Error(error.message);
  await logChange(supabase, transactionId, "reviewed", null, "kept the suggested category", "user");
  refreshAll();
}

export async function saveTxnDetails(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  try {
    const { data: t, error } = await supabase.from("transactions").select("source, note, person, txn_date, amount, description").eq("id", id).single();
    if (error) throw error;
    const update: { note: string | null; person: string | null; txn_date?: string; amount?: number; description?: string } = {
      note: text(fd, "note"),
      person: text(fd, "person"),
    };
    if (t.source !== "statement") {
      update.txn_date = date(fd, "txn_date") ?? t.txn_date;
      const amt = money(fd, "amount");
      if (!amt) throw new FormError("Amount must be more than 0.");
      update.amount = amt;
      update.description = text(fd, "description") ?? t.description;
    }
    const { error: upError } = await supabase.from("transactions").update(update).eq("id", id);
    if (upError) throw upError;
    await logChange(supabase, id, "note", t.note, update.note, "user");
    await logChange(supabase, id, "person", t.person, update.person, "user");
    if (update.amount !== undefined) await logChange(supabase, id, "amount", String(t.amount), String(update.amount), "user");
    if (update.txn_date !== undefined) await logChange(supabase, id, "date", t.txn_date, update.txn_date, "user");
  } catch (e) {
    return toActionError(e);
  }
  refreshAll();
  return { ok: true, message: "Saved." };
}

// ---------------------------------------------------------------------------
// Your own entries ("450 cab")
// ---------------------------------------------------------------------------
export type AddEntryResult = { ok?: boolean; error?: string; message?: string };

export async function quickAdd(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  try {
    const raw = requiredText(fd, "text", "Entry");
    const parsed = parseQuickEntry(raw, todayIST());
    if (!parsed) throw new FormError('Couldn\'t find an amount. Try "450 cab" or "lent 2000 to rahul".');
    const categories = await ensureCategories(supabase);
    const chosen = text(fd, "category_id");
    const hint = parsed.categoryHint ? categories.find((c) => c.name === parsed.categoryHint)?.id ?? null : null;
    // Your rules apply to typed entries too.
    const { data: rules } = await supabase.from("category_rules").select("pattern, direction, category_id");
    const rule = (rules ?? []).sort((a, b) => b.pattern.length - a.pattern.length).find((r) => (!r.direction || r.direction === parsed.direction) && raw.toLowerCase().includes(r.pattern.toLowerCase()));
    const res = await addEntry(supabase, {
      ...parsed,
      categoryId: chosen ?? rule?.category_id ?? hint,
      source: "manual",
    });
    const cat = categories.find((c) => c.id === (chosen ?? rule?.category_id ?? hint));
    refreshAll();
    return {
      ok: true,
      message: `Added ${rupees(parsed.amount)} ${parsed.direction === "debit" ? "spent" : "received"}${cat ? ` · ${cat.emoji ?? ""} ${cat.name}` : " · needs a category"}${parsed.person ? ` · ${parsed.person}` : ""}${parsed.isCash ? " · cash" : ""}${res.matchedTo ? " · linked to the bank entry" : ""}.`,
    };
  } catch (e) {
    return toActionError(e);
  }
}

export async function addEntryForm(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  try {
    const amount = money(fd, "amount");
    if (!amount) throw new FormError("Enter an amount.");
    await addEntry(supabase, {
      amount,
      direction: oneOf(fd, "direction", ["debit", "credit"] as const) ?? "debit",
      description: requiredText(fd, "description", "What was it"),
      date: date(fd, "txn_date") ?? todayIST(),
      isCash: bool(fd, "is_cash"),
      person: text(fd, "person"),
      categoryId: text(fd, "category_id"),
      note: text(fd, "note"),
      source: "manual",
    });
  } catch (e) {
    return toActionError(e);
  }
  refreshAll();
  return { ok: true, message: "Added." };
}

export async function deleteEntry(id: string) {
  const { supabase } = await requireUser();
  const { data: t } = await supabase.from("transactions").select("source").eq("id", id).single();
  if (t?.source === "statement") throw new Error("Bank transactions can't be deleted one by one — delete the statement instead.");
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refreshAll();
  redirect("/money/transactions");
}

export async function unlinkEntry(manualId: string) {
  const { supabase } = await requireUser();
  await supabase.from("transactions").update({ matched_txn_id: null }).eq("id", manualId);
  refreshAll();
}

// ---------------------------------------------------------------------------
// Bank credit → creator payment
// ---------------------------------------------------------------------------
export async function recordAsInvoicePayment(transactionId: string, invoiceId: string) {
  const { supabase } = await requireUser();
  const { data: t } = await supabase.from("transactions").select("id, amount, txn_date, reference, category_id, payment_id").eq("id", transactionId).single();
  const { data: inv } = await supabase.from("invoices").select("id, brand_id, deal_id, subtotal, tds_rate, tds_section, payments(gross_amount)").eq("id", invoiceId).single();
  if (!t || !inv) throw new Error("Not found.");
  if (t.payment_id) throw new Error("This is already recorded as a payment.");
  const balance = round2(Number(inv.subtotal) - inv.payments.reduce((s, p) => s + Number(p.gross_amount), 0));
  const net = Number(t.amount);
  const expectedNet = round2(balance - (balance * Number(inv.tds_rate ?? 0)) / 100);
  // If what arrived equals "balance minus TDS", the rest is TDS. Otherwise treat it as a plain part-payment.
  const tds = Math.abs(net - expectedNet) <= 1 ? round2(balance - net) : 0;

  const { data: pay, error } = await supabase
    .from("payments")
    .insert({ brand_id: inv.brand_id, invoice_id: inv.id, deal_id: inv.deal_id, received_date: t.txn_date, gross_amount: round2(net + tds), tds_amount: tds, tds_section: tds ? inv.tds_section : null, mode: "Bank transfer", reference: t.reference, notes: "Recorded from bank statement" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const categories = await ensureCategories(supabase);
  const income = categories.find((c) => c.name === "Creator income");
  await supabase
    .from("transactions")
    .update({ payment_id: pay.id, suggested_invoice_id: null, needs_review: false, review_reason: null, category_id: income?.id ?? t.category_id, category_source: "user", category_reason: "Linked to an invoice payment" })
    .eq("id", t.id);
  await logChange(supabase, t.id, "linked", null, "recorded as invoice payment", "user");
  await supabase.from("activities").insert({ deal_id: inv.deal_id, brand_id: inv.brand_id, kind: "payment", body: `Payment received: ${rupees(net)} in bank${tds ? ` (+ ${rupees(tds)} TDS)` : ""} — from bank statement` });

  const { data: after } = await supabase.from("invoices").select("status, deal_id").eq("id", inv.id).single();
  if (after?.status === "paid") {
    // Other bank lines that pointed at this invoice no longer can be its payment.
    await supabase
      .from("transactions")
      .update({ suggested_invoice_id: null, review_reason: "Looks like brand money — is this another payment, or something else?" })
      .eq("suggested_invoice_id", inv.id)
      .neq("id", t.id);
  }
  if (after?.status === "paid" && after.deal_id) await supabase.from("deals").update({ stage: "paid", next_follow_up: null }).eq("id", after.deal_id).neq("stage", "paid");
  refreshAll();
}

export async function dismissInvoiceSuggestion(transactionId: string) {
  const { supabase } = await requireUser();
  await supabase.from("transactions").update({ suggested_invoice_id: null }).eq("id", transactionId);
  refreshAll();
}

// ---------------------------------------------------------------------------
// Categories & rules
// ---------------------------------------------------------------------------
export async function saveCategory(id: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  try {
    const row = {
      name: requiredText(fd, "name", "Name"),
      kind: oneOf(fd, "kind", ["expense", "income", "transfer", "savings", "lending"] as const) ?? "expense",
      emoji: text(fd, "emoji"),
      is_business: bool(fd, "is_business"),
    };
    const { error } = id ? await supabase.from("categories").update(row).eq("id", id) : await supabase.from("categories").insert({ ...row, position: 999 });
    if (error) {
      if (error.message.includes("categories_user_name_key")) throw new FormError("You already have a category with that name.");
      throw error;
    }
  } catch (e) {
    return toActionError(e);
  }
  refreshAll();
  return { ok: true, message: "Saved." };
}

export async function deleteCategory(id: string) {
  const { supabase } = await requireUser();
  // Transactions in it become uncategorised and go back to the review list.
  await supabase.from("transactions").update({ needs_review: true, review_reason: "Its category was deleted." }).eq("category_id", id);
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refreshAll();
}

export async function deleteRule(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("category_rules").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refreshAll();
}
