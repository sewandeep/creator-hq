import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { processStatement } from "@/lib/finance/process";

// Reading a long statement with AI can take a minute or two.
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  const result = await processStatement(supabase, id, body.password?.trim() || undefined);
  revalidatePath("/", "layout");
  return NextResponse.json(result);
}
