import { parseQuickEntry } from "@/lib/finance/quick-add";

const QUESTION = /^(how|what|which|who|whom|when|where|why|show|give|tell|summar|list|can|could|should|would|is|are|do|did|does|make|create|add a deal|draft|write|help|explain|find|compare|remind|move|mark|change|update|send)\b/i;

/**
 * Short money notes like "450 cab", "lent 2000 to rahul" are saved instantly
 * (no AI needed, no AI quota used). Everything else goes to the assistant.
 */
export function isQuickEntry(text: string, today: string) {
  const t = text.trim();
  if (!t || t.includes("?") || t.includes("\n") || t.split(/\s+/).length > 9) return false;
  if (QUESTION.test(t)) return false;
  if (!parseQuickEntry(t, today)) return false;
  return /^(\+|₹|rs\.?\s*\d|\d)/i.test(t) || /^(lent|lend|gave|got|received|paid|spent)\b/i.test(t) || /^\w+ (returned|paid back|gave back|repaid)\b/i.test(t) || /\b\d[\d,.]*\s*(k|l)?\s+[a-z]/i.test(t) || /^[a-z][a-z ]{1,40} ₹?\d[\d,.]*\s*(k|l)?$/i.test(t);
}
