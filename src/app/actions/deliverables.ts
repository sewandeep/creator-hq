"use server";

import { requireUser } from "@/lib/auth";
import { DELIVERABLE_STATUSES } from "@/lib/constants";
import { date, int, oneOf, requiredText, text, toActionError, type ActionState } from "@/lib/forms";
import { refreshAll } from "./helpers";

const STATUS_IDS = DELIVERABLE_STATUSES.map((s) => s.id);

function fields(fd: FormData) {
  const status = oneOf(fd, "status", STATUS_IDS) ?? "todo";
  let posted = date(fd, "posted_date");
  if (status === "posted" && !posted) posted = new Date().toISOString().slice(0, 10);
  return {
    type: requiredText(fd, "type", "Type"),
    platform: text(fd, "platform"),
    quantity: int(fd, "quantity", 1),
    due_date: date(fd, "due_date"),
    posted_date: posted,
    link: text(fd, "link"),
    status,
    notes: text(fd, "notes"),
  };
}

export async function addDeliverable(dealId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  try {
    const { error } = await supabase.from("deliverables").insert({ deal_id: dealId, ...fields(fd) });
    if (error) throw error;
  } catch (e) {
    return toActionError(e);
  }
  refreshAll();
  return { ok: true };
}

export async function updateDeliverable(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  try {
    const { error } = await supabase.from("deliverables").update(fields(fd)).eq("id", id);
    if (error) throw error;
  } catch (e) {
    return toActionError(e);
  }
  refreshAll();
  return { ok: true };
}

export async function deleteDeliverable(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("deliverables").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refreshAll();
}
