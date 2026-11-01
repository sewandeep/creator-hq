import { requireUser } from "@/lib/auth";
import { loadInvoice } from "@/lib/invoice-data";
import { invoiceFileName, renderInvoicePdf } from "@/lib/invoice-pdf";

// Download (or view) an invoice as a PDF.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const inv = await loadInvoice(supabase, id);
  if (!inv) return new Response("Invoice not found", { status: 404 });

  const pdf = await renderInvoicePdf(inv.pdf);
  const download = new URL(req.url).searchParams.has("download");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${invoiceFileName(inv.invoice.invoice_number)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
