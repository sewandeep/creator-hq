"use server";

import { requireUser } from "@/lib/auth";
import { refreshAll } from "./helpers";

export async function addMemory(fact: string): Promise<{ error?: string; groupId?: string }> {
  const { supabase } = await requireUser();
  const f = fact.trim().slice(0, 300);
  if (!f) return { error: "Type something to remember." };
  const { error } = await supabase.from("ai_memory").insert({ fact: f, source: "you" });
  if (error) return { error: error.message };
  return refreshAll();
}

export async function deleteMemory(id: string): Promise<{ error?: string; groupId?: string }> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("ai_memory").delete().eq("id", id);
  if (error) return { error: error.message };
  return refreshAll();
}
