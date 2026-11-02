// Starter categories for Indian personal finance. You can rename, add or
// remove them later. "kind" decides how a category counts in reports:
//   expense  → spending        income   → money in
//   transfer → moves between your own accounts / cash (not spending)
//   savings  → investments (money kept, not spent)
//   lending  → money lent to / returned by people

export type CategoryKind = "expense" | "income" | "transfer" | "savings" | "lending";

export const DEFAULT_CATEGORIES: { name: string; kind: CategoryKind; emoji: string; is_business?: boolean }[] = [
  { name: "Food & dining", kind: "expense", emoji: "🍽️" },
  { name: "Groceries", kind: "expense", emoji: "🛒" },
  { name: "Travel & cabs", kind: "expense", emoji: "🚕" },
  { name: "Fuel", kind: "expense", emoji: "⛽" },
  { name: "Shopping", kind: "expense", emoji: "🛍️" },
  { name: "Rent", kind: "expense", emoji: "🏠" },
  { name: "Bills & utilities", kind: "expense", emoji: "💡" },
  { name: "Phone & internet", kind: "expense", emoji: "📶" },
  { name: "Subscriptions", kind: "expense", emoji: "🔁" },
  { name: "Health & medicines", kind: "expense", emoji: "💊" },
  { name: "Personal care", kind: "expense", emoji: "💇" },
  { name: "Entertainment", kind: "expense", emoji: "🎬" },
  { name: "Trips & holidays", kind: "expense", emoji: "✈️" },
  { name: "Family", kind: "expense", emoji: "👨‍👩‍👧" },
  { name: "Gifts & donations", kind: "expense", emoji: "🎁" },
  { name: "Education", kind: "expense", emoji: "📚" },
  { name: "Insurance", kind: "expense", emoji: "🛡️" },
  { name: "EMI & loans", kind: "expense", emoji: "🏦" },
  { name: "Bank fees & charges", kind: "expense", emoji: "🧾" },
  { name: "Taxes", kind: "expense", emoji: "🏛️" },
  { name: "Creator work expenses", kind: "expense", emoji: "🎥", is_business: true },
  { name: "Other spending", kind: "expense", emoji: "📦" },
  { name: "Creator income", kind: "income", emoji: "💼" },
  { name: "Salary & other income", kind: "income", emoji: "💰" },
  { name: "Interest", kind: "income", emoji: "📈" },
  { name: "Refunds & cashback", kind: "income", emoji: "↩️" },
  { name: "Investments", kind: "savings", emoji: "📊" },
  { name: "Self transfer", kind: "transfer", emoji: "🔄" },
  { name: "Cash withdrawal", kind: "transfer", emoji: "🏧" },
  { name: "Credit card bill", kind: "transfer", emoji: "💳" },
  { name: "Sajilo income", kind: "income", emoji: "🏢" },
  { name: "Sajilo expenses", kind: "expense", emoji: "🏢" },
  { name: "Lent money", kind: "lending", emoji: "🤝" },
  { name: "Money returned", kind: "lending", emoji: "🙌" },
];

export const KIND_LABEL: Record<CategoryKind, string> = {
  expense: "Spending",
  income: "Income",
  transfer: "Transfer (not spending)",
  savings: "Savings / investment",
  lending: "Lending",
};

/** Categories named "Sajilo …" belong to the Sajilo business: kept out of personal totals and shown on their own. */
export const isSajilo = (name: string | null | undefined) => /^sajilo\b/i.test((name ?? "").trim());

/** Categories added after launch: created once for accounts that already had their starter set. */
export const ADDED_LATER = ["Sajilo income", "Sajilo expenses"];
