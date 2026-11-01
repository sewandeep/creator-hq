import "server-only";
import type { DB } from "@/app/actions/helpers";
import { fyOf } from "./fy";
import { formatInvoiceNumber } from "./money";

/** Next invoice number for the financial year of `issueDate`, e.g. SN/26-27/004. */
export async function nextInvoiceNumber(supabase: DB, prefix: string, issueDate: string) {
  const fy = fyOf(issueDate);
  const { data, error } = await supabase
    .from("invoices")
    .select("seq")
    .eq("fy", fy)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const seq = (data?.seq ?? 0) + 1;
  return { fy, seq, number: formatInvoiceNumber(prefix, fy, seq) };
}
