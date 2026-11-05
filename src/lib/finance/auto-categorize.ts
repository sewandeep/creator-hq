import "server-only";
import type { DB } from "@/app/actions/helpers";
import { groqJson, isGroqConfigured } from "@/lib/groq";
import type { Category } from "./categories-server";
import { findRule, matchText, type Rule } from "./categorize";
import { generateJson } from "./gemini";

// Sorting transactions into categories, cheapest and most reliable first:
//   1. your own "always use" rules (handled by the caller)
//   2. memory — how you sorted the same payee before
//   3. obvious patterns (bank charges, ATM, Zomato, petrol, SIPs…)
//   4. the AI, once, for the list of payees still unknown — not row by row.

export type CatRow = {
  description: string;
  counterparty: string | null;
  note?: string | null;
  upi_id?: string | null;
  direction: "debit" | "credit";
  amount: number;
  category: string;
  confidence: number;
  why: string;
  source?: "memory" | "pattern" | "ai";
};

/** One payee, however the bank spells it ("AMBER CHETTRI" = "Amber Chettri"). */
export function payeeKey(r: { counterparty?: string | null; description: string }) {
  const base = (r.counterparty || r.description.split(/[/|]/).slice(0, 2).join(" ")).toLowerCase().replace(/[^a-z0-9]+/g, "");
  return base.slice(0, 24);
}

type Pattern = { re: RegExp; category: string; dir?: "debit" | "credit"; confidence: number; why: string };
const PATTERNS: Pattern[] = [
  { re: /REM-CHRG|REVERSAL|REFUND/i, dir: "credit", category: "Refunds & cashback", confidence: 0.9, why: "Charge refunded" },
  { re: /CHRG|Chrg:|\bFEE\b|CHARGES|DCC Fee|RENEWAL FEE|SMS ALERT|GST ON/i, dir: "debit", category: "Bank fees & charges", confidence: 0.95, why: "Bank charge" },
  { re: /Sweep Tr/i, category: "Self transfer", confidence: 0.95, why: "Fixed-deposit sweep" },
  { re: /^(ATW|ATL|NWD)\b|ATM WDL|CASH WDL|CASH WITHDRAWAL/i, dir: "debit", category: "Cash withdrawal", confidence: 0.95, why: "ATM" },
  { re: /^Int\.?\s*Pd|INTEREST (PAID|CREDIT)|SB INT/i, dir: "credit", category: "Interest", confidence: 0.95, why: "Bank interest" },
  { re: /NACH-MUT|MUTUAL FUND|ZERODHA|GROWW|\bSIP\b|INDIAN CLEARING CORP/i, dir: "debit", category: "Investments", confidence: 0.9, why: "Mutual fund / SIP" },
  { re: /ZOMATO|SWIGGY|DOMINOS|MCDONALD|KFC|PIZZA HUT|DEVYANI|STARBUCKS/i, dir: "debit", category: "Food & dining", confidence: 0.9, why: "Food delivery / restaurant" },
  { re: /BLINKIT|ZEPTO|BIGBASKET|INSTAMART|DMART|RATION/i, dir: "debit", category: "Groceries", confidence: 0.85, why: "Groceries" },
  { re: /PETROL|FUEL|\bOIL\b|IOCL|HPCL|BPCL|INDIAN OIL|BHARAT PETROLEUM/i, dir: "debit", category: "Fuel", confidence: 0.85, why: "Petrol" },
  { re: /AIRTEL|\bJIO\b|RELIANCE JIO|VODAFONE|\bVI\b|BSNL|ACT FIBERNET/i, dir: "debit", category: "Phone & internet", confidence: 0.85, why: "Phone / internet" },
  { re: /NETFLIX|SPOTIFY|YOUTUBE ?GOOGLE|GOOGLE ?WORKSPACE|HOTSTAR|PRIME ?VIDEO|APPLE\.COM|ICLOUD|CANVA|CHATGPT|OPENAI/i, dir: "debit", category: "Subscriptions", confidence: 0.85, why: "Subscription" },
  { re: /UBER|OLA\b|RAPIDO/i, dir: "debit", category: "Travel & cabs", confidence: 0.85, why: "Cab" },
  { re: /AMAZON|FLIPKART|MYNTRA|AJIO|MEESHO|NYKAA/i, dir: "debit", category: "Shopping", confidence: 0.7, why: "Online shopping" },
];

function patternFor(r: CatRow, ownerNames: string[], names: Set<string>): Omit<Pattern, "re"> | null {
  const text = `${r.description} ${r.counterparty ?? ""} ${r.note ?? ""}`;
  // Money between your own accounts.
  const cp = (r.counterparty ?? "").toLowerCase().replace(/\s+/g, " ");
  if (ownerNames.some((n) => n.length >= 6 && cp.startsWith(n.slice(0, Math.min(n.length, cp.length)))) && cp.length >= 6) {
    return { category: "Self transfer", confidence: 0.9, why: "To/from your own account" };
  }
  if (/sajilo/i.test(text)) {
    if (r.direction === "credit") {
      return /salary|bonus|incentive|stipend/i.test(text)
        ? { category: "Sajilo income", confidence: 0.95, why: "Salary from Sajilo" }
        : { category: "Sajilo reimbursements", confidence: 0.6, why: "Money from Sajilo" };
    }
    return { category: "Sajilo expenses", confidence: 0.6, why: "Paid to Sajilo" };
  }
  for (const p of PATTERNS) {
    if (p.dir && p.dir !== r.direction) continue;
    if (p.re.test(text) && names.has(p.category.toLowerCase())) return p;
  }
  return null;
}

/** How you've sorted each payee before (only choices you made or confirmed). */
async function loadMemory(db: DB) {
  const { data } = await db
    .from("transactions")
    .select("counterparty, description, direction, category_id, category_source, needs_review")
    .not("category_id", "is", null)
    .eq("needs_review", false)
    .in("category_source", ["user", "rule", "match"])
    .order("txn_date", { ascending: false })
    .limit(5000);
  const votes = new Map<string, Map<string, number>>();
  for (const t of data ?? []) {
    const k = `${payeeKey(t)}|${t.direction}`;
    if (k.startsWith("|")) continue;
    const m = votes.get(k) ?? new Map<string, number>();
    m.set(t.category_id!, (m.get(t.category_id!) ?? 0) + (t.category_source === "user" ? 2 : 1));
    votes.set(k, m);
  }
  const memory = new Map<string, { categoryId: string; share: number; count: number }>();
  for (const [k, m] of votes) {
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    const [categoryId, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    memory.set(k, { categoryId, share: n / total, count: total });
  }
  return memory;
}

type AiPayee = { k: string; payee: string; direction: "money out" | "money in"; times: number; total: number; notes: string[]; example: string };
type AiAnswer = { items: { k: string; category: string; confidence: number; why: string }[] };

const AI_SYSTEM = (cats: Category[]) => `You sort bank payments for an Indian content creator who also runs a small business called Sajilo (Sajilo Services). You get a list of payees from their bank statement. For each payee pick ONE category from this list (use the exact name), or "Uncategorized":
${cats.map((c) => `- ${c.name} (${c.kind})`).join("\n")}

Rules:
- A person's name with no clear purpose (UPI to/from an individual) → "Uncategorized", confidence 0.3. Do not guess a category for people.
- Use the notes: "Petrol" → Fuel, "Snacks"/"Samosa"/"Wai wai" → Food & dining, "Rice"/"Ration" → Groceries, "EMI" → EMI & loans, "Salary" → income.
- Brands/companies paying money in (NEFT/IMPS from a company) are probably "Creator income" (confidence 0.6).
- Facebook/Instagram/Google ads → "Creator work expenses" unless the note mentions Sajilo.
- confidence: 0.9+ only when obvious from the name or note.
- why: at most 5 words.
Answer as JSON: {"items":[{"k":"<k>","category":"<name>","confidence":0.0,"why":"..."}]}`;

async function askAi(cats: Category[], payees: AiPayee[]): Promise<AiAnswer["items"]> {
  const user = `Payees:\n${JSON.stringify(payees)}`;
  if (isGroqConfigured()) {
    try {
      const r = await groqJson<AiAnswer>({ system: AI_SYSTEM(cats), user });
      if (Array.isArray(r.items)) return r.items;
    } catch (e) {
      console.warn("groq categorise failed, trying Gemini", e);
    }
  }
  const r = await generateJson<AiAnswer>({
    system: AI_SYSTEM(cats),
    parts: [{ text: user }],
    timeoutMs: 60_000,
    schema: {
      type: "OBJECT",
      properties: {
        items: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: { k: { type: "STRING" }, category: { type: "STRING" }, confidence: { type: "NUMBER" }, why: { type: "STRING" } },
            required: ["k", "category", "confidence", "why"],
          },
        },
      },
      required: ["items"],
    },
  });
  return r.data.items ?? [];
}

/**
 * Fills in category / confidence / why / source on each row (in place).
 * Rows your rules already cover are left for the caller.
 */
export async function autoCategorize(
  db: DB,
  rows: CatRow[],
  opts: { categories: Category[]; rules: Rule[]; useAi: boolean; ownerName?: string | null; step?: (text: string) => Promise<void> },
) {
  const byId = new Map(opts.categories.map((c) => [c.id, c]));
  const names = new Set(opts.categories.map((c) => c.name.toLowerCase()));
  const ownerNames = (opts.ownerName ?? "")
    .toLowerCase()
    .split(/[,/]/)
    .map((n) => n.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  const memory = await loadMemory(db);
  const stats = { rule: 0, memory: 0, pattern: 0, ai: 0, unsure: 0 };

  const open: CatRow[] = [];
  for (const r of rows) {
    if (findRule(opts.rules, matchText({ counterparty: r.counterparty, upi_id: r.upi_id ?? null, description: r.description }), r.direction)) {
      stats.rule++;
      continue;
    }
    const mem = memory.get(`${payeeKey(r)}|${r.direction}`);
    if (mem && mem.share >= 0.6 && byId.has(mem.categoryId)) {
      const cat = byId.get(mem.categoryId)!;
      r.category = cat.name;
      r.confidence = mem.share >= 0.9 ? 0.95 : 0.8;
      r.why = `Same as before for ${r.counterparty || "this payee"}`;
      r.source = "memory";
      stats.memory++;
      continue;
    }
    const p = patternFor(r, ownerNames, names);
    if (p) {
      r.category = p.category;
      r.confidence = p.confidence;
      r.why = p.why;
      r.source = "pattern";
      stats.pattern++;
      continue;
    }
    if (opts.useAi) open.push(r);
  }

  if (opts.useAi && open.length) {
    // One entry per payee, not per row.
    const groups = new Map<string, CatRow[]>();
    for (const r of open) {
      const k = `${payeeKey(r)}|${r.direction}`;
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    const payees: AiPayee[] = [...groups.entries()].map(([k, list], i) => ({
      k: String(i + 1),
      payee: list[0].counterparty || list[0].description.slice(0, 40),
      direction: list[0].direction === "debit" ? "money out" : "money in",
      times: list.length,
      total: Math.round(list.reduce((s, r) => s + r.amount, 0)),
      notes: [...new Set(list.map((r) => r.note).filter((n): n is string => Boolean(n)))].slice(0, 4),
      example: list[0].description.slice(0, 80),
      _key: k,
    })) as (AiPayee & { _key: string })[];
    await opts.step?.(`Asking the AI about ${payees.length} payee${payees.length === 1 ? "" : "s"} it hasn't seen before`);

    const batches: (AiPayee & { _key: string })[][] = [];
    for (let i = 0; i < payees.length; i += 60) batches.push((payees as (AiPayee & { _key: string })[]).slice(i, i + 60));
    let next = 0;
    const worker = async () => {
      while (next < batches.length) {
        const batch = batches[next++];
        let answers: AiAnswer["items"] = [];
        try {
          answers = await askAi(opts.categories, batch.map((p) => ({ k: p.k, payee: p.payee, direction: p.direction, times: p.times, total: p.total, notes: p.notes, example: p.example })));
        } catch (e) {
          console.warn("AI categorise batch failed", e);
        }
        const byK = new Map(answers.map((a) => [String(a.k), a]));
        for (const p of batch) {
          const a = byK.get(p.k);
          const ok = a && names.has(String(a.category).toLowerCase());
          for (const r of groups.get(p._key) ?? []) {
            r.category = ok ? opts.categories.find((c) => c.name.toLowerCase() === String(a!.category).toLowerCase())!.name : "Uncategorized";
            r.confidence = ok ? Math.max(0, Math.min(1, Number(a!.confidence) || 0)) : 0.2;
            r.why = (a?.why ?? "Not sure what this was").slice(0, 60);
            r.source = "ai";
            if (ok) stats.ai++;
            else stats.unsure++;
          }
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, batches.length) }, worker));
  }
  return stats;
}
