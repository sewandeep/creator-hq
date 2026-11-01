import "server-only";

// Talks to Google's Gemini API (free tier) with plain fetch.
// GEMINI_API_KEY comes from aistudio.google.com/apikey.
// GEMINI_MODEL can pin a model; otherwise we try the best Flash model and fall
// back to Flash-Lite (bigger free daily limit) if it's busy or over quota.

const BASE = process.env.GEMINI_BASE_URL?.replace(/\/+$/, "") || "https://generativelanguage.googleapis.com";
const DEFAULT_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite"];

export function isAiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export class AiError extends Error {}

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

export async function generateJson<T>(opts: { system: string; parts: Part[]; schema: object }): Promise<{ data: T; model: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AiError("The AI reader isn't set up yet — add GEMINI_API_KEY in Vercel (see Setup check).");
  const models = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL, ...DEFAULT_MODELS.filter((m) => m !== process.env.GEMINI_MODEL)] : DEFAULT_MODELS;

  let lastError = "";
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`${BASE}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: opts.system }] },
          contents: [{ role: "user", parts: opts.parts }],
          generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: opts.schema },
        }),
      }).catch((e: unknown) => {
        lastError = e instanceof Error ? e.message : String(e);
        return null;
      });
      if (!res) continue;

      if (res.ok) {
        const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[] };
        const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
        try {
          return { data: JSON.parse(text) as T, model };
        } catch {
          lastError = `The AI's answer was cut off or malformed (${json.candidates?.[0]?.finishReason ?? "unknown"}).`;
          continue; // retry once, then next model
        }
      }

      const body = await res.text();
      lastError = `${res.status}: ${body.slice(0, 300)}`;
      if (res.status === 400 && /API key/i.test(body)) throw new AiError("Gemini says the API key isn't valid. Check GEMINI_API_KEY in Vercel.");
      if (res.status === 429 || res.status === 404 || res.status === 403) break; // over quota / model not available → next model
      if (res.status >= 500) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      break;
    }
  }
  if (/429/.test(lastError)) throw new AiError("The free AI limit for today is used up. Try again tomorrow (or in a few minutes).");
  throw new AiError(`The AI couldn't read this statement. ${lastError}`);
}
