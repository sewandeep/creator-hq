export type ParsedRow = {
  seq: number;
  date: string;
  description: string;
  reference: string | null;
  amount: number;
  balance: number;
  direction: "debit" | "credit";
  counterparty?: string;
  note?: string | null;
};

/** A statement read by code (no AI): rows come without categories. */
export type ParsedStatement = {
  bank: string;
  account_last4: string | null;
  period_from: string | null;
  period_to: string | null;
  opening_balance: number | null;
  closing_balance: number | null;
  /** Rows whose direction couldn't be confirmed from the balance. */
  unsure: number;
  rows: ParsedRow[];
};
