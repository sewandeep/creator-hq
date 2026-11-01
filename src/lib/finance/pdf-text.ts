import "server-only";
import { getDocumentProxy } from "unpdf";

export class PdfPasswordError extends Error {
  constructor(public wrongPassword: boolean) {
    super(wrongPassword ? "That PDF password didn't work." : "This PDF is password-protected.");
  }
}

type Item = { str: string; x: number; y: number; w: number };

/**
 * Reads the text of a statement PDF and rebuilds each printed line, with
 * " | " between columns, so table rows stay intact. Handles password-protected
 * PDFs (e.g. SBI). Returns one string per page.
 */
export async function extractPdfPages(data: Uint8Array, password?: string): Promise<string[]> {
  let doc;
  try {
    doc = await getDocumentProxy(new Uint8Array(data), password ? { password } : {});
  } catch (e) {
    const err = e as { name?: string; code?: number };
    if (err?.name === "PasswordException") throw new PdfPasswordError(err.code === 2);
    throw e;
  }

  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: Item[] = [];
    for (const it of content.items as { str?: string; transform?: number[]; width?: number }[]) {
      if (!it.str || !it.transform || !it.str.trim()) continue;
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width ?? 0 });
    }
    // Group into lines by vertical position (top of page first).
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: Item[][] = [];
    for (const it of items) {
      const line = lines.find((l) => Math.abs(l[0].y - it.y) < 2.5);
      if (line) line.push(it);
      else lines.push([it]);
    }
    lines.sort((a, b) => b[0].y - a[0].y);
    const text = lines
      .map((l) => {
        l.sort((a, b) => a.x - b.x);
        let out = "";
        let end = -Infinity;
        for (const it of l) {
          const gap = it.x - end;
          if (out) out += gap > 6 ? " | " : gap > 0.8 ? " " : "";
          out += it.str.trim();
          end = it.x + it.w;
        }
        return out;
      })
      .join("\n");
    pages.push(text);
  }
  await doc.cleanup?.();
  return pages;
}

/** Hide long digit runs (account / card numbers) before text leaves the app. Keeps the last 4. */
export function maskAccountNumbers(text: string) {
  return text.replace(/\b(\d[\d ]{7,}\d)\b/g, (m) => {
    const digits = m.replace(/\s/g, "");
    if (digits.length < 9 || digits.length > 20) return m;
    return `XXXX${digits.slice(-4)}`;
  });
}
