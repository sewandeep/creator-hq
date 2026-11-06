import "server-only";
import { findOrCreateAgency, findOrCreateBrand, startingTdsRate, type DB } from "@/app/actions/helpers";
import { STAGE_IDS, type StageId } from "@/lib/constants";
import { ensureCategories } from "@/lib/finance/categories-server";
import { addEntry, applyCategory } from "@/lib/finance/entries";
import { processStatement } from "@/lib/finance/process";
import { rupees } from "@/lib/format";
import { buildRows, IMPORT_FIELDS, type ColumnMapping } from "@/lib/import";
import { importRowsCore } from "@/lib/import-server";
import { createDraftInvoiceFromDeal } from "@/lib/invoice-draft";
import type { JobCtx } from "@/lib/jobs";
import type { Json } from "@/lib/supabase/database.types";

export type ApplyResult = { ok: boolean; message: string; link?: string; needsPassword?: boolean };

type P = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Carries out an action the assistant prepared — only ever called when you
 * tap Confirm. `edits` are fields you changed on the card before confirming.
 */
export async function applyProposal(db: DB, userId: string, proposalId: string, opts: { edits?: P; password?: string; job?: JobCtx } = {}): Promise<ApplyResult> {
  const { data: prop } = await db.from("ai_proposals").select("*").eq("id", proposalId).eq("user_id", userId).maybeSingle();
  if (!prop) return { ok: false, message: "That action wasn't found." };
  if (prop.status === "applied") return { ok: true, message: "Already done." };
  if (prop.status === "cancelled") return { ok: false, message: "That action was cancelled." };

  const payload = { ...(prop.payload as P), ...(opts.edits ?? {}) };
  let result: ApplyResult;
  try {
    result = await run(db, userId, prop.kind, payload, opts.password, opts.job);
  } catch (e) {
    result = { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
  if (result.needsPassword) return result; // stays pending until the password works
  await db
    .from("ai_proposals")
    .update({ status: result.ok ? "applied" : "failed", result: result as unknown as NonNullable<Json>, payload: payload as unknown as NonNullable<Json>, applied_at: new Date().toISOString() })
    .eq("id", proposalId);
  return result;
}

export async function cancelProposal(db: DB, userId: string, proposalId: string) {
  await db.from("ai_proposals").update({ status: "cancelled" }).eq("id", proposalId).eq("user_id", userId).eq("status", "pending");
}

async function run(db: DB, userId: string, kind: string, p: P, password?: string, job?: JobCtx): Promise<ApplyResult> {
  switch (kind) {
    case "new_deal": {
      const brandId = await findOrCreateBrand(db, s(p.brand)!);
      const agency = s(p.agency) ? await findOrCreateAgency(db, s(p.agency)!) : null;
      const tdsRate = await startingTdsRate(db, brandId, agency);
      let contactId: string | null = null;
      if (s(p.contact_name) || s(p.contact_email)) {
        const { data: c } = await db.from("contacts").insert({ brand_id: brandId, name: s(p.contact_name) ?? s(p.contact_email)!, email: s(p.contact_email) }).select("id").single();
        contactId = c?.id ?? null;
      }
      const stage = (STAGE_IDS as string[]).includes(s(p.stage) ?? "") ? (s(p.stage) as StageId) : "lead";
      const { data: deal, error } = await db
        .from("deals")
        .insert({
          brand_id: brandId,
          agency_id: agency?.id ?? null,
          tds_rate: tdsRate,
          contact_id: contactId,
          title: s(p.title)!,
          stage,
          amount: n(p.amount),
          is_barter: p.is_barter === true,
          platform: s(p.platform),
          deal_date: s(p.deal_date) ?? undefined,
          due_date: s(p.due_date),
          next_follow_up: s(p.next_follow_up),
          notes: s(p.notes),
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      const dels = Array.isArray(p.deliverables) ? (p.deliverables as P[]) : [];
      if (dels.length) {
        await db.from("deliverables").insert(dels.map((d) => ({ deal_id: deal.id, type: s(d.type) ?? "Other", quantity: Math.max(1, Number(d.quantity) || 1), due_date: s(d.due_date), platform: s(p.platform) })));
      }
      await db.from("activities").insert({ deal_id: deal.id, brand_id: brandId, kind: "system", body: "Deal created by AI assistant (you confirmed)" });
      return { ok: true, message: `Deal created: ${s(p.brand)} — ${s(p.title)}.`, link: `/deals/${deal.id}` };
    }

    case "deal_update": {
      const id = s(p.deal_id)!;
      const update: { stage?: StageId; amount?: number; due_date?: string; next_follow_up?: string } = {};
      if (s(p.stage) && (STAGE_IDS as string[]).includes(s(p.stage)!)) update.stage = s(p.stage) as StageId;
      if (n(p.amount) !== null) update.amount = n(p.amount)!;
      if (s(p.due_date)) update.due_date = s(p.due_date)!;
      if (s(p.next_follow_up)) update.next_follow_up = s(p.next_follow_up)!;
      const { data: deal, error } = await db.from("deals").update(update).eq("id", id).select("id, brand_id, title").single();
      if (error) throw new Error(error.message);
      if (s(p.note)) await db.from("activities").insert({ deal_id: id, brand_id: deal.brand_id, kind: "note", body: `${s(p.note)} (via AI assistant)` });
      return { ok: true, message: `Updated ${deal.title}.`, link: `/deals/${id}` };
    }

    case "entries": {
      const cats = await ensureCategories(db);
      const entries = Array.isArray(p.entries) ? (p.entries as P[]) : [];
      let matched = 0;
      for (const e of entries) {
        const cat = cats.find((c) => c.name === s(e.category));
        const r = await addEntry(db, {
          amount: Number(e.amount),
          direction: e.direction === "credit" ? "credit" : "debit",
          description: s(e.description) ?? "Entry",
          date: s(e.date)!,
          isCash: e.is_cash === true,
          person: s(e.person),
          categoryId: cat?.id ?? null,
          source: "manual",
        });
        if (r.matchedTo) matched++;
      }
      return { ok: true, message: `Added ${entries.length} entr${entries.length === 1 ? "y" : "ies"}${matched ? ` (${matched} linked to bank lines)` : ""}.`, link: "/money/transactions" };
    }

    case "recategorize": {
      const cats = await ensureCategories(db);
      const cat = cats.find((c) => c.name === s(p.category));
      if (!cat) throw new Error("Category not found.");
      const ids = (Array.isArray(p.transaction_ids) ? p.transaction_ids : []) as string[];
      let extra = 0;
      for (const [i, id] of ids.entries()) {
        const r = await applyCategory(db, {
          transactionId: id,
          categoryId: cat.id,
          person: s(p.person) ?? undefined,
          ...(i === 0 && s(p.remember_pattern) ? { remember: true, pattern: s(p.remember_pattern)! } : {}),
        });
        if (r.error) throw new Error(r.error);
        extra += r.alsoUpdated ?? 0;
      }
      return { ok: true, message: `Moved ${ids.length} to ${cat.name}${extra ? ` (+${extra} more by the new rule)` : ""}.`, link: "/money/transactions" };
    }

    case "invoice_draft": {
      const inv = await createDraftInvoiceFromDeal(db, s(p.deal_id)!);
      return { ok: true, message: `Draft invoice ${inv.invoice_number} created — check it, then email it from the invoice page.`, link: `/invoices/${inv.id}` };
    }

    case "statement_import": {
      const path = s(p.file_path)!;
      let statementId = s(p.statement_id);
      if (!statementId) {
        // Move the file from the assistant's inbox to statement storage.
        const { data: blob, error: dl } = await db.storage.from("inbox").download(path);
        if (dl || !blob) throw new Error("The uploaded file is no longer available — send it again.");
        const dest = `${userId}/${crypto.randomUUID()}.pdf`;
        const { error: up } = await db.storage.from("statements").upload(dest, new Uint8Array(await blob.arrayBuffer()), { contentType: "application/pdf" });
        if (up) throw new Error(up.message);
        const { data: st, error } = await db.from("statements").insert({ account_id: s(p.account_id)!, file_path: dest, file_name: s(p.file_name) ?? "statement.pdf" }).select("id").single();
        if (error) throw new Error(error.message);
        statementId = st.id;
      }
      const r = await processStatement(db, statementId, password, job);
      if (r.status === "needs_password") {
        // Remember the statement so a retry with the password doesn't upload it twice.
        await db.from("ai_proposals").update({ payload: { ...p, statement_id: statementId } as unknown as NonNullable<Json> }).eq("kind", "statement_import").eq("status", "pending").contains("payload", { file_path: path });
        return { ok: false, needsPassword: true, message: r.message };
      }
      if (r.status !== "done") throw new Error(r.message);
      return {
        ok: true,
        message: `${r.message} ${r.added} new${r.duplicates ? `, ${r.duplicates} already imported` : ""}. ${r.balanceOk ? "Balance check passed ✓" : "Balance check found problems — have a look."}${r.review ? ` ${r.review} need you to review.` : ""}`,
        link: r.review ? "/money/review" : "/money",
      };
    }

    case "tds_26as": {
      const fy = Number(p.fy);
      const entries = Array.isArray(p.entries) ? (p.entries as P[]) : [];
      const { data: brands } = await db.from("brands").select("id, name, legal_name, tan");
      const saved: string[] = [];
      const unmatched: string[] = [];
      for (const e of entries) {
        const tan = s(e.tan);
        const name = (s(e.deductor) ?? "").toLowerCase();
        const words = name.split(/\W+/).filter((w) => w.length > 3 && !["private", "limited", "india", "technologies", "services"].includes(w));
        const brand =
          (tan && brands?.find((b) => b.tan?.toUpperCase() === tan.toUpperCase())) ||
          brands?.find((b) => b.legal_name && b.legal_name.toLowerCase() === name) ||
          brands?.find((b) => name.includes(b.name.toLowerCase()) || words.some((w) => b.name.toLowerCase().includes(w) || (b.legal_name ?? "").toLowerCase().includes(w)));
        if (!brand) {
          unmatched.push(`${s(e.deductor)} (${rupees(Number(e.tds) || 0)})`);
          continue;
        }
        await db.from("tds_checks").upsert({ fy, brand_id: brand.id, tds_in_26as: Number(e.tds) || 0, amount_in_26as: n(e.amount), checked_on: new Date().toISOString().slice(0, 10), notes: "From 26AS via AI assistant" }, { onConflict: "user_id,fy,brand_id" });
        if (tan && !brand.tan) await db.from("brands").update({ tan }).eq("id", brand.id);
        saved.push(brand.name);
      }
      return { ok: true, message: `Saved 26AS figures for ${saved.length} brand${saved.length === 1 ? "" : "s"}${unmatched.length ? `. Not matched to any brand: ${unmatched.join("; ")} — add the brand (with its TAN) and try again` : ""}.`, link: `/tax?fy=${fy}` };
    }

    case "past_work": {
      const rows = Array.isArray(p.rows) ? (p.rows as P[]) : [];
      const fields = IMPORT_FIELDS.map((f) => f.id);
      const mapping = fields as unknown as ColumnMapping;
      const table = rows.map((r) => fields.map((f) => {
        const v = f === "date" ? r.date : f === "stage" ? r.status : r[f];
        return v === null || v === undefined ? "" : String(v);
      }));
      const r = await importRowsCore(db, buildRows(table, mapping));
      if (r.error) throw new Error(r.error);
      return { ok: true, message: `Imported ${r.deals} collaborations (${r.brands} new brands).`, link: "/history" };
    }

    case "attach_file": {
      const { data: blob, error: dl } = await db.storage.from("inbox").download(s(p.file_path)!);
      if (dl || !blob) throw new Error("The uploaded file is no longer available — send it again.");
      const name = s(p.file_name) ?? "file";
      const dest = `${userId}/${s(p.deal_id)}/${crypto.randomUUID()}-${name.replace(/[^\w.\- ]+/g, "_").slice(-100)}`;
      const { error: up } = await db.storage.from("deal-files").upload(dest, new Uint8Array(await blob.arrayBuffer()), { contentType: s(p.mime) ?? "application/octet-stream" });
      if (up) throw new Error(up.message);
      const { data: deal } = await db.from("deals").select("brand_id").eq("id", s(p.deal_id)!).single();
      await db.from("deal_files").insert({ deal_id: s(p.deal_id)!, kind: (["brief", "contract"].includes(s(p.kind) ?? "") ? s(p.kind) : "other") as "brief" | "contract" | "other", name, storage_path: dest, size_bytes: blob.size, mime_type: s(p.mime) });
      await db.from("activities").insert({ deal_id: s(p.deal_id), brand_id: deal?.brand_id ?? null, kind: "file", body: `Attached ${s(p.kind) ?? "file"}: ${name} (via AI assistant)` });
      return { ok: true, message: `Attached ${name}.`, link: `/deals/${s(p.deal_id)}` };
    }

    default:
      return { ok: false, message: `Unknown action ${kind}.` };
  }
}

