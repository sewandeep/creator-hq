"use server";

import { requireUser } from "@/lib/auth";
import { IMPORT_FIELDS, buildRows, parseTable, type ColumnMapping } from "@/lib/import";
import { importRowsCore } from "@/lib/import-server";
import { refreshAll } from "./helpers";

export type ImportResult = {
  error?: string;
  deals?: number;
  brands?: number;
  skipped?: number;
};

const FIELD_IDS = new Set<string>(IMPORT_FIELDS.map((f) => f.id));

/**
 * Saves past collaborations. The raw text is parsed again here (not trusted
 * from the browser) using the same code as the preview.
 */
export async function importDeals(input: {
  text: string;
  mapping: ColumnMapping;
  hasHeader: boolean;
}): Promise<ImportResult> {
  const { supabase } = await requireUser();
  const mapping = input.mapping.map((m) => (FIELD_IDS.has(m) ? m : "")) as ColumnMapping;
  if (!mapping.includes("brand")) return { error: "Tell me which column has the brand name." };

  const table = parseTable(input.text);
  const rows = buildRows(input.hasHeader ? table.slice(1) : table, mapping);
  if (rows.length > 2000) return { error: "That's a lot! Import up to 2,000 rows at a time." };

  const r = await importRowsCore(supabase, rows);
  refreshAll();
  return r;
}
