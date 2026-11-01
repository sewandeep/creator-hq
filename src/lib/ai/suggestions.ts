// One-tap suggestions in the AI panel, depending on the screen you're on.
import type { ChatContext } from "@/app/(app)/ask/chat";

export function contextFor(pathname: string, search: URLSearchParams): ChatContext {
  const deal = search.get("deal") ?? pathname.match(/^\/deals\/([0-9a-f-]{36})/)?.[1];
  if (deal) return { type: "deal", id: deal };
  const brand = pathname.match(/^\/brands\/([0-9a-f-]{36})/)?.[1];
  if (brand) return { type: "brand", id: brand };
  const invoice = pathname.match(/^\/invoices\/([0-9a-f-]{36})/)?.[1];
  if (invoice) return { type: "invoice", id: invoice };
  const txn = pathname.match(/^\/money\/transactions\/([0-9a-f-]{36})/)?.[1];
  if (txn) return { type: "transaction", id: txn };
  return { type: "page", path: pathname === "/" ? "Today" : pathname.slice(1).split("/")[0] };
}

export function suggestionsFor(ctx: ChatContext): string[] {
  switch (ctx?.type) {
    case "deal":
      return ["Summarize this deal", "Draft the invoice for this", "Follow up on this on Friday", "Mark this as paid"];
    case "brand":
      return ["Summarize everything with this brand", "How fast do they pay?", "Draft a follow-up email"];
    case "invoice":
      return ["Write a payment reminder for this", "Has this been paid?"];
    case "transaction":
      return ["What was this payment?", "Mark all payments like this as Rent"];
    default:
      break;
  }
  const page = ctx?.path ?? "";
  if (page === "money") return ["Where did my money go this month?", "Who owes me money?", "Anything unusual this month?"];
  if (page === "deals") return ["Add a deal: Noise, 1 reel, 25k, due Friday", "Which deals need a follow-up?", "What's waiting for payment?"];
  if (page === "reports" || page === "history" || page === "insights" || page === "tax") return ["How much did I earn this year?", "What did brands pay per reel?", "Is my TDS matching 26AS?"];
  return ["Give me a rundown of this week", "What's due this week?", "How much did I spend this month?", "Who owes me money?"];
}
