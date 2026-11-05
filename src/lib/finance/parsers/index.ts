import { looksLikeKotak, parseKotak } from "./kotak";
import type { ParsedStatement } from "./types";

export type { ParsedStatement, ParsedRow } from "./types";

/**
 * Banks we can read with plain code — instant, free and private. Returns null
 * for other banks (the AI reads those instead).
 */
export function parseKnownStatement(pages: string[]): ParsedStatement | null {
  if (looksLikeKotak(pages)) {
    const r = parseKotak(pages);
    // Only trust it if nearly every row checked out against the balance.
    if (r && r.rows.length && r.unsure <= Math.max(2, r.rows.length * 0.02)) return r;
  }
  return null;
}
