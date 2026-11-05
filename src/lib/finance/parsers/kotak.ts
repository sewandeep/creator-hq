// Kotak Mahindra Bank statement reader — no AI needed.
//
// Kotak's PDF has a fixed table:
//   # | Date | Description | Chq/Ref. No. | Withdrawal (Dr.) | Deposit (Cr.) | Balance
// Empty cells disappear in the extracted text, so a row shows only one amount
// plus the balance. Whether it was money in or out comes from the running
// balance (balance went up = money in), which also double-checks every row.

import type { ParsedStatement, ParsedRow } from "./types";

const HEADER = /^#\s*\|\s*Date\s*\|\s*Description\b.*Withdrawal.*Deposit.*Balance\s*$/i;
const ROW = /^(\d+)\s*\|\s*(\d{2}) ([A-Za-z]{3}) (\d{4})\s*\|\s*(.*)$/;
const AMOUNT = /^-?[\d,]+\.\d{2}$/;
const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
/** Text after the table that must never be glued onto the last row. */
const STOP = /^(Account Summary|Goods and Services Tax|Commonly Used Narrations|Dear Customer|End of Statement|Nominee Details|Please note|To view the latest)/i;
const FOOTER = /^Statement Generated on|Page \d+ of \d+/i;

const num = (s: string) => Number(s.replace(/,/g, ""));
const r2 = (n: number) => Math.round(n * 100) / 100;

function isoDate(d: string, mon: string, y: string) {
  const m = MONTHS[mon.toLowerCase()];
  return m ? `${y}-${m}-${d}` : null;
}

export function looksLikeKotak(pages: string[]) {
  const text = pages.slice(0, 2).join("\n");
  return /kotak|KKBK/i.test(text) && pages.some((p) => p.split("\n").some((l) => HEADER.test(l.trim())));
}

/** Joins a wrapped piece of narration onto what came before it. */
function joinPiece(prev: string, piece: string) {
  if (!prev) return piece;
  // "breakfa" + "st", "03-02-" + "26/xx5711" → no space; "Sent" + "using Payt" → space.
  if (/[-/:*]$/.test(prev) || /^[a-z]{1,3}$/.test(piece)) return prev + piece;
  return `${prev} ${piece}`;
}

/** Who the money went to / came from, from Kotak's narration codes. */
export function kotakCounterparty(desc: string): { counterparty: string; note: string | null } {
  const d = desc.trim();
  const parts = d.split("/").map((p) => p.trim());
  const title = (s: string) => s.replace(/\s+/g, " ").trim();
  if (/^UPI\//i.test(d)) {
    // UPI/<name>/[bank code/]<ref no>/<note> — keep the words, drop codes and numbers.
    const note = parts
      .slice(2)
      .filter((p) => !/^\d{6,}$/.test(p) && !/^[A-Z]{4}$/.test(p))
      .join(" ")
      .replace(/\(Value Date:[^)]*\)/i, "")
      .replace(/Sent using P\w*/i, "")
      .trim();
    return { counterparty: title(parts[1] ?? "UPI"), note: note && !/^(UPI|NA|null)$/i.test(note) ? note : null };
  }
  if (/^(PCD|PCI)\//i.test(d)) return { counterparty: title((parts[2] ?? "Card payment").replace(/\*.*$/, "")), note: "Card payment" };
  if (/^Recd:(IMPS|NEFT|RTGS)\//i.test(d)) return { counterparty: title(parts[2] ?? "Bank transfer"), note: `${parts[0].replace(/^Recd:/i, "")} received` };
  if (/^(IMPS|NEFT|RTGS|IB|MB)[-/ ]/i.test(d)) return { counterparty: title(parts[2] ?? parts[1] ?? d.slice(0, 30)), note: null };
  if (/^NACH/i.test(d)) return { counterparty: title(d.replace(/^NACH-?(MUT-)?(DR|CR)?-?/i, "").split("-")[0] || "NACH"), note: /MUT/i.test(d) ? "Mutual fund (NACH)" : "Auto-debit (NACH)" };
  if (/^Sweep Tr(f|ansfer)/i.test(d)) return { counterparty: "Kotak fixed deposit (sweep)", note: d };
  if (/CHRG|Chrg:|FEE|CHARGES/i.test(d)) return { counterparty: "Kotak (bank charge)", note: d };
  if (/^(ATW|ATL|NWD|ATM)/i.test(d)) return { counterparty: "ATM", note: "Cash withdrawal" };
  if (/^Int\.?\s*Pd/i.test(d)) return { counterparty: "Kotak (interest)", note: "Interest" };
  return { counterparty: title(parts[0].slice(0, 40)), note: null };
}

export function parseKotak(pages: string[]): ParsedStatement | null {
  const rows: (ParsedRow & { cellsAfter: string[] })[] = [];
  let opening: number | null = null;
  let closing: number | null = null;
  let current: (typeof rows)[number] | null = null;
  const joined = pages.join("\n");

  const period = joined.match(/(\d{2}) ([A-Za-z]{3}) (\d{4})\s*-\s*(\d{2}) ([A-Za-z]{3}) (\d{4})/);
  const last4 = joined.match(/Account No\.?\s*(\d{6,})/i)?.[1]?.slice(-4) ?? null;
  const summary = joined.match(/Savings Account \(SA\):?\s*\|\s*([\d,]+\.\d{2})\s*\|\s*(-?[\d,]+\.\d{2})/i);
  if (summary) closing = num(summary[2]);

  for (const page of pages) {
    // Lines at the top of a page (name, account no.) aren't part of any row.
    // Wrapped text from the last row of the previous page only continues after
    // this page's table header.
    let onPage = false;
    let inTable = true;
    for (const raw of page.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      if (HEADER.test(line)) {
        onPage = true;
        inTable = true;
        continue;
      }
      if (STOP.test(line)) {
        inTable = false;
        current = null;
        continue;
      }
      if (FOOTER.test(line)) continue;

      const op = line.match(/Opening Balance\s*\|.*?(-?[\d,]+\.\d{2})\s*$/i);
      if (op) {
        opening = num(op[1]);
        onPage = true;
        continue;
      }
      const m = line.match(ROW);
      if (m) {
        onPage = true;
        inTable = true;
        const date = isoDate(m[2], m[3], m[4]);
        const cells = m[5].split("|").map((c) => c.trim()).filter(Boolean);
        const amounts: number[] = [];
        while (cells.length && AMOUNT.test(cells[cells.length - 1])) amounts.unshift(num(cells.pop()!));
        if (!date || amounts.length < 2) {
          current = null;
          continue;
        }
        current = {
          seq: Number(m[1]),
          date,
          description: cells[0] ?? "",
          reference: cells.slice(1).join(" ") || null,
          amount: amounts[amounts.length - 2],
          balance: amounts[amounts.length - 1],
          direction: "debit",
          cellsAfter: [],
        };
        rows.push(current);
        continue;
      }
      // A wrapped line belonging to the row above (narration, sometimes reference).
      if (current && onPage && inTable) {
        const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
        if (cells[0]) current.description = joinPiece(current.description, cells[0]);
        if (cells.length > 1 && current.reference) current.reference = `${current.reference}${cells.slice(1).join("")}`;
      }
    }
  }
  if (!rows.length) return null;

  // Money in or out, from the running balance. Kotak prints a balance that
  // dipped below zero (covered by a fixed-deposit sweep) without the minus sign.
  let prev = opening;
  let unsure = 0;
  for (const r of rows) {
    if (prev !== null) {
      const up = r2(prev + r.amount);
      const down = r2(prev - r.amount);
      if (Math.abs(up - r.balance) < 0.011) r.direction = "credit";
      else if (Math.abs(down - r.balance) < 0.011) r.direction = "debit";
      else if (Math.abs(down + r.balance) < 0.011) {
        r.direction = "debit";
        r.balance = -r.balance;
      } else if (Math.abs(up + r.balance) < 0.011) {
        r.direction = "credit";
        r.balance = -r.balance;
      } else {
        unsure++;
        r.direction = /^(Recd:|Sweep Tr\w* From|Int\.?\s*Pd|NEFT CR|IMPS CR)/i.test(r.description) || r.balance > prev ? "credit" : "debit";
      }
    }
    prev = r.balance;
  }

  const first = rows[0];
  const lastRow = rows[rows.length - 1];
  const periodFrom = period ? isoDate(period[1], period[2], period[3]) : first.date;
  const periodTo = period ? isoDate(period[4], period[5], period[6]) : lastRow.date;
  return {
    bank: "Kotak",
    account_last4: last4,
    period_from: periodFrom,
    period_to: periodTo,
    opening_balance: opening,
    closing_balance: closing ?? lastRow.balance,
    unsure,
    rows: rows.map((r) => {
      const { counterparty, note } = kotakCounterparty(r.description);
      return { seq: r.seq, date: r.date, description: r.description, reference: r.reference, amount: r.amount, balance: r.balance, direction: r.direction, counterparty, note };
    }),
  };
}
