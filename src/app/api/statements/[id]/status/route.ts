import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

/** Where a statement is up to — the page checks this while it's being read. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: st } = await supabase.from("statements").select("status, error, rows_found, rows_added, rows_duplicate, balance_ok, issues, created_at, processed_at").eq("id", id).maybeSingle();
  if (!st) return NextResponse.json({ status: "failed", message: "Statement not found." });
  if (st.status === "processing" || st.status === "uploaded") {
    // The server gives each read 5 minutes. If it's been longer, it was cut off — release it so "Try again" works.
    const started = new Date(st.processed_at ?? st.created_at).getTime();
    if (Date.now() - started > 6 * 60_000) {
      const message = "Reading took too long and stopped. Tap Try again — it reads faster now. If it keeps happening, upload one month at a time.";
      await supabase.from("statements").update({ status: "failed", error: message }).eq("id", id);
      return NextResponse.json({ status: "failed", message });
    }
    const progress = st.error?.startsWith("progress: ") ? st.error.slice(10) : null;
    return NextResponse.json({ status: "processing", progress });
  }
  if (st.status !== "done") return NextResponse.json({ status: st.status, message: st.error ?? "Couldn't read this statement." });
  const { count } = await supabase.from("transactions").select("id", { count: "exact", head: true }).eq("statement_id", id).eq("needs_review", true);
  return NextResponse.json({
    status: "done",
    message: `Read ${st.rows_found} transactions.`,
    added: st.rows_added,
    duplicates: st.rows_duplicate,
    review: count ?? 0,
    balanceOk: st.balance_ok,
    issues: Array.isArray(st.issues) ? st.issues : [],
  });
}
