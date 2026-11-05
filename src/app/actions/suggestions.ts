"use server";

import { requireUser } from "@/lib/auth";
import { ensureCategories } from "@/lib/finance/categories-server";
import { addEntry, applyCategory } from "@/lib/finance/entries";
import { addDays, todayIST } from "@/lib/format";
import { createPaidDealFromTxn, linkTxnToDeal } from "@/lib/income-link";
import type { SuggestionAction } from "@/lib/suggestions";
import { refreshAll } from "./helpers";

export type SuggestionResult = { ok: boolean; message: string; groupId?: string; link?: string };

/** Carries out a suggestion's one-tap fix. Everything it changes can be undone. */
export async function applySuggestion(
  key: string,
  action: SuggestionAction,
  opts: { tdsRate?: number; brand?: string; title?: string } = {},
): Promise<SuggestionResult> {
  const { supabase } = await requireUser();
  const tds = [0, 2, 10].includes(Number(opts.tdsRate)) ? Number(opts.tdsRate) : 10;
  try {
    switch (action.kind) {
      case "link_deal": {
        const r = await linkTxnToDeal(supabase, action.txnId, action.dealId, tds);
        return { ok: true, message: `Linked${r.tds ? ` (+ ${Math.round(r.tds)} TDS recorded)` : ""}. Deal marked paid.`, ...(await refreshAll()), link: `/deals?deal=${action.dealId}` };
      }
      case "create_deal": {
        const r = await createPaidDealFromTxn(supabase, action.txnId, { brand: opts.brand ?? action.brand, title: opts.title ?? action.title, tdsRate: tds });
        return { ok: true, message: "Deal and invoice created, marked paid.", ...(await refreshAll()), link: `/deals?deal=${r.dealId}` };
      }
      case "recat": {
        let n = 0;
        for (const [i, id] of action.txnIds.entries()) {
          const r = await applyCategory(supabase, { transactionId: id, categoryId: action.categoryId, remember: i === 0 && Boolean(action.pattern), pattern: action.pattern });
          if (r.error) throw new Error(r.error);
          n += 1 + (r.alsoUpdated ?? 0);
        }
        return { ok: true, message: `Moved ${n} payment${n === 1 ? "" : "s"}${action.pattern ? " — future ones too" : ""}.`, ...(await refreshAll()) };
      }
      case "got_back": {
        const cats = await ensureCategories(supabase);
        const back = cats.find((c) => c.name === "Money returned") ?? cats.find((c) => c.kind === "lending");
        await addEntry(supabase, { amount: action.amount, direction: "credit", description: `Got back from ${action.person}`, date: todayIST(), isCash: false, person: action.person, categoryId: back?.id ?? null, source: "manual" });
        return { ok: true, message: `Noted — ${action.person} paid you back.`, ...(await refreshAll()) };
      }
      case "snooze":
        await supabase.from("suggestion_dismissals").upsert({ key, until: addDays(todayIST(), action.days) });
        await refreshAll();
        return { ok: true, message: `OK — I'll remind you in ${action.days} days.` };
      case "dismiss":
        await supabase.from("suggestion_dismissals").upsert({ key, until: null });
        await refreshAll();
        return { ok: true, message: "Dismissed." };
      default:
        return { ok: false, message: "Nothing to do." };
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Couldn't do that." };
  }
}
