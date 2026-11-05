import "server-only";

// The assistant on Groq (free, fast, doesn't train on your data): an
// OpenAI-style chat with tools, streamed so the answer appears as it's written.

const BASE = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";

export const GROQ_CHAT_MODELS = () =>
  (process.env.GROQ_CHAT_MODELS || "openai/gpt-oss-120b,openai/gpt-oss-20b")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

export type ChatMsg =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ToolSpec = { type: "function"; function: { name: string; description: string; parameters: object } };

/** Gemini-style declarations (OBJECT/STRING…) → JSON-schema tools. */
export function toOpenAiTools(decls: { name: string; description: string; parameters?: object }[]): ToolSpec[] {
  const fix = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(fix);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, k === "type" && typeof x === "string" ? x.toLowerCase() : fix(x)]));
    }
    return v;
  };
  return decls.map((d) => ({
    type: "function",
    function: { name: d.name, description: d.description, parameters: d.parameters ? (fix(d.parameters) as object) : { type: "object", properties: {} } },
  }));
}

export class GroqUnavailable extends Error {}

/**
 * One streamed model turn. Calls onText with the text so far. Returns the
 * assistant message (text and/or tool calls).
 */
export async function groqTurn(opts: {
  model: string;
  messages: ChatMsg[];
  tools: ToolSpec[];
  onText?: (soFar: string) => void;
  timeoutMs?: number;
}): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new GroqUnavailable("no key");
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    tools: opts.tools,
    tool_choice: "auto",
    temperature: 0.3,
    stream: true,
    max_completion_tokens: 700, // reserved tokens count against the free per-minute limit
  };
  if (/gpt-oss/.test(opts.model)) body.reasoning_effort = "low";

  // Give up quickly if Groq doesn't start answering (20s), stalls mid-answer
  // (20s), or takes too long overall — the app then switches to Gemini.
  const abort = new AbortController();
  const overall = setTimeout(() => abort.abort(), opts.timeoutMs ?? 60_000);
  let idle = setTimeout(() => abort.abort(), 20_000);
  const ctrl = abort.signal;
  let res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: ctrl,
  }).catch((e: unknown) => {
    clearTimeout(overall);
    clearTimeout(idle);
    throw new GroqUnavailable(e instanceof Error && e.name === "AbortError" ? "no answer within 20 seconds" : e instanceof Error ? e.message : String(e));
  });
  if (res.status === 400) {
    const text = await res.text();
    if (/reasoning/i.test(text) && body.reasoning_effort) {
      delete body.reasoning_effort;
      res = await fetch(`${BASE}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl });
    } else throw new GroqUnavailable(`400: ${text.slice(0, 200)}`);
  }
  if (!res.ok || !res.body) {
    clearTimeout(overall);
    clearTimeout(idle);
    const text = await res.text().catch(() => "");
    let msg = text;
    try {
      msg = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? text;
    } catch {
      /* not JSON */
    }
    throw new GroqUnavailable(`${res.status}: ${msg.slice(0, 160)}`);
  }

  let content = "";
  const calls: { id: string; name: string; args: string }[] = [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      clearTimeout(idle);
      idle = setTimeout(() => abort.abort(), 20_000);
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        let chunk: { choices?: { delta?: { content?: string | null; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[]; error?: { message?: string } };
        try {
          chunk = JSON.parse(data);
        } catch {
          continue;
        }
        if (chunk.error) throw new GroqUnavailable(chunk.error.message ?? "stream error");
        const delta = chunk.choices?.[0]?.delta;
        if (delta?.content) {
          content += delta.content;
          opts.onText?.(content);
        }
        for (const tc of delta?.tool_calls ?? []) {
          const c = (calls[tc.index] ??= { id: "", name: "", args: "" });
          if (tc.id) c.id = tc.id;
          if (tc.function?.name) c.name += tc.function.name;
          if (tc.function?.arguments) c.args += tc.function.arguments;
        }
      }
    }
  } catch (e) {
    if (e instanceof GroqUnavailable) throw e;
    // The connection dropped mid-answer: only a problem if nothing came through.
    if (!content && !calls.length) throw new GroqUnavailable(e instanceof Error && e.name === "AbortError" ? "stopped answering for 20 seconds" : e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(overall);
    clearTimeout(idle);
  }
  return {
    content,
    toolCalls: calls.filter((c) => c.name).map((c, i) => ({ id: c.id || `call_${i}`, type: "function", function: { name: c.name, arguments: c.args || "{}" } })),
  };
}
