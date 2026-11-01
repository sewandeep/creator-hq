import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { applyProposal, cancelProposal } from "@/lib/ai/apply";

// Confirming a statement import reads the whole PDF with AI.
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, userId } = await requireUser();
  const body = (await req.json().catch(() => ({}))) as { action?: string; edits?: Record<string, unknown>; password?: string };
  if (body.action === "cancel") {
    await cancelProposal(supabase, userId, id);
    return NextResponse.json({ ok: true, message: "Cancelled." });
  }
  const r = await applyProposal(supabase, userId, id, { edits: body.edits, password: body.password?.trim() || undefined });
  revalidatePath("/", "layout");
  return NextResponse.json(r);
}
