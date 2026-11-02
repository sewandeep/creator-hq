import "server-only";
import { EXTRACT_MODELS, generateJson } from "./gemini";
import { maskAccountNumbers } from "./pdf-text";

export type AiRow = {
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number | null;
  reference: string | null;
  counterparty: string;
  upi_id: string | null;
  category: string;
  confidence: number;
  why: string;
};

type AiResult = {
  account_last4: string | null;
  period_from: string | null;
  period_to: string | null;
  opening_balance: number | null;
  closing_balance: number | null;
  transactions: AiRow[];
};

function schema(categoryNames: string[]) {
  const nullable = (type: string) => ({ type, nullable: true });
  return {
    type: "OBJECT",
    properties: {
      account_last4: nullable("STRING"),
      period_from: { ...nullable("STRING"), description: "Statement start date, YYYY-MM-DD" },
      period_to: { ...nullable("STRING"), description: "Statement end date, YYYY-MM-DD" },
      opening_balance: nullable("NUMBER"),
      closing_balance: nullable("NUMBER"),
      transactions: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            date: { type: "STRING", description: "Transaction date, YYYY-MM-DD" },
            description: { type: "STRING", description: "Full narration exactly as printed (join wrapped lines)" },
            debit: { type: "NUMBER", description: "Withdrawal amount, 0 if none" },
            credit: { type: "NUMBER", description: "Deposit amount, 0 if none" },
            balance: { ...nullable("NUMBER"), description: "Running balance printed on the row" },
            reference: nullable("STRING"),
            counterparty: { type: "STRING", description: "Who the money went to / came from, in plain words" },
            upi_id: nullable("STRING"),
            category: { type: "STRING", enum: [...categoryNames, "Uncategorized"] },
            confidence: { type: "NUMBER", description: "0 to 1 — how sure you are about the category" },
            why: { type: "STRING", description: "At most 4 words on why this category" },
          },
          required: ["date", "description", "debit", "credit", "counterparty", "category", "confidence", "why"],
        },
      },
    },
    required: ["transactions"],
  };
}

const SYSTEM = `You read Indian bank statements (Kotak, SBI, HDFC, ICICI, Axis and others) and turn them into clean data.

Rules:
- Return EVERY transaction row exactly once, in the order printed. Never invent, merge or skip rows.
- Skip headers, page numbers, "opening balance" / "closing balance" / "balance brought forward" lines and summary totals — but report the opening and closing balance figures separately.
- Dates in Indian statements are day-first (03-10-2026 = 3 October 2026). Output YYYY-MM-DD.
- debit = money that left the account (withdrawal / Dr). credit = money that came in (deposit / Cr). Exactly one of them is non-zero. Use the running balance to tell which: if the balance went down it's a debit.
- Amounts are plain numbers without commas or ₹.
- If a narration wraps onto the next line, join it into one description.
- counterparty: the merchant, company or person in plain words (e.g. "Zomato", "Uber", "Rahul Sharma", "Swiggy (Bundl Technologies)").
- Categorise using ONLY the given category names. Hints:
  - Payments from companies/brands by NEFT/IMPS/RTGS (collab, invoice, campaign, marketing agency) → "Creator income".
  - ATM / cash withdrawal → "Cash withdrawal". Transfers between the account holder's own accounts → "Self transfer".
  - SIP, mutual funds, Zerodha, Groww, stocks, PPF, FD → "Investments". Bank interest → "Interest".
  - Card annual fees, SMS charges, GST on charges → "Bank fees & charges".
  - Ring lights, cameras, mics, props, editing software → "Creator work expenses".
  - The owner also runs a business called Sajilo. Money in or out that mentions Sajilo, or is clearly for that business → "Sajilo income" / "Sajilo expenses" (only if those names are in the list). When unsure whether it's Sajilo or personal, use confidence below 0.6.
  - UPI to a person's name with no clear purpose → "Uncategorized" with confidence below 0.5 (the owner will tell us).
- confidence: 0.9+ only when the merchant makes it obvious.`;

/** Groups page texts into chunks small enough for one AI call. */
function chunk(pages: string[], maxChars = 9000) {
  const chunks: string[] = [];
  let cur = "";
  pages.forEach((p, i) => {
    const block = `--- Page ${i + 1} ---\n${p}\n`;
    if (cur && cur.length + block.length > maxChars) {
      chunks.push(cur);
      cur = "";
    }
    cur += block;
  });
  if (cur) chunks.push(cur);
  return chunks;
}

export type Extracted = Omit<AiResult, "transactions"> & { rows: AiRow[]; model: string };

/** Sends the statement text (or, for scanned PDFs, the PDF itself) to the AI. */
export async function extractWithAi(
  input: { pages: string[] } | { pdfBase64: string },
  categoryNames: string[],
  onProgress?: (done: number, total: number) => Promise<void> | void,
): Promise<Extracted> {
  const s = schema(categoryNames);
  let results: AiResult[] = [];
  let model = "";
  if ("pdfBase64" in input) {
    const r = await generateJson<AiResult>({
      system: SYSTEM,
      schema: s,
      models: EXTRACT_MODELS,
      parts: [{ text: "Here is the bank statement PDF. Extract every transaction." }, { inlineData: { mimeType: "application/pdf", data: input.pdfBase64 } }],
    });
    results.push(r.data);
    model = r.model;
  } else {
    // Read the parts of the statement at the same time (a few at once) — much faster than one by one.
    const parts = chunk(input.pages.map(maskAccountNumbers));
    results = new Array(parts.length);
    let done = 0;
    let next = 0;
    const worker = async () => {
      while (next < parts.length) {
        const i = next++;
        const r = await generateJson<AiResult>({
          system: SYSTEM,
          schema: s,
          models: EXTRACT_MODELS,
          parts: [{ text: `Bank statement text, part ${i + 1} of ${parts.length} (columns separated by " | "):\n\n${parts[i]}` }],
        });
        results[i] = r.data;
        model = r.model;
        await onProgress?.(++done, parts.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, parts.length) }, worker));
  }
  const first = results[0];
  const last = results[results.length - 1];
  return {
    account_last4: results.map((r) => r.account_last4).find(Boolean) ?? null,
    period_from: results.map((r) => r.period_from).find(Boolean) ?? null,
    period_to: [...results].reverse().map((r) => r.period_to).find(Boolean) ?? null,
    opening_balance: first?.opening_balance ?? null,
    closing_balance: last?.closing_balance ?? results.map((r) => r.closing_balance).filter((x) => x !== null).at(-1) ?? null,
    rows: results.flatMap((r) => r.transactions ?? []),
    model,
  };
}
