import "server-only";

// Talks to Google's Gemini API (free tier) with plain fetch.
// GEMINI_API_KEY comes from aistudio.google.com/apikey.
// GEMINI_MODEL can pin a model; otherwise we try the best Flash model and fall
// back to Flash-Lite (bigger free daily limit) if it's busy or over quota.

const BASE = process.env.GEMINI_BASE_URL?.replace(/\/+$/, "") || "https://generativelanguage.googleapis.com";
const DEFAULT_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite"];
// Reading statement rows is simple copying work: the faster Flash-Lite model is
// quicker and has a much bigger free daily limit; the balance check catches mistakes.
export const EXTRACT_MODELS = ["gemini-3.5-flash-lite", "gemini-3.8-flash"];

export function isAiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export class AiError extends Error {}

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

/** One generateContent call with model fallback (Flash → Flash-Lite on quota / availability problems). */
export async function callGemini(body: object, preferred: string[] = DEFAULT_MODELS, timeoutMs = 45_000): Promise<{ json: GeminiResponse; model: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AiError("The AI isn't set up yet — add GEMINI_API_KEY in Vercel (see Setup check).");
  const pinned = preferred === EXTRACT_MODELS ? process.env.GEMINI_EXTRACT_MODEL : process.env.GEMINI_MODEL;
  const models = pinned ? [pinned, ...preferred.filter((m) => m !== pinned)] : preferred;

  let lastError = "";
  // Fast by default: Gemini 3 thinks at "high" unless told otherwise.
  let payload = body as Record<string, unknown>;
  const gen = (payload.generationConfig ?? {}) as Record<string, unknown>;
  if (!gen.thinkingConfig) payload = { ...payload, generationConfig: { ...gen, thinkingConfig: { thinkingLevel: "low" } } };
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`${BASE}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(payload),
        // Never wait forever: a stuck call fails clearly and the next model gets a go.
        signal: AbortSignal.timeout(timeoutMs),
      }).catch((e: unknown) => {
        const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
        lastError = timedOut ? `no answer within ${Math.round(timeoutMs / 1000)} seconds` : e instanceof Error ? e.message : String(e);
        return timedOut ? ("timeout" as const) : null;
      });
      if (res === "timeout") break;
      if (!res) continue;
      if (res.ok) return { json: (await res.json()) as GeminiResponse, model };

      const text = await res.text();
      lastError = `${res.status}: ${text.slice(0, 300)}`;
      if (res.status === 400 && /API key/i.test(text)) throw new AiError("Gemini says the API key isn't valid. Check GEMINI_API_KEY in Vercel.");
      if (res.status === 400 && /thinking/i.test(text) && payload !== body) {
        // This model doesn't take the speed setting — ask again without it.
        payload = body as Record<string, unknown>;
        attempt--;
        continue;
      }
      if (res.status === 429 || res.status === 404 || res.status === 403) break; // over quota / model not available → next model
      if (res.status >= 500) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      break;
    }
  }
  if (/429/.test(lastError)) throw new AiError("The free AI limit is used up for now. Try again in a few minutes (or tomorrow).");
  if (/^5\d\d|UNAVAILABLE|overloaded|high demand/i.test(lastError)) throw new AiError("Gemini (the backup AI) is overloaded right now — that's on Google's side and usually passes in a few minutes. Please try again shortly.");
  if (/no answer within/.test(lastError)) throw new AiError(`Gemini is very slow right now (${lastError}). Try again in a minute.`);
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

export async function generateJson<T>(opts: { system: string; parts: Part[]; schema: object; models?: string[]; timeoutMs?: number }): Promise<{ data: T; model: string }> {
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const { json, model } = await callGemini(
      {
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: [{ role: "user", parts: opts.parts }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: opts.schema },
      },
      opts.models,
      opts.timeoutMs ?? 90_000,
    );
    const text = json.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
    try {
      return { data: JSON.parse(text) as T, model };
    } catch {
      last = json.candidates?.[0]?.finishReason ?? "unknown";
    }
  }
  throw new AiError(`The AI's answer was cut off or malformed (${last}).`);
}
