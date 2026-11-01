// Turns a pasted spreadsheet / CSV of past collaborations into clean rows.
// Shared by the import page (for the preview) and the server (for saving),
// so what you see in the preview is exactly what gets saved.

import { STAGE_IDS, type StageId } from "./constants";

export const IMPORT_FIELDS = [
  { id: "brand", label: "Brand", required: true, synonyms: ["brand", "brand name", "company", "client", "collab", "collaboration"] },
  { id: "title", label: "Campaign / deal name", synonyms: ["campaign", "title", "deal", "project", "campaign name", "deal name"] },
  { id: "date", label: "Date", synonyms: ["date", "month", "posted", "posted on", "deal date", "when", "post date"] },
  { id: "platform", label: "Platform", synonyms: ["platform", "channel", "app"] },
  { id: "deliverables", label: "Deliverables", synonyms: ["deliverables", "deliverable", "content", "work", "what", "format", "type"] },
  { id: "amount", label: "Amount (₹)", synonyms: ["amount", "fee", "price", "paid", "payment", "rate", "value", "money", "inr", "rs"] },
  { id: "stage", label: "Status", synonyms: ["status", "stage", "state"] },
  { id: "contact_name", label: "Contact name", synonyms: ["contact", "contact name", "poc", "person", "manager"] },
  { id: "contact_email", label: "Contact email", synonyms: ["email", "contact email", "mail", "e-mail"] },
  { id: "link", label: "Post link", synonyms: ["link", "url", "post link", "content link"] },
  { id: "notes", label: "Notes", synonyms: ["notes", "note", "remarks", "comments", "comment"] },
] as const;

export type ImportFieldId = (typeof IMPORT_FIELDS)[number]["id"];
export type ColumnMapping = (ImportFieldId | "")[];

export type ParsedDeliverable = { type: string; quantity: number; note?: string };

export type ImportRow = {
  brand: string;
  title: string;
  deal_date: string | null;
  platform: string | null;
  deliverables: ParsedDeliverable[];
  amount: number | null;
  is_barter: boolean;
  stage: StageId;
  contact_name: string | null;
  contact_email: string | null;
  link: string | null;
  notes: string | null;
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Table parsing
// ---------------------------------------------------------------------------

/** Parses CSV or tab-separated text (what you get when copying from Google Sheets / Excel). */
export function parseTable(input: string): string[][] {
  const textIn = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  if (!textIn) return [];
  const firstLine = textIn.split("\n", 1)[0];
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < textIn.length; i++) {
    const ch = textIn[i];
    if (inQuotes) {
      if (ch === '"') {
        if (textIn[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell.trim());
  rows.push(row);
  return rows.filter((r) => r.some((c) => c !== ""));
}

/** Guesses which column is which from the header names. */
export function guessMapping(headers: string[]): ColumnMapping {
  const used = new Set<string>();
  return headers.map((h) => {
    const name = h.toLowerCase().replace(/[^a-z\s-]/g, "").trim();
    // Exact synonym match first, then "contains".
    for (const pass of ["exact", "contains"] as const) {
      for (const field of IMPORT_FIELDS) {
        if (used.has(field.id)) continue;
        const hit = field.synonyms.some((s) => (pass === "exact" ? name === s : name.includes(s)));
        if (hit) {
          used.add(field.id);
          return field.id;
        }
      }
    }
    return "";
  });
}

// ---------------------------------------------------------------------------
// Value parsing
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/**
 * Understands 2024-03-15, 15/03/2024, 15-3-24, 15 Mar 2024, Mar 15 2024,
 * March 2024 / Mar-24 (→ 1st of the month) and 2024 (→ 1 Jan).
 * Numeric dates are read the Indian way: day first.
 */
export function parseDate(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/,/g, " ").replace(/\s+/g, " ");
  if (!s) return null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) return iso(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) return iso(+m[3], +m[2], +m[1]);
  if ((m = s.match(/^(\d{1,2})[ -]([a-z]+)[ -](\d{2,4})$/)) && MONTHS[m[2].slice(0, 3)])
    return iso(+m[3], MONTHS[m[2].slice(0, 3)], +m[1]);
  if ((m = s.match(/^([a-z]+)[ -](\d{1,2})[ -](\d{4})$/)) && MONTHS[m[1].slice(0, 3)])
    return iso(+m[3], MONTHS[m[1].slice(0, 3)], +m[2]);
  if ((m = s.match(/^([a-z]+)[ '-]*(\d{2,4})$/)) && MONTHS[m[1].slice(0, 3)]) return iso(+m[2], MONTHS[m[1].slice(0, 3)], 1);
  if ((m = s.match(/^(\d{1,2})[-/](\d{4})$/))) return iso(+m[2], +m[1], 1);
  if ((m = s.match(/^(\d{4})$/))) return iso(+m[1], 1, 1);
  return null;
}

/** "₹15,000", "Rs 15000", "15k", "1.2L", "barter" → amount + barter flag. */
export function parseAmount(raw: string): { amount: number | null; barter: boolean; ok: boolean } {
  const s = raw.trim().toLowerCase();
  if (!s) return { amount: null, barter: false, ok: true };
  const barter = /barter|free|product|gift|pr\b/.test(s);
  const m = s.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(k|l|lakh|lac|lakhs)?/);
  if (!m) return { amount: null, barter, ok: barter };
  let n = Number(m[1]);
  if (m[2] === "k") n *= 1_000;
  else if (m[2]) n *= 100_000;
  return { amount: Math.round(n * 100) / 100, barter, ok: true };
}

const STAGE_WORDS: [RegExp, StageId][] = [
  [/lost|cancel|reject|declin|dropped|no deal/, "lost"],
  [/invoic|pending payment|payment pending|awaiting payment|unpaid|not paid/, "invoiced"],
  [/\bpaid|received|done|complete|closed|settled/, "paid"],
  [/posted|live|published/, "posted"],
  [/progress|shoot|editing|creating|working/, "in_progress"],
  [/confirm|signed|agreed|booked/, "confirmed"],
  [/negotiat/, "negotiating"],
  [/contact|pitched|sent|reached/, "contacted"],
  [/lead|prospect|idea/, "lead"],
];

export function parseStage(raw: string, fallback: StageId = "paid"): StageId {
  const s = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if ((STAGE_IDS as string[]).includes(s)) return s as StageId;
  const words = raw.toLowerCase();
  for (const [re, stage] of STAGE_WORDS) if (re.test(words)) return stage;
  return fallback;
}

const TYPE_WORDS: [RegExp, string][] = [
  [/short/, "YouTube Short"],
  [/reel/, "Reel"],
  [/stor(y|ies)/, "Story"],
  [/carou?sel/, "Carousel"],
  [/integrat/, "Integration"],
  [/\blive\b/, "Live"],
  [/event|appearance|meet/, "Event / Appearance"],
  [/ugc/, "UGC"],
  [/youtube|\byt\b|video|vlog|dedicated/, "YouTube Video"],
  [/post|static|image|photo/, "Post"],
];

/** "2 reels + 3 stories, 1 YT video" → [{Reel×2}, {Story×3}, {YouTube Video×1}] */
export function parseDeliverables(raw: string): ParsedDeliverable[] {
  const s = raw.trim();
  if (!s) return [];
  return s
    .split(/\s*(?:,|;|\+|&|\/|\band\b|\n)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const qty = part.match(/(\d+)\s*x?\b/i) ?? part.match(/x\s*(\d+)/i);
      const quantity = qty ? Math.max(1, Number(qty[1])) : 1;
      const lower = part.toLowerCase();
      const found = TYPE_WORDS.find(([re]) => re.test(lower));
      return found ? { type: found[1], quantity } : { type: "Other", quantity, note: part };
    });
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export function buildRows(dataRows: string[][], mapping: ColumnMapping): ImportRow[] {
  return dataRows.map((cells) => {
    const get = (field: ImportFieldId) => {
      const idx = mapping.indexOf(field);
      return idx >= 0 ? (cells[idx] ?? "").trim() : "";
    };
    const warnings: string[] = [];

    const brand = get("brand").replace(/\s+/g, " ");
    if (!brand) warnings.push("No brand — this row will be skipped.");

    const rawDate = get("date");
    const deal_date = rawDate ? parseDate(rawDate) : null;
    if (rawDate && !deal_date) warnings.push(`Couldn't read date "${rawDate}".`);

    const rawAmount = get("amount");
    const money = parseAmount(rawAmount);
    if (!money.ok) warnings.push(`Couldn't read amount "${rawAmount}".`);

    const deliverables = parseDeliverables(get("deliverables"));
    const email = get("contact_email") || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) warnings.push(`"${email}" doesn't look like an email.`);

    const title =
      get("title") ||
      [brand, deliverables.map((d) => `${d.quantity > 1 ? `${d.quantity}× ` : ""}${d.type}`).join(" + ")]
        .filter(Boolean)
        .join(" — ") ||
      brand;

    return {
      brand,
      title,
      deal_date,
      platform: get("platform") || null,
      deliverables,
      amount: money.amount,
      is_barter: money.barter,
      stage: get("stage") ? parseStage(get("stage")) : "paid",
      contact_name: get("contact_name") || null,
      contact_email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
      link: get("link") || null,
      notes: get("notes") || null,
      warnings,
    };
  });
}
