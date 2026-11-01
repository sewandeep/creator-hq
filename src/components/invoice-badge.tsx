import { invoiceStatus } from "@/lib/money";

export function InvoiceBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  if (overdue) return <span className="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-rose-700">Overdue</span>;
  const s = invoiceStatus(status);
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${s.color}`}>{s.label}</span>;
}
