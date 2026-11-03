"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { SOURCES, STAGE_IDS, type StageId } from "@/lib/constants";
import { addDays, fmtDate, todayIST } from "@/lib/format";
import {
  FormError,
  bool,
  date,
  money,
  oneOf,
  requiredText,
  text,
  toActionError,
  type ActionState,
} from "@/lib/forms";
import { findOrCreateBrand, refreshAll, type DB } from "./helpers";

const SOURCE_IDS = SOURCES.map((s) => s.id);

async function dealFields(supabase: DB, fd: FormData) {
  let brandId = text(fd, "brand_id");
  const newBrand = text(fd, "new_brand");
  if (newBrand) brandId = await findOrCreateBrand(supabase, newBrand);
  if (!brandId) throw new FormError("Pick a brand or type a new brand name.");

  return {
    brand_id: brandId,
    contact_id: text(fd, "contact_id"),
    title: requiredText(fd, "title", "Deal name"),
    stage: oneOf(fd, "stage", STAGE_IDS) ?? "lead",
    source: oneOf(fd, "source", SOURCE_IDS),
    platform: text(fd, "platform"),
    amount: money(fd, "amount"),
    is_barter: bool(fd, "is_barter"),
    barter_value: money(fd, "barter_value"),
    deal_date: date(fd, "deal_date") ?? todayIST(),
    due_date: date(fd, "due_date"),
    next_follow_up: date(fd, "next_follow_up"),
    lost_reason: text(fd, "lost_reason"),
    notes: text(fd, "notes"),
  };
}

export async function createDeal(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  let id: string;
  try {
    const fields = await dealFields(supabase, fd);
    const { data, error } = await supabase.from("deals").insert(fields).select("id, brand_id").single();
    if (error) throw error;
    id = data.id;
    await supabase.from("activities").insert({
      deal_id: data.id,
      brand_id: data.brand_id,
      kind: "system",
      body: "Deal created",
    });
  } catch (e) {
    return toActionError(e);
  }
  refreshAll();
  redirect(`/deals/${id}`);
}

export async function updateDeal(dealId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  try {
    const fields = await dealFields(supabase, fd);
    const { error } = await supabase.from("deals").update(fields).eq("id", dealId);
    if (error) throw error;
  } catch (e) {
    return toActionError(e);
  }
  refreshAll();
  redirect(`/deals/${dealId}`);
}

/** Used by the drag-and-drop board and the stage buttons. */
export async function moveDealToStage(dealId: string, stage: StageId) {
  if (!STAGE_IDS.includes(stage)) throw new Error("Unknown stage");
  const { supabase } = await requireUser();
  const { error } = await supabase.from("deals").update({ stage }).eq("id", dealId);
  if (error) throw new Error(error.message);
  return refreshAll();
}

export async function deleteDeal(dealId: string) {
  const { supabase, userId } = await requireUser();
  // Remove stored files first so nothing is left behind in storage.
  const { data: files } = await supabase.from("deal_files").select("storage_path").eq("deal_id", dealId);
  if (files?.length) {
    await supabase.storage.from("deal-files").remove(files.map((f) => f.storage_path));
  }
  const { error } = await supabase.from("deals").delete().eq("id", dealId).eq("user_id", userId);
  if (error) throw new Error(error.message);
  refreshAll();
  redirect("/deals");
}

/**
 * Log a follow-up and pick the next follow-up date.
 * "in_days" = 0 clears the reminder.
 */
export async function logFollowUp(dealId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  try {
    const note = text(fd, "note");
    const custom = date(fd, "next_date");
    const inDays = text(fd, "in_days");
    let next: string | null = null;
    if (custom) next = custom;
    else if (inDays && inDays !== "0") next = addDays(todayIST(), Number(inDays));

    const { data: deal, error } = await supabase
      .from("deals")
      .update({ next_follow_up: next })
      .eq("id", dealId)
      .select("brand_id")
      .single();
    if (error) throw error;

    await supabase.from("activities").insert({
      deal_id: dealId,
      brand_id: deal.brand_id,
      kind: "follow_up",
      body: `${note ?? "Followed up"}${next ? ` · next follow-up ${fmtDate(next)}` : " · no further follow-up"}`,
    });
  } catch (e) {
    return toActionError(e);
  }
  refreshAll();
  return { ok: true, message: "Follow-up logged." };
}

/** Same as moveDealToStage, for plain forms (which can't take a return value). */
export async function moveDealToStageForm(dealId: string, stage: Parameters<typeof moveDealToStage>[1]): Promise<void> {
  await moveDealToStage(dealId, stage);
}
