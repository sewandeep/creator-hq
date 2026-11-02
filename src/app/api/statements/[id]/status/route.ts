import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

/** Where a statement is up to — the page checks this while it's being read. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: st } = await supabase.from("statements").select("status, error, rows_found, rows_added, rows_duplicate, balance_ok, issues, created_at, processed_at").eq("id", id).maybeSingle();
  if (!st) return NextResponse.json({ status: "failed", message: "Statement not found." });
  if (st.status === "processing" || st.status === "uploaded") {
    return NextResponse.json({ status: "processing" });
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
