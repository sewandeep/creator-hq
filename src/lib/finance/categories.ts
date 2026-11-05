// Starter categories for Indian personal finance. You can rename, add or
// remove them later. "kind" decides how a category counts in reports:
//   expense     → spending (money out)         income      → money in, by stream
//   transfer    → between your own accounts / cash (not spending)
//   savings     → investments (money kept, not spent)
//   lending     → lent / got back / borrowed / paid back, per person
//   family      → money given to or received from family (its own bucket)
//   passthrough → came in only to go out again (counted as neither)
// "direction" says which way the money goes: the app only offers categories
// that fit a transaction (spending for money out, income for money in…).

export type CategoryKind = "expense" | "income" | "transfer" | "savings" | "lending" | "family" | "passthrough";
export type CategoryDirection = "out" | "in" | "both";
export type IncomeStream = "creator" | "freelance" | "sajilo" | "other";

type Def = { name: string; kind: CategoryKind; emoji: string; is_business?: boolean; direction: CategoryDirection; stream?: IncomeStream };
const out = (name: string, emoji: string, extra: Partial<Def> = {}): Def => ({ name, kind: "expense", emoji, direction: "out", ...extra });
const inc = (name: string, emoji: string, stream: IncomeStream): Def => ({ name, kind: "income", emoji, direction: "in", stream });

export const DEFAULT_CATEGORIES: Def[] = [
  out("Food & dining", "🍽️"),
  out("Groceries", "🛒"),
  out("Travel & cabs", "🚕"),
  out("Fuel", "⛽"),
  out("Shopping", "🛍️"),
  out("Rent", "🏠"),
  out("Bills & utilities", "💡"),
  out("Phone & internet", "📶"),
  out("Subscriptions", "🔁"),
  out("Health & medicines", "💊"),
  out("Personal care", "💇"),
  out("Entertainment", "🎬"),
  out("Trips & holidays", "✈️"),
  out("Gifts & donations", "🎁"),
  out("Education", "📚"),
  out("Insurance", "🛡️"),
  out("EMI & loans", "🏦"),
  out("Bank fees & charges", "🧾"),
  out("Taxes", "🏛️"),
  out("Studio & equipment", "🎬", { is_business: true }),
  out("Creator work expenses", "🎥", { is_business: true }),
  out("Other spending", "📦"),
  inc("Creator income", "💼", "creator"),
  inc("Freelance income", "🧑‍💻", "freelance"),
  inc("Other income", "💰", "other"),
  inc("Interest", "📈", "other"),
  inc("Investment returns", "📈", "other"),
  inc("Refunds & cashback", "↩️", "other"),
  { name: "Investments", kind: "savings", emoji: "📊", direction: "both" },
  { name: "Self transfer", kind: "transfer", emoji: "🔄", direction: "both" },
  { name: "Cash withdrawal", kind: "transfer", emoji: "🏧", direction: "out" },
  { name: "Credit card bill", kind: "transfer", emoji: "💳", direction: "out" },
  { name: "Family", kind: "family", emoji: "👨‍👩‍👧", direction: "both" },
  { name: "Lent money", kind: "lending", emoji: "🤝", direction: "out" },
  { name: "Money returned", kind: "lending", emoji: "🙌", direction: "in" },
  { name: "Borrowed", kind: "lending", emoji: "🙏", direction: "in" },
  { name: "Paid back a loan", kind: "lending", emoji: "↩️", direction: "out" },
  { name: "Pass-through", kind: "passthrough", emoji: "🔀", direction: "both" },
  inc("Sajilo income", "🏢", "sajilo"),
  inc("Sajilo reimbursements", "🏢", "sajilo"),
  out("Sajilo expenses", "🏢"),
];

/** Can this category be used for a transaction going this way? */
export function fitsDirection(c: { direction?: string | null }, txnDirection: "debit" | "credit") {
  const d = c.direction ?? "both";
  return d === "both" || (d === "out" ? txnDirection === "debit" : txnDirection === "credit");
}

/** Plain words for what a lending entry means, by category. */
export const LENDING_WORDS: Record<string, string> = {
  "Lent money": "Lent",
  "Money returned": "Got back",
  Borrowed: "Borrowed",
  "Paid back a loan": "Paid back",
};

export const KIND_LABEL: Record<CategoryKind, string> = {
  family: "Family (two-way)",
  passthrough: "Pass-through (not counted)",
  expense: "Spending",
  income: "Income",
  transfer: "Transfer (not spending)",
  savings: "Savings / investment",
  lending: "Lending & borrowing",
};

/** Categories named "Sajilo …" belong to the Sajilo business: kept out of personal totals and shown on their own. */
export const isSajilo = (name: string | null | undefined) => /^sajilo\b/i.test((name ?? "").trim());

/** Categories added after launch: created once for accounts that already had their starter set. */
export const ADDED_LATER = ["Sajilo income", "Sajilo expenses", "Sajilo reimbursements"];
