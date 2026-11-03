import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadActivity, type FeedItem } from "@/lib/activity";
import { sweepStaleJobs } from "@/lib/jobs";
import { AskAgain, LiveJob, UndoButton } from "./parts";

export const metadata: Metadata = { title: "Activity" };

const FILTERS = [
  { id: "all", label: "Everything" },
  { id: "failed", label: "Problems" },
  { id: "ai", label: "AI" },
  { id: "telegram", label: "Telegram" },
  { id: "you", label: "Your edits" },
] as const;

const KIND_ICON: Record<string, string> = { chat: "✨", apply: "✅", statement: "📄", rundown: "🗓️", telegram: "💬", daily: "⏰" };
const STATUS: Record<string, { label: string; cls: string }> = {
  running: { label: "Working", cls: "bg-brand-50 text-brand-700" },
  done: { label: "Done", cls: "bg-emerald-50 text-emerald-700" },
  failed: { label: "Failed", cls: "bg-rose-50 text-rose-700" },
  cancelled: { label: "Stopped", cls: "bg-slate-100 text-slate-600" },
};

const time = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso));

function keep(item: FeedItem, show: string) {
  if (show === "all") return true;
  if (item.type === "changes") return show === "you";
  const j = item.job;
  if (show === "failed") return j.status === "failed";
  if (show === "ai") return ["chat", "apply", "rundown"].includes(j.kind);
  if (show === "telegram") return j.source === "telegram";
  return false;
}

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show: raw } = await searchParams;
  const show = FILTERS.some((f) => f.id === raw) ? raw! : "all";
  const { supabase } = await requireUser();
  await sweepStaleJobs(supabase);
  const feed = (await loadActivity(supabase)).filter((i) => keep(i, show));
  const problems = feed.filter((i) => i.type === "job" && i.job.status === "failed").length;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <p className="text-sm text-slate-500">Everything the app, the AI and Telegram did — and your own changes</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Activity</h1>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <Link
            key={f.id}
            href={f.id === "all" ? "/activity" : `/activity?show=${f.id}`}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${show === f.id ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}
          >
            {f.label}
            {f.id === "failed" && problems > 0 && show !== "failed" ? ` · ${problems}` : ""}
          </Link>
        ))}
      </div>

      {feed.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 ring-1 ring-slate-200">Nothing here yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {feed.map((item) => (item.type === "job" ? <JobRow key={item.job.id} item={item} /> : <ChangeRow key={item.changes.groupId} item={item} />))}
        </ul>
      )}
    </div>
  );
}

function JobRow({ item }: { item: Extract<FeedItem, { type: "job" }> }) {
  const { job, changes } = item;
  const st = STATUS[job.status] ?? STATUS.done;
  const canUndo = changes && !changes.undone && job.status !== "running";
  return (
    <li className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ${job.status === "failed" ? "ring-rose-200" : "ring-slate-200"}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-lg leading-none">{KIND_ICON[job.kind] ?? "•"}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 font-medium break-words">{job.title}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
          </div>
          <div className="mt-0.5 text-xs text-slate-400">
            {time(job.created_at)}
            {job.finished_at && ` · took ${Math.max(1, Math.round((new Date(job.finished_at).getTime() - new Date(job.created_at).getTime()) / 1000))}s`}
            {job.source === "telegram" && " · from Telegram"}
            {job.source === "auto" && " · automatic"}
          </div>

          {job.status === "running" ? (
            <div className="mt-2">
              <LiveJob jobId={job.id} />
            </div>
          ) : (
            <>
              {job.error && <p className="mt-2 text-sm text-rose-700">{job.error}</p>}
              {job.summary && !job.error && <p className="mt-1.5 line-clamp-2 text-sm text-slate-600">{job.summary.replace(/[*_`#]+/g, "").replace(/\s*\n\s*/g, " ")}</p>}
              {changes && <Changes changes={changes} />}
              {job.steps.length > 0 && (
                <details className="mt-2 text-xs text-slate-500">
                  <summary className="cursor-pointer select-none">Steps ({job.steps.length})</summary>
                  <ol className="mt-1.5 space-y-0.5 border-l border-slate-200 pl-3">
                    {job.steps.map((s, i) => (
                      <li key={i}>
                        <span className="text-slate-400 tabular-nums">{Math.max(0, Math.round((new Date(s.at).getTime() - new Date(job.created_at).getTime()) / 1000))}s</span> {s.text}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </>
          )}

          {(canUndo || (job.status === "failed" && (job.kind === "chat" || job.kind === "statement"))) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {canUndo && <UndoButton groupId={job.id} label={job.kind === "statement" ? "Undo — remove these transactions" : "Undo"} />}
              {job.status === "failed" && job.kind === "chat" && <AskAgain text={job.title} />}
              {job.status === "failed" && job.kind === "statement" && (
                <Link href="/money/statements" className="rounded-full px-2.5 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50">
                  Try again
                </Link>
              )}
            </div>
          )}
          {changes?.undone && <p className="mt-2 text-xs text-slate-500">↩️ Undone</p>}
        </div>
      </div>
    </li>
  );
}

function ChangeRow({ item }: { item: Extract<FeedItem, { type: "changes" }> }) {
  const c = item.changes;
  return (
    <li className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-lg leading-none">{c.undoOf ? "↩️" : "✏️"}</span>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{c.undoOf ? "You undid a change" : c.lines.length === 1 ? c.lines[0] : c.headline}</div>
          <div className="mt-0.5 text-xs text-slate-400">{time(c.at)} · you</div>
          {(c.lines.length > 1 || c.undoOf) && <Changes changes={c} />}
          <div className="mt-2 flex gap-2">
            {c.undone ? <span className="text-xs text-slate-500">↩️ Undone</span> : <UndoButton groupId={c.groupId} label={c.undoOf ? "Redo" : "Undo"} />}
          </div>
        </div>
      </div>
    </li>
  );
}

function Changes({ changes }: { changes: NonNullable<Extract<FeedItem, { type: "job" }>["changes"]> }) {
  const lines = changes.lines;
  if (!lines.length) return null;
  return (
    <details className="mt-2 text-sm" open={lines.length <= 3}>
      <summary className="cursor-pointer text-xs font-medium text-slate-500 select-none">{changes.headline}</summary>
      <ul className="mt-1.5 space-y-0.5 text-xs text-slate-600">
        {lines.slice(0, 30).map((l, i) => (
          <li key={i} className="break-words">• {l}</li>
        ))}
        {lines.length > 30 && <li className="text-slate-400">…and {lines.length - 30} more</li>}
      </ul>
    </details>
  );
}
