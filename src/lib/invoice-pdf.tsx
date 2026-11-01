import "server-only";
import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { rupeesInWords } from "./money";

// Noto Sans, split into a main file and an "extended" file that has the ₹ sign.
const fontDir = path.join(process.cwd(), "src/assets/fonts");
let fontsRegistered = false;
function registerFonts() {
  if (fontsRegistered) return;
  Font.register({
    family: "Noto",
    fonts: [
      { src: path.join(fontDir, "noto-sans-latin-400-normal.woff"), fontWeight: 400 },
      { src: path.join(fontDir, "noto-sans-latin-700-normal.woff"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: "NotoExt",
    fonts: [
      { src: path.join(fontDir, "noto-sans-latin-ext-400-normal.woff"), fontWeight: 400 },
      { src: path.join(fontDir, "noto-sans-latin-ext-700-normal.woff"), fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

export type InvoicePdfData = {
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  bill_to_name: string;
  bill_to_address: string | null;
  bill_to_gstin: string | null;
  bill_to_pan: string | null;
  notes: string | null;
  subtotal: number;
  tds_rate: number | null;
  tds_section: string | null;
  status: string;
  items: { description: string; quantity: number; rate: number; amount: number }[];
  from: {
    name: string;
    pan: string | null;
    address: string | null;
    email: string | null;
    phone: string | null;
    bank_account_name: string | null;
    bank_name: string | null;
    bank_account_number: string | null;
    bank_ifsc: string | null;
    upi_id: string | null;
    footer: string | null;
  };
};

const BRAND = "#6d28d9";
const s = StyleSheet.create({
  page: { fontFamily: ["Noto", "NotoExt"], fontSize: 9.5, color: "#0f172a", padding: 40, lineHeight: 1.45 },
  row: { flexDirection: "row" },
  between: { flexDirection: "row", justifyContent: "space-between" },
  h1: { fontSize: 22, fontWeight: 700, color: BRAND, letterSpacing: 1, lineHeight: 1.2, marginBottom: 4 },
  muted: { color: "#64748b" },
  label: { fontSize: 8, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 },
  bold: { fontWeight: 700 },
  box: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 6, padding: 10 },
  th: { fontSize: 8, color: "#64748b", textTransform: "uppercase", fontWeight: 700, paddingVertical: 6 },
  td: { paddingVertical: 7 },
  divider: { borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
});

const inr = (n: number) =>
  `₹${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const date = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${iso}T00:00:00Z`),
      )
    : "—";

function InvoiceDocument({ d }: { d: InvoicePdfData }) {
  const tds = d.tds_rate ? Math.round(d.subtotal * d.tds_rate) / 100 : 0;
  const bank = [
    ["Account name", d.from.bank_account_name],
    ["Bank", d.from.bank_name],
    ["Account no.", d.from.bank_account_number],
    ["IFSC", d.from.bank_ifsc],
    ["UPI", d.from.upi_id],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <Document title={`Invoice ${d.invoice_number}`} author={d.from.name}>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={[s.between, { marginBottom: 24 }]}>
          <View style={{ maxWidth: 280 }}>
            <Text style={[s.bold, { fontSize: 14, lineHeight: 1.3, marginBottom: 2 }]}>{d.from.name}</Text>
            {d.from.address ? <Text style={s.muted}>{d.from.address}</Text> : null}
            {d.from.email ? <Text style={s.muted}>{d.from.email}</Text> : null}
            {d.from.phone ? <Text style={s.muted}>{d.from.phone}</Text> : null}
            {d.from.pan ? (
              <Text style={{ marginTop: 4 }}>
                <Text style={s.bold}>PAN: </Text>
                {d.from.pan}
              </Text>
            ) : null}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.h1}>INVOICE</Text>
            {d.status === "cancelled" ? <Text style={{ color: "#e11d48", fontWeight: 700 }}>CANCELLED</Text> : null}
            <Text style={{ marginTop: 6 }}>
              <Text style={s.muted}>Invoice no. </Text>
              <Text style={s.bold}>{d.invoice_number}</Text>
            </Text>
            <Text>
              <Text style={s.muted}>Date </Text>
              {date(d.issue_date)}
            </Text>
            {d.due_date ? (
              <Text>
                <Text style={s.muted}>Due </Text>
                {date(d.due_date)}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Bill to */}
        <View style={[s.box, { marginBottom: 20 }]}>
          <Text style={s.label}>Bill to</Text>
          <Text style={[s.bold, { fontSize: 11, lineHeight: 1.4 }]}>{d.bill_to_name}</Text>
          {d.bill_to_address ? <Text style={s.muted}>{d.bill_to_address}</Text> : null}
          {d.bill_to_gstin ? <Text>GSTIN: {d.bill_to_gstin}</Text> : null}
          {d.bill_to_pan ? <Text>PAN: {d.bill_to_pan}</Text> : null}
        </View>

        {/* Items */}
        <View style={[s.row, s.divider]}>
          <Text style={[s.th, { width: 24 }]}>#</Text>
          <Text style={[s.th, { flex: 1 }]}>Description</Text>
          <Text style={[s.th, { width: 50, textAlign: "right" }]}>Qty</Text>
          <Text style={[s.th, { width: 90, textAlign: "right" }]}>Rate</Text>
          <Text style={[s.th, { width: 100, textAlign: "right" }]}>Amount</Text>
        </View>
        {d.items.map((it, i) => (
          <View key={i} style={[s.row, s.divider]} wrap={false}>
            <Text style={[s.td, { width: 24 }, s.muted]}>{i + 1}</Text>
            <Text style={[s.td, { flex: 1, paddingRight: 8 }]}>{it.description}</Text>
            <Text style={[s.td, { width: 50, textAlign: "right" }]}>{qty(it.quantity)}</Text>
            <Text style={[s.td, { width: 90, textAlign: "right" }]}>{inr(it.rate)}</Text>
            <Text style={[s.td, { width: 100, textAlign: "right" }]}>{inr(it.amount)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={[s.row, { justifyContent: "flex-end", marginTop: 10 }]}>
          <View style={{ width: 240 }}>
            <View style={[s.between, { paddingVertical: 6, borderTopWidth: 1.5, borderTopColor: "#0f172a" }]}>
              <Text style={[s.bold, { fontSize: 11 }]}>Total</Text>
              <Text style={[s.bold, { fontSize: 11 }]}>{inr(d.subtotal)}</Text>
            </View>
            {tds > 0 ? (
              <>
                <View style={[s.between, { paddingVertical: 2 }]}>
                  <Text style={s.muted}>
                    Less TDS{d.tds_section && d.tds_section !== "other" ? ` u/s ${d.tds_section}` : ""} @ {d.tds_rate}%
                  </Text>
                  <Text style={s.muted}>– {inr(tds)}</Text>
                </View>
                <View style={[s.between, { paddingVertical: 2 }]}>
                  <Text style={s.muted}>Net payable</Text>
                  <Text style={s.muted}>{inr(d.subtotal - tds)}</Text>
                </View>
              </>
            ) : null}
          </View>
        </View>
        <Text style={[s.muted, { marginTop: 6, fontSize: 8.5 }]}>Amount in words: {rupeesInWords(d.subtotal)}</Text>

        {/* Payment details + notes */}
        <View style={[s.row, { marginTop: 24, gap: 16 }]} wrap={false}>
          {bank.length ? (
            <View style={[s.box, { flex: 1 }]}>
              <Text style={s.label}>Payment details</Text>
              {bank.map(([k, v]) => (
                <View key={k} style={s.row}>
                  <Text style={[s.muted, { width: 80 }]}>{k}</Text>
                  <Text style={s.bold}>{v}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {d.notes ? (
            <View style={[s.box, { flex: 1 }]}>
              <Text style={s.label}>Notes</Text>
              <Text>{d.notes}</Text>
            </View>
          ) : null}
        </View>

        <View style={{ marginTop: 20 }} wrap={false}>
          <Text style={[s.muted, { fontSize: 8.5 }]}>Not registered under GST, so no GST is charged on this invoice.</Text>
          {d.from.footer ? <Text style={[s.muted, { fontSize: 8.5, marginTop: 2 }]}>{d.from.footer}</Text> : null}
        </View>

        <Text
          style={{ position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 8, color: "#94a3b8", textAlign: "center" }}
          render={({ pageNumber, totalPages }) => (totalPages > 1 ? `Page ${pageNumber} of ${totalPages}` : "")}
          fixed
        />
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<InvoiceDocument d={data} />);
}

export function invoiceFileName(invoiceNumber: string) {
  return `Invoice-${invoiceNumber.replace(/[^\w-]+/g, "-")}.pdf`;
}
