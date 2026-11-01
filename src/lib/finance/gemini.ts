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

/** One generateContent call with model fallback (Flash → Flash-Lite on quota / availability problems). */
export async function callGemini(body: object): Promise<{ json: GeminiResponse; model: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AiError("The AI isn't set up yet — add GEMINI_API_KEY in Vercel (see Setup check).");
  const models = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL, ...DEFAULT_MODELS.filter((m) => m !== process.env.GEMINI_MODEL)] : DEFAULT_MODELS;

  let lastError = "";
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`${BASE}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
      }).catch((e: unknown) => {
        lastError = e instanceof Error ? e.message : String(e);
        return null;
      });
      if (!res) continue;
      if (res.ok) return { json: (await res.json()) as GeminiResponse, model };

      const text = await res.text();
      lastError = `${res.status}: ${text.slice(0, 300)}`;
      if (res.status === 400 && /API key/i.test(text)) throw new AiError("Gemini says the API key isn't valid. Check GEMINI_API_KEY in Vercel.");
      if (res.status === 429 || res.status === 404 || res.status === 403) break; // over quota / model not available → next model
      if (res.status >= 500) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      break;
    }
  }
  if (/429/.test(lastError)) throw new AiError("The free AI limit is used up for now. Try again in a few minutes (or tomorrow).");
  throw new AiError(`The AI couldn't answer. ${lastError}`);
}

export type GeminiPart = {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
  thought?: boolean;
  thoughtSignature?: string;
};
export type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };
export type GeminiResponse = { candidates?: { content?: GeminiContent; finishReason?: string }[] };

export async function generateJson<T>(opts: { system: string; parts: Part[]; schema: object }): Promise<{ data: T; model: string }> {
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const { json, model } = await callGemini({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: "user", parts: opts.parts }],
      generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: opts.schema },
    });
    const text = json.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
    try {
      return { data: JSON.parse(text) as T, model };
    } catch {
      last = json.candidates?.[0]?.finishReason ?? "unknown";
    }
  }
  throw new AiError(`The AI's answer was cut off or malformed (${last}).`);
}
