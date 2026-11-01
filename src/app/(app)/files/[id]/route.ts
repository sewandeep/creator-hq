import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

// Opens a stored brief/contract through a short-lived private link.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: file } = await supabase.from("deal_files").select("storage_path, name").eq("id", id).maybeSingle();
  if (!file) return new NextResponse("File not found", { status: 404 });

  const { data, error } = await supabase.storage.from("deal-files").createSignedUrl(file.storage_path, 60);
  if (error || !data) return new NextResponse("Couldn't open file", { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
