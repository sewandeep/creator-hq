import { requireUser } from "@/lib/auth";
import { stageInfo } from "@/lib/constants";
import { fyLabel } from "@/lib/fy";
import { loadHistory } from "../data";

function csvCell(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  const fyParam = new URL(req.url).searchParams.get("fy");
  const fy = fyParam && /^\d{4}$/.test(fyParam) ? Number(fyParam) : null;
  const { supabase } = await requireUser();
  const rows = await loadHistory(supabase, fy);

  const header = ["Date", "Brand", "Category", "Campaign", "Deliverables", "Platform", "Amount (INR)", "Barter", "Product value (INR)", "Status", "Links"];
  const lines = rows.map((r) =>
    [
      r.deal_date,
      r.brand.name,
      r.brand.category,
      r.title,
      r.deliverables.map((d) => `${d.quantity} ${d.type}`).join("; "),
      r.platform,
      r.amount,
      r.is_barter ? "Yes" : "",
      r.barter_value,
      stageInfo(r.stage).label,
      r.deliverables.map((d) => d.link).filter(Boolean).join(" "),
    ]
      .map(csvCell)
      .join(","),
  );
  const name = `creator-hq-history-${fy === null ? "all-time" : fyLabel(fy).replace(/\s+/g, "-")}.csv`;
  return new Response([header.join(","), ...lines].join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
