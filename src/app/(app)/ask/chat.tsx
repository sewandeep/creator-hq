"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { clearChat } from "@/app/actions/ai";
import { JobProgress } from "@/components/job-progress";
import { Md } from "@/components/md";
import { createClient } from "@/lib/supabase/client";
import { stopJob, useJob } from "@/lib/use-job";
import { ProposalCard, type Proposal } from "./proposal-card";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments: { name: string; kind?: string }[];
  proposals: Proposal[];
  pending?: boolean;
  /** The background job working on this answer (live steps + Stop). */
  jobId?: string | null;
};
export type ChatContext = { type: "deal" | "brand" | "invoice" | "transaction" | "page"; id?: string; path?: string } | null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Puts files straight into private storage, so size limits on the app server don't apply. */
async function uploadToInbox(files: File[]) {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error("You're logged out — refresh the page.");
  const out: { path: string; name: string; mime: string }[] = [];
  for (const f of files) {
    const safe = f.name.replace(/[^\w.\- ]+/g, "_").slice(-100) || "file";
    const path = `${userId}/${crypto.randomUUID()}-${safe}`;
    const mime = (f.type || "application/octet-stream").split(";")[0];
    const { error } = await supabase.storage.from("inbox").upload(path, f, { contentType: mime });
    if (error) throw new Error(`Couldn't upload ${f.name}: ${error.message}`);
    out.push({ path, name: f.name, mime });
  }
  return out;
}

/** Shrinks big photos so uploads stay fast. */
async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 1_500_000) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  return blob ? new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }) : file;
}

export function Chat({
  initial,
  initialQuery = null,
  variant = "page",
  context = null,
  suggestions,
  queued,
  onQueuedTaken,
}: {
  /** Leave undefined to load the history when the chat first appears. */
  initial?: ChatMessage[];
  initialQuery?: string | null;
  variant?: "page" | "panel";
  context?: ChatContext;
  suggestions: string[];
  /** A message handed over from elsewhere (e.g. the Today box) to send right away. */
  queued?: string | null;
  onQueuedTaken?: () => void;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initial ?? []);
  const [loaded, setLoaded] = useState(Boolean(initial));
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const sentInitial = useRef(false);

  useEffect(() => {
    if (loaded) return;
    void fetch("/api/ai/history")
      .then((r) => (r.ok ? r.json() : []))
      .then((m: ChatMessage[]) => {
        setMessages(m);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [loaded]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  async function send(body: string, attach: File[] = files) {
    if ((!body.trim() && !attach.length) || sending) return;
    setSending(true);
    setText("");
    setFiles([]);
    const isVoice = attach.length === 1 && attach[0].type.startsWith("audio/") && !body.trim();
    setMessages((m) => [...m, { id: `u${Date.now()}`, role: "user", content: body.trim() || (isVoice ? "🎤 Voice note" : "(sent a file)"), attachments: attach.map((f) => ({ name: f.name })), proposals: [] }]);
    const fd = new FormData();
    fd.set("text", body);
    if (context) fd.set("context", JSON.stringify(context));
    let uploadError: string | null = null;
    if (attach.length) {
      try {
        fd.set("uploaded", JSON.stringify(await uploadToInbox(await Promise.all(attach.map(shrinkImage)))));
      } catch (e) {
        uploadError = e instanceof Error ? e.message : String(e);
      }
    }
    const r = uploadError
      ? { error: uploadError }
      : await fetch("/api/ai/ask", { method: "POST", body: fd })
      .then(async (x) => {
        const raw = await x.text();
        try {
          return JSON.parse(raw);
        } catch {
          return { error: `Server error ${x.status}. ${raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200)}` };
        }
      })
      .catch((e) => ({ error: `Couldn't send your message (${e instanceof Error ? e.message : "network error"}). Check your connection and try again.` }));
    if (r.pending) {
      setMessages((m) => [...m, { id: r.pending, role: "assistant", content: "", attachments: [], proposals: [], pending: true, jobId: r.jobId ?? null }]);
    } else {
      setMessages((m) => [...m, { id: `a${Date.now()}`, role: "assistant", content: r.error ? `⚠️ ${r.error}` : r.reply, attachments: [], proposals: r.proposals ?? [] }]);
      if (r.quick) router.refresh();
    }
    setSending(false);
  }

  useEffect(() => {
    if (!initialQuery || sentInitial.current || !loaded) return;
    sentInitial.current = true;
    const t = setTimeout(() => void send(initialQuery, []), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery, loaded]);

  // A message handed over from elsewhere (e.g. the Today box).
  useEffect(() => {
    if (!queued || !loaded) return;
    const t = setTimeout(() => {
      onQueuedTaken?.();
      void send(queued, []);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queued, loaded]);

  // Pick up answers the AI is still working on (also after a reload).
  const waiting = messages.filter((m) => m.pending && !m.jobId).map((m) => m.id).join(",");
  useEffect(() => {
    if (!waiting) return;
    let stop = false;
    void (async () => {
      let tries = 0;
      for (const id of waiting.split(",")) {
        while (!stop) {
          await sleep(tries++ < 12 ? 1500 : 3000);
          const r = await fetch(`/api/ai/messages/${id}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
          if (stop) return;
          if (r && !r.pending) {
            setMessages((m) => m.map((x) => (x.id === id ? { ...x, content: r.content, proposals: r.proposals ?? [], pending: false } : x)));
            break;
          }
        }
      }
    })();
    return () => {
      stop = true;
    };
  }, [waiting]);

  async function toggleRecording() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const mime = (rec.mimeType || type || "audio/webm").split(";")[0];
        void send(text, [...files, new File(chunks, `voice-note.${mime.includes("mp4") ? "m4a" : "webm"}`, { type: mime })]);
      };
      rec.start();
      recorder.current = rec;
      setRecording(true);
    } catch {
      alert("Couldn't use the microphone — allow microphone access for this site in your browser settings.");
    }
  }

  /** A job finished: load the saved answer. */
  async function loadReply(id: string) {
    const r = await fetch(`/api/ai/messages/${id}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    if (!r || r.pending) return;
    setMessages((m) => m.map((x) => (x.id === id ? { ...x, content: r.content, proposals: r.proposals ?? [], pending: false } : x)));
  }

  const panel = variant === "panel";
  return (
    <div className={panel ? "flex h-full min-h-0 flex-col" : "flex min-h-[calc(100dvh-12rem)] flex-col"}>
      <div className={panel ? "min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" : "flex-1 space-y-4 pb-4"}>
        {!loaded && <p className="text-sm text-slate-400">Loading…</p>}
        {loaded && messages.length === 0 && (
          <div className={panel ? "" : "card p-5"}>
            <p className="text-sm text-slate-600">
              Ask anything, tell me what to do, or drop in a file or voice note. I&apos;ll show you what I&apos;m about to save so you can confirm it.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 ${m.role === "user" ? "bg-brand-600 text-white" : "bg-white ring-1 ring-slate-200"}`}>
              {m.attachments.length > 0 && <div className={`mb-1 text-xs ${m.role === "user" ? "text-brand-100" : "text-slate-500"}`}>📎 {m.attachments.map((a) => a.name).join(", ")}</div>}
              {m.role === "user" ? (
                <p className="text-sm whitespace-pre-wrap">{m.content}</p>
              ) : m.pending && m.jobId ? (
                <PendingReply jobId={m.jobId} onFinished={() => void loadReply(m.id)} />
              ) : m.pending ? (
                <p className="flex items-center gap-2 text-sm text-slate-500">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                  Thinking…
                </p>
              ) : (
                <Md text={m.content} />
              )}
              {m.proposals.map((p) => <ProposalCard key={p.id} p={p} onDone={() => router.refresh()} />)}
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <div className={panel ? "border-t border-slate-200 bg-white px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]" : "sticky bottom-16 z-20 -mx-4 border-t border-slate-200 bg-slate-50/95 px-4 pt-3 pb-3 backdrop-blur sm:-mx-6 sm:px-6 lg:bottom-0 lg:-mx-8 lg:px-8"}>
        {messages.length < 3 && !text && (
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => send(s, [])} className="shrink-0 rounded-full bg-brand-50 px-3 py-1.5 text-xs text-brand-700 hover:bg-brand-100">
                {s}
              </button>
            ))}
          </div>
        )}
        {files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {files.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs">
                📎 {f.name}
                <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600" aria-label="Remove">✕</button>
              </span>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
          className="flex items-end gap-1.5"
        >
          <input ref={fileInput} type="file" multiple accept=".pdf,image/*,.csv,.txt,.xlsx,audio/*" className="hidden" onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])])} />
          <button type="button" onClick={() => fileInput.current?.click()} className="btn-ghost px-2.5" aria-label="Attach a file" title="Attach a file">📎</button>
          <button
            type="button"
            onClick={toggleRecording}
            disabled={sending}
            className={`btn px-2.5 ${recording ? "animate-pulse bg-rose-600 text-white" : "btn-ghost"}`}
            aria-label={recording ? "Stop recording" : "Record a voice note"}
            title={recording ? "Tap to stop and send" : "Record a voice note"}
          >
            {recording ? "■" : "🎤"}
          </button>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(text);
              }
            }}
            rows={1}
            placeholder={recording ? "Recording… tap ■ to send" : 'Ask, or type "450 cab"…'}
            className="input max-h-40 min-h-10 flex-1 resize-none"
          />
          <button type="submit" disabled={sending || (!text.trim() && !files.length)} className="btn-primary px-3" aria-label="Send">↑</button>
        </form>
        {messages.length > 0 && !panel && (
          <div className="mt-1 text-right">
            <button type="button" onClick={async () => { await clearChat(); setMessages([]); }} className="text-xs text-slate-400 hover:text-slate-600">Clear chat</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Shows the assistant working live — steps, then the answer as it's written. */
function PendingReply({ jobId, onFinished }: { jobId: string; onFinished: () => void }) {
  const job = useJob(jobId);
  const done = job && job.status !== "running";
  useEffect(() => {
    if (done) onFinished();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);
  const streamed = job?.status === "running" ? (job.summary ?? "").trim() : "";
  if (streamed)
    return (
      <div>
        <Md text={streamed} />
        <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-brand-400 align-middle" />
        <div className="mt-1">
          <button type="button" onClick={() => void stopJob(jobId)} className="rounded-full px-2 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200 hover:text-rose-600">
            Stop
          </button>
        </div>
      </div>
    );
  return <JobProgress job={job} fallback="Starting…" compact />;
}
