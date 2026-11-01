"use client";

import { useEffect, useRef, useState } from "react";
import { clearChat } from "@/app/actions/ai";
import { Md } from "@/components/md";
import { ProposalCard, type Proposal } from "./proposal-card";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments: { name: string; kind?: string }[];
  proposals: Proposal[];
  pending?: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SUGGESTIONS = [
  "How much did I spend this month, and on what?",
  "Who still owes me money?",
  "Which invoices are unpaid?",
  "Give me a rundown of this week",
  "What did brands pay me per reel?",
  "What's due in the next 7 days?",
];

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

export function Chat({ initial, initialQuery }: { initial: ChatMessage[]; initialQuery: string | null }) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const sentInitial = useRef(false);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  async function send(body: string, attach: File[] = files) {
    if ((!body.trim() && !attach.length) || sending) return;
    setSending(true);
    setText("");
    setFiles([]);
    const userMsg: ChatMessage = { id: `u${Date.now()}`, role: "user", content: body.trim() || "(sent a file)", attachments: attach.map((f) => ({ name: f.name })), proposals: [] };
    setMessages((m) => [...m, userMsg]);
    const fd = new FormData();
    fd.set("text", body);
    for (const f of attach) fd.append("files", await shrinkImage(f));
    const r = await fetch("/api/ai/ask", { method: "POST", body: fd })
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
      // The AI is working in the background; the answer is picked up below.
      setMessages((m) => [...m, { id: r.pending, role: "assistant", content: "", attachments: [], proposals: [], pending: true }]);
    } else {
      setMessages((m) => [...m, { id: `a${Date.now()}`, role: "assistant", content: r.error ? `⚠️ ${r.error}` : r.reply, attachments: [], proposals: r.proposals ?? [] }]);
    }
    setSending(false);
  }

  useEffect(() => {
    if (initialQuery && !sentInitial.current) {
      sentInitial.current = true;
      void send(initialQuery, []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  // Pick up answers the AI is still working on (also after a reload).
  const waiting = messages.filter((m) => m.pending).map((m) => m.id).join(",");
  useEffect(() => {
    if (!waiting) return;
    let stop = false;
    void (async () => {
      const started = Date.now();
      for (const id of waiting.split(",")) {
        while (!stop) {
          await sleep(Date.now() - started < 20_000 ? 1500 : 3000);
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
        const file = new File(chunks, `voice-note.${mime.includes("mp4") ? "m4a" : "webm"}`, { type: mime });
        void send(text, [...files, file]);
      };
      rec.start();
      recorder.current = rec;
      setRecording(true);
    } catch {
      alert("Couldn't use the microphone — allow microphone access for this site in your browser settings.");
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-12rem)] flex-col">
      <div className="flex-1 space-y-4 pb-4">
        {messages.length === 0 && (
          <div className="card p-5">
            <p className="text-sm text-slate-700">
              Ask anything about your deals and money, tell me to do something (&quot;add a deal with Mamaearth, 2 reels, 40k, due 20 Nov&quot;), or drop in a file — a brand email, brief, bank statement, 26AS, receipt photo, Excel sheet — or record a voice note. I&apos;ll always show you what I&apos;m about to save so you can confirm it.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s, [])} className="rounded-full bg-brand-50 px-3 py-1.5 text-xs text-brand-700 hover:bg-brand-100">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[92%] rounded-2xl px-4 py-2.5 sm:max-w-[80%] ${m.role === "user" ? "bg-brand-600 text-white" : "card"}`}>
              {m.attachments.length > 0 && <div className={`mb-1 text-xs ${m.role === "user" ? "text-brand-100" : "text-slate-500"}`}>📎 {m.attachments.map((a) => a.name).join(", ")}</div>}
              {m.role === "user" ? (
                <p className="text-sm whitespace-pre-wrap">{m.content}</p>
              ) : m.pending ? (
                <p className="text-sm text-slate-500">Thinking… <span className="text-xs">(you can leave this page — the answer will be here when you come back)</span></p>
              ) : (
                <Md text={m.content} />
              )}
              {m.proposals.map((p) => <ProposalCard key={p.id} p={p} />)}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="card px-4 py-3 text-sm text-slate-500">Thinking…</div>
          </div>
        )}
        <div ref={bottom} />
      </div>

      <div className="sticky bottom-16 z-20 -mx-4 border-t border-slate-200 bg-slate-50/95 px-4 pt-3 pb-3 backdrop-blur sm:-mx-6 sm:px-6 lg:bottom-0 lg:-mx-8 lg:px-8">
        {files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {files.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs ring-1 ring-slate-200">
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
          className="flex items-end gap-2"
        >
          <input ref={fileInput} type="file" multiple accept=".pdf,image/*,.csv,.txt,.xlsx,audio/*" className="hidden" onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])])} />
          <button type="button" onClick={() => fileInput.current?.click()} className="btn-secondary px-3" aria-label="Attach a file" title="Attach a file">📎</button>
          <button
            type="button"
            onClick={toggleRecording}
            disabled={sending}
            className={`btn px-3 ${recording ? "animate-pulse bg-rose-600 text-white" : "btn-secondary"}`}
            aria-label={recording ? "Stop recording" : "Record a voice note"}
            title={recording ? "Tap to stop and send" : "Record a voice note"}
          >
            {recording ? "■ Stop" : "🎤"}
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
            placeholder={recording ? "Recording… tap Stop to send" : 'Ask, or type "450 cab"…'}
            className="input max-h-40 min-h-10 flex-1 resize-none"
          />
          <button type="submit" disabled={sending || (!text.trim() && !files.length)} className="btn-primary">Send</button>
        </form>
        {messages.length > 0 && (
          <div className="mt-1 text-right">
            <button type="button" onClick={async () => { await clearChat(); setMessages([]); }} className="text-xs text-slate-400 hover:text-slate-600">Clear chat</button>
          </div>
        )}
      </div>
    </div>
  );
}
