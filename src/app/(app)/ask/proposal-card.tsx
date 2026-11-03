"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { undoChanges } from "@/app/actions/activity";
import { JobProgress } from "@/components/job-progress";
import { useJob } from "@/lib/use-job";

export type Proposal = {
  id: string;
  kind: string;
  summary: string;
  payload: Record<string, unknown>;
  status: string;
  result: { ok?: boolean; message?: string; link?: string } | null;
};

// Fields you can tweak on the card before confirming.
const EDITABLE: Record<string, { key: string; label: string; type?: string }[]> = {
  new_deal: [
    { key: "brand", label: "Brand" },
    { key: "title", label: "Deal name" },
    { key: "amount", label: "Fee (₹)", type: "number" },
    { key: "stage", label: "Stage" },
    { key: "due_date", label: "Content deadline", type: "date" },
    { key: "next_follow_up", label: "Follow up on", type: "date" },
  ],
  deal_update: [
    { key: "amount", label: "Fee (₹)", type: "number" },
    { key: "due_date", label: "Deadline", type: "date" },
    { key: "next_follow_up", label: "Follow up on", type: "date" },
    { key: "note", label: "Note" },
  ],
};

const TITLES: Record<string, string> = {
  new_deal: "New deal",
  deal_update: "Update deal",
  entries: "Add entries",
  recategorize: "Change categories",
  invoice_draft: "Draft invoice",
  statement_import: "Read bank statement",
  tds_26as: "Save 26AS figures",
  past_work: "Import past work",
  attach_file: "Attach file",
};

export function ProposalCard({ p: initial, onDone }: { p: Proposal; onDone?: () => void }) {
  const [p, setP] = useState(initial);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [undo, setUndo] = useState<"idle" | "working" | string>("idle");
  const job = useJob(jobId);
  const fields = EDITABLE[p.kind] ?? [];
  const jobEnded = Boolean(job && job.status !== "running");

  // The background work finished: pick up the result.
  useEffect(() => {
    if (!jobEnded || !busy) return;
    void (async () => {
      const s = await fetch(`/api/ai/proposals/${p.id}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (!s) return settle({ ok: false, message: "Couldn't check the result — reload the page." }, "confirm");
      if (s.result?.needsPassword) return settle({ needsPassword: true, message: s.result.message }, "confirm");
      settle(s.status === "applied" ? { ...s.result, ok: true } : { ok: false, message: s.result?.message ?? job?.error ?? "That didn't work." }, "confirm");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobEnded]);

  function settle(r: { ok?: boolean; message?: string; link?: string; needsPassword?: boolean }, action: "confirm" | "cancel") {
    setBusy(false);
    if (action === "cancel") return setP({ ...p, status: "cancelled" });
    if (r.needsPassword) {
      setNeedsPassword(true);
      return setError(r.message ?? "This PDF needs a password.");
    }
    if (!r.ok) return setError(r.message ?? "That didn't work.");
    setP({ ...p, status: "applied", result: { ok: true, message: r.message, link: r.link } });
    onDone?.();
  }

  async function act(action: "confirm" | "cancel") {
    setBusy(true);
    setError(null);
    const editPayload = Object.fromEntries(
      Object.entries(edits).map(([k, v]) => [k, fields.find((f) => f.key === k)?.type === "number" ? (v === "" ? null : Number(v)) : v || null]),
    );
    const r = await fetch(`/api/ai/proposals/${p.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, edits: editPayload, password: password || undefined }),
    })
      .then(async (x) => {
        const raw = await x.text();
        try {
          return JSON.parse(raw);
        } catch {
          return { ok: false, message: `Server error ${x.status}: ${raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160)}` };
        }
      })
      .catch(() => ({ ok: false, message: "Couldn't reach the app — try again." }));
    // The work happens in the background as a job; watch it live.
    if (r.working && r.jobId) {
      setJobId(r.jobId);
      return;
    }
    settle(r, action);
  }

  const done = p.status === "applied";
  const off = p.status === "cancelled" || p.status === "failed";
  return (
    <div className={`mt-2 rounded-xl border p-3 text-sm ${done ? "border-emerald-200 bg-emerald-50" : off ? "border-slate-200 bg-slate-50 opacity-70" : "border-brand-100 bg-white shadow-sm"}`}>
      <div className="mb-1 text-xs font-semibold tracking-wide text-brand-700 uppercase">{TITLES[p.kind] ?? "Action"}</div>
      <p className="whitespace-pre-line text-slate-800">{p.summary}</p>

      {editing && !done && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {fields.map((f) => (
            <label key={f.key} className="block">
              <span className="label">{f.label}</span>
              <input
                type={f.type ?? "text"}
                defaultValue={p.payload[f.key] === null || p.payload[f.key] === undefined ? "" : String(p.payload[f.key])}
                onChange={(e) => setEdits({ ...edits, [f.key]: e.target.value })}
                className="input"
              />
            </label>
          ))}
        </div>
      )}
      {needsPassword && !done && (
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="PDF password" className="input mt-2" autoComplete="off" />
      )}
      {busy && jobId && (
        <div className="mt-3 rounded-lg bg-slate-50 p-2.5">
          <JobProgress job={job} fallback={p.kind === "statement_import" ? "Reading statement…" : "Saving…"} />
        </div>
      )}
      {error && <p className="mt-2 text-rose-700">{error}</p>}

      {done ? (
        <p className="mt-2 font-medium text-emerald-800">
          ✓ {p.result?.message ?? "Done."} {p.result?.link && <Link href={p.result.link} className="link">Open →</Link>}
          {jobId && (
            <button
              type="button"
              disabled={undo !== "idle"}
              onClick={async () => {
                setUndo("working");
                const r = await undoChanges(jobId);
                setUndo(r.message);
                if (r.ok) {
                  setP({ ...p, status: "cancelled" });
                  onDone?.();
                }
              }}
              className="ml-2 text-xs font-normal text-slate-500 underline hover:text-slate-800"
            >
              {undo === "idle" ? "Undo" : undo === "working" ? "Undoing…" : ""}
            </button>
          )}
        </p>
      ) : off ? (
        <p className="mt-2 text-slate-500">{undo !== "idle" && undo !== "working" ? undo : p.status === "cancelled" ? "Cancelled." : "Didn't work."}</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => act("confirm")} className="btn-primary px-3 py-1.5">
            {busy ? "Working…" : needsPassword ? "Try with password" : "Confirm"}
          </button>
          {fields.length > 0 && (
            <button type="button" disabled={busy} onClick={() => setEditing((v) => !v)} className="btn-secondary px-3 py-1.5">
              {editing ? "Done editing" : "Edit"}
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => act("cancel")} className="btn-ghost px-3 py-1.5">Cancel</button>
        </div>
      )}
    </div>
  );
}
