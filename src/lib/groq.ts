import "server-only";
import { AiError } from "@/lib/finance/gemini";

// Groq (free tier): very fast speech-to-text. Handles iPhone voice notes
// (.m4a/.mp4) as well as Telegram (.ogg) and browser (.webm) recordings.

const BASE = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";

export const isGroqConfigured = () => Boolean(process.env.GROQ_API_KEY);

export async function transcribe(bytes: Uint8Array, fileName: string, mime: string): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new AiError("Voice notes need GROQ_API_KEY in Vercel.");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime || "audio/mp4" }), fileName || "voice.m4a");
  form.append("model", process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo");
  form.append("language", "en");
  form.append("response_format", "json");
  const res = await fetch(`${BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  }).catch((e: unknown) => {
    throw new AiError(`Couldn't turn the voice note into text (${e instanceof Error && e.name === "TimeoutError" ? "no answer in 30 seconds" : e instanceof Error ? e.message : String(e)}).`);
  });
  if (res.status === 401) throw new AiError("Groq says the API key isn't valid. Check GROQ_API_KEY in Vercel.");
  if (res.status === 429) throw new AiError("The free voice limit is used up for now. Try again in a few minutes, or type it.");
  if (!res.ok) throw new AiError(`Couldn't turn the voice note into text (${res.status}: ${(await res.text()).slice(0, 200)}).`);
  const json = (await res.json()) as { text?: string };
  return (json.text ?? "").trim();
}
