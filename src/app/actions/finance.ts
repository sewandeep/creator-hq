"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { todayIST } from "@/lib/format";
import { FormError, bool, date, money, oneOf, requiredText, text, toActionError, type ActionState } from "@/lib/forms";
import { addEntry, applyCategory, logChange, quickAddCore, type SetCategoryInput, type SetCategoryResult } from "@/lib/finance/entries";
import { linkTxnToInvoice } from "@/lib/income-link";
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
export type { SetCategoryResult };

export async function setCategory(input: SetCategoryInput): Promise<SetCategoryResult> {
  const { supabase } = await requireUser();
  const r = await applyCategory(supabase, input);
  if (r.ok) return { ...r, ...(await refreshAll()) };
  return r;
}

/** Keep the AI's guess and take it off the review list. */
export async function acceptGuess(transactionId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("transactions").update({ needs_review: false, review_reason: null }).eq("id", transactionId);
  if (error) throw new Error(error.message);
  await logChange(supabase, transactionId, "reviewed", null, "kept the suggested category", "user");
  return refreshAll();
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
    const r = await quickAddCore(supabase, requiredText(fd, "text", "Entry"), "manual", text(fd, "category_id"));
    const { groupId } = await refreshAll();
    return { ok: true, message: r.message, groupId };
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
  await linkTxnToInvoice(supabase, transactionId, invoiceId);
  return refreshAll();
}

export async function dismissInvoiceSuggestion(transactionId: string) {
  const { supabase } = await requireUser();
  await supabase.from("transactions").update({ suggested_invoice_id: null }).eq("id", transactionId);
  return refreshAll();
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

/** The "+ Add" sheet: one entry, any direction, with Undo. */
export async function addEntryQuick(input: {
  amount: number;
  direction: "debit" | "credit";
  description: string;
  date: string;
  categoryId: string | null;
  person: string | null;
  note: string | null;
  isCash: boolean;
}): Promise<{ error?: string; groupId?: string; message?: string }> {
  const { supabase } = await requireUser();
  if (!(input.amount > 0)) return { error: "Enter an amount." };
  if (!input.description.trim()) return { error: "Say what it was." };
  try {
    const r = await addEntry(supabase, {
      amount: input.amount,
      direction: input.direction,
      description: input.description.trim().slice(0, 300),
      date: /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : todayIST(),
      isCash: input.isCash,
      person: input.person?.trim() || null,
      categoryId: input.categoryId,
      note: input.note?.trim() || null,
      source: "manual",
    });
    const { groupId } = await refreshAll();
    return { groupId, message: r.matchedTo ? `Added — matched to the bank line “${r.matchedTo.description.slice(0, 40)}”.` : "Added." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't add it." };
  }
}

/**
 * "Fix balance" on the Lending page: you say what's actually true today, and
 * an opening-balance entry (dated before their first entry) makes it add up.
 * Positive = they owe you; negative = you owe them.
 */
export async function setLendingBalance(person: string, actual: number): Promise<{ error?: string; groupId?: string; message?: string }> {
  const { supabase } = await requireUser();
  const name = person.trim();
  if (!name || !Number.isFinite(actual)) return { error: "Enter an amount." };
  const categories = await ensureLendingCategories(supabase);
  const ids = categories.map((c) => c.id);
  const { data } = await supabase.from("transactions").select("txn_date, amount, direction, source, matched_txn_id").in("category_id", ids).ilike("person", name);
  const rows = (data ?? []).filter((t) => !(t.source !== "statement" && t.matched_txn_id));
  const current = rows.reduce((s, t) => s + (t.direction === "debit" ? Number(t.amount) : -Number(t.amount)), 0);
  const diff = Math.round((actual - current) * 100) / 100;
  if (Math.abs(diff) < 0.5) return { message: "Already right." };
  const first = rows.map((t) => t.txn_date).sort()[0] ?? todayIST();
  const cat = categories.find((c) => c.name === (diff > 0 ? "Lent money" : "Borrowed"));
  try {
    await addEntry(supabase, {
      amount: Math.abs(diff),
      direction: diff > 0 ? "debit" : "credit",
      description: `Opening balance with ${name} (before these records)`,
      date: addDaysIso(first, -1),
      isCash: true,
      person: name,
      categoryId: cat?.id ?? null,
      note: "Balance set by you",
      source: "manual",
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't save." };
  }
  const { groupId } = await refreshAll();
  return { groupId, message: actual === 0 ? `${name}: settled.` : actual > 0 ? `${name} owes you ${actual}.` : `You owe ${name} ${-actual}.` };
}

async function ensureLendingCategories(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"]) {
  const { ensureCategories } = await import("@/lib/finance/categories-server");
  return (await ensureCategories(supabase)).filter((c) => c.kind === "lending");
}

function addDaysIso(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
