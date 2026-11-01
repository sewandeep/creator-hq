// Understands short notes like:
//   "450 cab"              → ₹450 spent, Travel & cabs
//   "200 chai cash"        → ₹200 spent in cash
//   "lent 2000 to rahul"   → ₹2,000 lent to Rahul
//   "rahul returned 2000"  → ₹2,000 returned by Rahul
//   "got 5000 from priya"  → ₹5,000 received
//   "1.2k groceries yesterday"
// Shared by the web quick-add box and the Telegram bot (Phase 4).

export type QuickEntry = {
  amount: number;
  direction: "debit" | "credit";
  description: string;
  date: string;
  isCash: boolean;
  person: string | null;
  categoryHint: string | null;
};

const KEYWORDS: [RegExp, string][] = [
  [/\b(cab|uber|ola|auto|rapido|metro|bus|train|taxi|toll|parking|flight|irctc)\b/, "Travel & cabs"],
  [/\b(petrol|fuel|diesel|cng)\b/, "Fuel"],
  [/\b(food|lunch|dinner|breakfast|chai|tea|coffee|zomato|swiggy|snacks?|restaurant|cafe|pizza|biryani|drinks?|party)\b/, "Food & dining"],
  [/\b(grocer(y|ies)|vegetables?|veggies|fruits?|milk|blinkit|zepto|instamart|bigbasket|kirana)\b/, "Groceries"],
  [/\brent\b/, "Rent"],
  [/\b(recharge|wifi|internet|broadband|jio|airtel)\b/, "Phone & internet"],
  [/\b(electricity|water bill|gas|bescom|bill)\b/, "Bills & utilities"],
  [/\b(medicines?|doctor|pharmacy|hospital|clinic|tests?)\b/, "Health & medicines"],
  [/\b(movie|netflix|prime|hotstar|concert|game)\b/, "Entertainment"],
  [/\b(shopping|clothes|shoes|amazon|flipkart|myntra|ajio)\b/, "Shopping"],
  [/\b(haircut|salon|spa|grooming)\b/, "Personal care"],
  [/\b(gift|donation|charity)\b/, "Gifts & donations"],
  [/\b(mom|mum|dad|papa|mummy|family|home)\b/, "Family"],
  [/\b(sip|mutual fund|stocks?|shares|zerodha|groww|fd|ppf)\b/, "Investments"],
  [/\b(props?|shoot|camera|mic|lens|ring ?light|editing|editor|tripod|studio)\b/, "Creator work expenses"],
  [/\b(course|class|books?|tuition)\b/, "Education"],
  [/\b(emi|loan)\b/, "EMI & loans"],
];

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

function parseWhen(text: string, today: string): { date: string; rest: string } {
  const base = new Date(`${today}T00:00:00Z`);
  let rest = text;
  let date = today;
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => string | null) => {
    const m = rest.match(re);
    if (!m) return false;
    const d = fn(m);
    if (!d) return false;
    date = d;
    rest = rest.replace(m[0], " ");
    return true;
  };
  [
    () => take(/\bday before yesterday\b/, () => iso(new Date(base.getTime() - 2 * 864e5))),
    () => take(/\byesterday\b|\byday\b/, () => iso(new Date(base.getTime() - 864e5))),
    () => take(/\btoday\b/, () => today),
    () => take(/\bon (\d{1,2})(st|nd|rd|th)?(?:\s+([a-z]{3})[a-z]*)?\b/, (m) => {
      const day = Number(m[1]);
      const month = m[3] && MONTHS[m[3]] !== undefined ? MONTHS[m[3]] : base.getUTCMonth();
      let d = new Date(Date.UTC(base.getUTCFullYear(), month, day));
      if (d > base) d = new Date(Date.UTC(base.getUTCFullYear() - (m[3] ? 1 : 0), month - (m[3] ? 0 : 1), day));
      return d.getUTCDate() === day ? iso(d) : null;
    }),
    () => take(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/, (m) => {
      let y = m[3] ? Number(m[3]) : base.getUTCFullYear();
      if (y < 100) y += 2000;
      const d = new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[1])));
      return d.getUTCDate() === Number(m[1]) ? iso(d) : null;
    }),
  ].some((attempt) => attempt());
  return { date, rest };
}

function parseAmount(text: string): { amount: number; rest: string } | null {
  const m = text.match(/(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|l|lakh)?\b/i);
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, ""));
  if (m[2]?.toLowerCase() === "k") n *= 1000;
  else if (m[2]) n *= 100000;
  if (!(n > 0)) return null;
  return { amount: Math.round(n * 100) / 100, rest: text.replace(m[0], " ") };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function parseQuickEntry(raw: string, today: string): QuickEntry | null {
  const original = raw.trim().replace(/\s+/g, " ");
  if (!original) return null;
  const lower = original.toLowerCase();
  const when = parseWhen(lower, today);
  const amt = parseAmount(when.rest);
  if (!amt) return null;
  let rest = amt.rest.replace(/\s+/g, " ").trim();

  const isCash = /\b(cash|in cash)\b/.test(rest);
  rest = rest.replace(/\b(in cash|cash|paid|spent|for|on|rs|rupees|inr)\b/g, " ").replace(/\s+/g, " ").trim();

  let direction: "debit" | "credit" = "debit";
  let person: string | null = null;
  let categoryHint: string | null = null;

  const lent = rest.match(/\b(?:lent|lend|gave|given)\b(?: (?:to )?([a-z]+))?/);
  const returned = rest.match(/\b([a-z]+) (?:returned|paid back|gave back|repaid)\b|\b(?:returned|paid back|repaid|got back) (?:by |from )?([a-z]+)?/);
  if (/^\+/.test(original) || /\b(got|received|credited|income|salary|refund|cashback)\b/.test(rest)) direction = "credit";

  if (returned) {
    direction = "credit";
    person = returned[1] ?? returned[2] ?? null;
    categoryHint = "Money returned";
  } else if (lent) {
    direction = "debit";
    person = lent[1] ?? rest.match(/\bto ([a-z]+)/)?.[1] ?? null;
    categoryHint = "Lent money";
  } else {
    const who = direction === "credit" ? rest.match(/\bfrom ([a-z]+)/) : rest.match(/\bto ([a-z]+)/);
    if (who) person = who[1];
    if (direction === "credit" && /\bsalary\b/.test(rest)) categoryHint = "Salary & other income";
    else if (direction === "credit" && /\b(refund|cashback)\b/.test(rest)) categoryHint = "Refunds & cashback";
    else categoryHint = KEYWORDS.find(([re]) => re.test(rest))?.[1] ?? null;
  }
  if (person && ["to", "from", "by", "me", "the", "a"].includes(person)) person = null;

  return {
    amount: amt.amount,
    direction,
    description: original,
    date: when.date,
    isCash,
    person: person ? cap(person) : null,
    categoryHint,
  };
}
