import "server-only";
import readXlsxFile from "read-excel-file/node";
import type { DB } from "@/app/actions/helpers";
import type { GeminiPart } from "@/lib/finance/gemini";
import { PdfPasswordError, extractPdfPages, maskAccountNumbers } from "@/lib/finance/pdf-text";

export type InFile = { name: string; mime: string; bytes: Uint8Array };
export type FileRef = { id: string; path: string; name: string; mime: string; kind: string };

const MAX_TEXT = 40_000;

function kindOf(f: InFile) {
  const n = f.name.toLowerCase();
  if (f.mime === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (f.mime.startsWith("image/")) return "image";
  if (f.mime.startsWith("audio/") || /\.(ogg|oga|opus|mp3|m4a|wav|webm|aac)$/.test(n)) return "audio";
  if (/\.(xlsx|xlsm)$/.test(n) || f.mime.includes("spreadsheetml")) return "excel";
  if (/\.(csv|tsv|txt|md)$/.test(n) || f.mime.startsWith("text/")) return "text";
  return "other";
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Saves each file privately (so a confirmed action can use it later) and turns
 * it into something the AI can read.
 */
export async function prepareFiles(supabase: DB, userId: string, files: InFile[]) {
  const refs: FileRef[] = [];
  const parts: GeminiPart[] = [];
  for (const [i, f] of files.entries()) {
    const id = `f${i + 1}`;
    const kind = kindOf(f);
    const mime = f.mime.split(";")[0].trim() || "application/octet-stream";
    const safe = f.name.replace(/[^\w.\- ]+/g, "_").slice(-100) || "file";
    const path = `${userId}/${crypto.randomUUID()}-${safe}`;
    const { error } = await supabase.storage.from("inbox").upload(path, f.bytes, { contentType: mime });
    if (error) throw new Error(`Couldn't store ${f.name}: ${error.message}`);
    refs.push({ id, path, name: f.name, mime, kind });

    const label = `Attached file ${id}: "${f.name}" (${kind})`;
    try {
      if (kind === "pdf") {
        try {
          const pages = await extractPdfPages(f.bytes);
          const text = maskAccountNumbers(pages.map((p, n) => `--- Page ${n + 1} ---\n${p}`).join("\n"));
          if (text.replace(/\s|-|Page \d+/g, "").length < 100) {
            parts.push({ text: `${label}. It's a scanned PDF — the document itself is attached next.` });
            parts.push({ inlineData: { mimeType: "application/pdf", data: Buffer.from(f.bytes).toString("base64") } });
          } else {
            parts.push({ text: `${label}. Text of the PDF (${pages.length} pages, account numbers masked):\n${text.slice(0, MAX_TEXT)}${text.length > MAX_TEXT ? "\n[…cut off]" : ""}` });
          }
        } catch (e) {
          if (e instanceof PdfPasswordError) parts.push({ text: `${label}. This PDF is password-protected, so it can't be read yet. Password-protected PDFs are almost always bank statements (e.g. SBI).` });
          else throw e;
        }
      } else if (kind === "image" || kind === "audio") {
        parts.push({ text: `${label}.${kind === "audio" ? " It's a voice note — listen to it and act on what was said." : ""}` });
        parts.push({ inlineData: { mimeType: kind === "audio" && mime === "video/webm" ? "audio/webm" : mime, data: Buffer.from(f.bytes).toString("base64") } });
      } else if (kind === "excel") {
        const sheets = await readXlsxFile(Buffer.from(f.bytes));
        const text = sheets
          .map((s) => `Sheet "${s.sheet}":\n${s.data.slice(0, 400).map((r) => r.map(csvCell).join(",")).join("\n")}`)
          .join("\n\n");
        parts.push({ text: `${label}. Spreadsheet as CSV:\n${text.slice(0, MAX_TEXT)}` });
      } else if (kind === "text") {
        const text = new TextDecoder().decode(f.bytes);
        parts.push({ text: `${label}. Contents:\n${text.slice(0, MAX_TEXT)}` });
      } else {
        parts.push({ text: `${label}. This file type can't be read — ask for a PDF, image, voice note, CSV or Excel file.` });
      }
    } catch (e) {
      parts.push({ text: `${label}. Couldn't open it: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  return { refs, parts };
}
