"use server";

import { requireUser } from "@/lib/auth";
import { FormError, requiredText, text, toActionError, type ActionState } from "@/lib/forms";
import { refreshAll } from "./helpers";

function fields(fd: FormData) {
  const email = text(fd, "email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new FormError(`"${email}" isn't a valid email.`);
  return {
    brand_id: text(fd, "brand_id"),
    name: requiredText(fd, "name", "Name"),
    email,
    phone: text(fd, "phone"),
    role: text(fd, "role"),
    notes: text(fd, "notes"),
  };
}

export async function createContact(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  try {
    const { error } = await supabase.from("contacts").insert(fields(fd));
    if (error) throw error;
  } catch (e) {
    return toActionError(e);
  }
  refreshAll();
  return { ok: true, message: "Contact added." };
}

export async function updateContact(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  try {
    const { error } = await supabase.from("contacts").update(fields(fd)).eq("id", id);
    if (error) throw error;
  } catch (e) {
    return toActionError(e);
  }
  refreshAll();
  return { ok: true, message: "Saved." };
}

export async function deleteContact(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("contacts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refreshAll();
}
