import { after, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { processStatement } from "@/lib/finance/process";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

// Reading a long statement with AI can take a minute or two — it runs in the
// background so a phone can't drop the connection; the page checks /status.
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, userId } = await requireUser();
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  const { data: st } = await supabase.from("statements").select("id").eq("id", id).maybeSingle();
  if (!st) return NextResponse.json({ status: "failed", message: "Statement not found." });

  await supabase.from("statements").update({ status: "processing", error: null }).eq("id", id);
  const db = isAdminConfigured() ? createAdminClient(userId) : supabase;
  after(async () => {
    try {
      await processStatement(db, id, body.password?.trim() || undefined);
    } catch (e) {
      await db.from("statements").update({ status: "failed", error: e instanceof Error ? e.message : String(e) }).eq("id", id);
    }
    revalidatePath("/", "layout");
  });
  return NextResponse.json({ status: "processing" });
}
