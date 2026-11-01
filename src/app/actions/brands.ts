"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { requiredText, text, toActionError, type ActionState } from "@/lib/forms";
import { refreshAll } from "./helpers";

function fields(fd: FormData) {
  return {
    name: requiredText(fd, "name", "Brand name").replace(/\s+/g, " "),
    category: text(fd, "category"),
    website: text(fd, "website"),
    instagram: text(fd, "instagram"),
    notes: text(fd, "notes"),
    legal_name: text(fd, "legal_name"),
    billing_address: text(fd, "billing_address"),
    gstin: text(fd, "gstin")?.toUpperCase() ?? null,
    pan: text(fd, "pan")?.toUpperCase() ?? null,
    tan: text(fd, "tan")?.toUpperCase() ?? null,
  };
}

export async function createBrand(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  let id: string;
  try {
    const { data, error } = await supabase.from("brands").insert(fields(fd)).select("id").single();
    if (error) throw error;
    id = data.id;
  } catch (e) {
    return toActionError(e);
  }
  refreshAll();
  redirect(`/brands/${id}`);
}

export async function updateBrand(brandId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  try {
    const { error } = await supabase.from("brands").update(fields(fd)).eq("id", brandId);
    if (error) throw error;
  } catch (e) {
    return toActionError(e);
  }
  refreshAll();
  return { ok: true, message: "Saved." };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function deleteBrand(brandId: string, _prev: ActionState): Promise<ActionState> {
  const { supabase } = await requireUser();
  try {
    const { error } = await supabase.from("brands").delete().eq("id", brandId);
    if (error) throw error;
  } catch (e) {
    return toActionError(e);
  }
  refreshAll();
  redirect("/brands");
}
