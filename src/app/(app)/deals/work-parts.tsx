"use client";

import { useActionState, useOptimistic, useState, useTransition } from "react";
import { moveDealToStage } from "@/app/actions/deals";
import { addContent, addNote, markPosted, quickCreateDeal, unmarkPosted, updateDealField } from "@/app/actions/work";
import { useAssistant } from "@/components/assistant";
import { toast } from "@/components/toast";
import { STAGES, type StageId } from "@/lib/constants";

const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
const shortDate = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

/** Tap a value to change it. Saves when you press Enter or tap away. */
export function InlineField({
  dealId,
  field,
  value,
  kind = "text",
  placeholder = "Add",
  className = "",
}: {
  dealId: string;
  field: "title" | "amount" | "due_date" | "next_follow_up" | "platform" | "notes";
  value: string | number | null;
  kind?: "text" | "money" | "date" | "long";
  placeholder?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [shown, setShown] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save(raw: string) {
    setEditing(false);
    if (String(shown ?? "") === raw.trim()) return;
    const previous = shown;
    // Show the new value straight away (25k → ₹25,000) while it saves.
    let next: string | number | null = raw.trim() || null;
    if (kind === "money" && next) {
      const m = String(next).toLowerCase().replace(/[₹,\s]|rs\.?/g, "").match(/^(\d+(?:\.\d+)?)(k|l)?$/);
      if (m) next = Number(m[1]) * (m[2] === "k" ? 1000 : m[2] === "l" ? 100000 : 1);
    }
    setShown(next);
    start(async () => {
      const r = await updateDealField(dealId, field, raw);
      if (r.error) {
        setError(r.error);
        setShown(previous);
      } else {
        setError(null);
        toast("Saved", { undoGroup: r.groupId });
      }
    });
  }

  if (editing) {
    const common = {
      autoFocus: true,
      defaultValue: shown === null ? "" : String(shown),
      onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => save(e.currentTarget.value),
      onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (e.key === "Enter" && kind !== "long") save(e.currentTarget.value);
        if (e.key === "Escape") setEditing(false);
      },
      className: "input py-1",
    };
    return kind === "long" ? <textarea rows={3} {...common} /> : <input type={kind === "date" ? "date" : "text"} inputMode={kind === "money" ? "decimal" : undefined} placeholder={kind === "money" ? "25000 or 25k" : ""} {...common} />;
  }
  const text =
    shown === null || shown === ""
      ? null
      : kind === "money"
        ? isNaN(Number(shown)) ? String(shown) : inr(Number(shown))
        : kind === "date"
          ? shortDate(String(shown))
          : String(shown);
  return (
    <span className={className}>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={`-mx-1 rounded-md px-1 text-left hover:bg-slate-100 ${text ? "" : "text-slate-400"} ${pending ? "opacity-60" : ""} ${kind === "long" ? "whitespace-pre-wrap" : ""}`}
        title="Tap to change"
      >
        {text ?? placeholder}
      </button>
      {error && <span className="ml-2 text-xs text-rose-600">{error}</span>}
    </span>
  );
}

export function StagePicker({ dealId, stage }: { dealId: string; stage: string }) {
  const [value, setValue] = useState(stage);
  const [, start] = useTransition();
  const info = STAGES.find((s) => s.id === value) ?? STAGES[0];
  return (
    <label className={`relative inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${info.color}`}>
      {info.label} ▾
      <select
        aria-label="Stage"
        value={value}
        onChange={(e) => {
          const next = e.target.value as StageId;
          const before = value;
          setValue(next);
          start(async () => {
            try {
              const r = await moveDealToStage(dealId, next);
              toast(`Moved to ${STAGES.find((x) => x.id === next)?.label ?? next}`, { undoGroup: r?.groupId });
            } catch {
              setValue(before);
              toast("Couldn't change the stage — try again.", { tone: "error" });
            }
          });
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {STAGES.map((s) => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>
    </label>
  );
}

export function ContentAdder({ dealId }: { dealId: string }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, addPending] = useOptimistic<string[], string>([], (list, t) => [...list, t]);
  const [, start] = useTransition();
  return (
    <div>
      {adding.map((t, i) => (
        <p key={i} className="mb-2 text-sm text-slate-400">+ {t} <span className="text-xs">saving…</span></p>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const t = text.trim();
          if (!t) return;
          setText(""); // clear straight away
          start(async () => {
            addPending(t);
            const r = await addContent(dealId, t);
            if (r.error) {
              setError(r.error);
              setText(t);
            } else {
              setError(null);
              toast("Content added", { undoGroup: r.groupId });
            }
          });
        }}
        className="flex gap-2"
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder='Add content — "2 reels, 1 story"' className="input py-1.5" />
        <button disabled={!text.trim()} className="btn-secondary shrink-0 px-3 py-1.5">Add content</button>
      </form>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}

export function PostedButton({ deliverableId, posted }: { deliverableId: string; posted: boolean }) {
  const [asking, setAsking] = useState(false);
  const [link, setLink] = useState("");
  const [shown, setShown] = useOptimistic(posted);
  const [, start] = useTransition();
  const save = (next: boolean) =>
    start(async () => {
      setShown(next);
      setAsking(false);
      try {
        const r = next ? await markPosted(deliverableId, link) : await unmarkPosted(deliverableId);
        toast(next ? "Marked as posted" : "Marked as not posted", { undoGroup: r?.groupId });
      } catch {
        toast("Couldn't save — try again.", { tone: "error" });
      }
    });
  if (shown)
    return (
      <button type="button" onClick={() => save(false)} className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800" title="Tap to undo">
        Posted ✓
      </button>
    );
  if (asking)
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(true);
        }}
        className="flex w-full gap-1.5 sm:w-auto"
      >
        <input autoFocus value={link} onChange={(e) => setLink(e.target.value)} placeholder="Post link (optional)" className="input min-w-0 py-1 text-xs" />
        <button className="btn-primary px-2.5 py-1 text-xs">Save</button>
      </form>
    );
  return (
    <button type="button" onClick={() => setAsking(true)} className="btn-secondary px-2.5 py-1 text-xs">
      Mark posted
    </button>
  );
}

export function NoteAdder({ dealId }: { dealId: string }) {
  const [text, setText] = useState("");
  const [adding, addPending] = useOptimistic<string[], string>([], (list, t) => [...list, t]);
  const [, start] = useTransition();
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const t = text.trim();
          if (!t) return;
          setText("");
          start(async () => {
            addPending(t);
            const r = await addNote(dealId, t);
            if (r.error) {
              setText(t);
              toast(`Couldn't save the note: ${r.error}`, { tone: "error" });
            } else toast("Note added", { undoGroup: r.groupId });
          });
        }}
        className="flex gap-2"
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note — what they said, what's next…" className="input py-1.5" />
        <button disabled={!text.trim()} className="btn-secondary shrink-0 px-3 py-1.5">Add note</button>
      </form>
      {adding.map((t, i) => (
        <p key={i} className="mt-2 text-sm text-slate-400">{t} <span className="text-xs">saving…</span></p>
      ))}
    </div>
  );
}

/** "+ New deal": describe it to the AI, or fill four quick fields. */
export function NewDeal({ brands, agencies = [], className = "btn-primary" }: { brands: string[]; agencies?: string[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"ai" | "form">("ai");
  const [text, setText] = useState("");
  const { open: openAssistant } = useAssistant();
  const [state, action, pending] = useActionState(quickCreateDeal, undefined);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>+ New deal</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">New deal</h2>
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost px-2" aria-label="Close">✕</button>
            </div>
            <div className="mb-4 inline-flex rounded-xl bg-slate-100 p-1 text-sm">
              <button type="button" onClick={() => setMode("ai")} className={`rounded-lg px-3 py-1.5 ${mode === "ai" ? "bg-white font-medium shadow-sm" : "text-slate-600"}`}>✨ Tell the AI</button>
              <button type="button" onClick={() => setMode("form")} className={`rounded-lg px-3 py-1.5 ${mode === "form" ? "bg-white font-medium shadow-sm" : "text-slate-600"}`}>Fill it myself</button>
            </div>

            {mode === "ai" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!text.trim()) return;
                  openAssistant(`Add this as a new deal: ${text.trim()}`);
                  setText("");
                  setOpen(false);
                }}
                className="space-y-3"
              >
                <textarea
                  autoFocus
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={5}
                  placeholder={'Describe it or paste the brand\'s message, e.g.\n"FanCode via Agency X, 1 reel, 5k, TDS cut"\n"Noise wants 2 reels + 3 stories for 60k, deadline 20 Nov"'}
                  className="input"
                />
                <p className="text-xs text-slate-500">The assistant fills in everything and shows you a card to confirm. To add a brief or contract PDF, drop it into the assistant.</p>
                <button className="btn-primary w-full" disabled={!text.trim()}>Continue with AI</button>
              </form>
            ) : (
              <form action={action} className="space-y-3">
                <label className="block">
                  <span className="label">Brand</span>
                  <input name="brand" list="brand-list" required autoFocus placeholder="FanCode" className="input" />
                  <datalist id="brand-list">{brands.map((b) => <option key={b} value={b} />)}</datalist>
                </label>
                <label className="block">
                  <span className="label">Through an agency? (optional)</span>
                  <input name="agency" list="agency-list" placeholder="Leave empty if direct" className="input" />
                  <datalist id="agency-list">{agencies.map((b) => <option key={b} value={b} />)}</datalist>
                </label>
                <label className="block">
                  <span className="label">What</span>
                  <input name="what" placeholder="1 reel + 2 stories" className="input" />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="label">Fee</span>
                    <input name="amount" inputMode="decimal" placeholder="5k" className="input" />
                  </label>
                  <label className="block">
                    <span className="label">Where it stands</span>
                    <select name="stage" defaultValue="confirmed" className="input">
                      <option value="lead">Just a lead</option>
                      <option value="negotiating">Talking</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="posted">Posted</option>
                      <option value="invoiced">Invoiced</option>
                      <option value="paid">Done & paid</option>
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className="label">Deadline (optional)</span>
                  <input name="due_date" type="date" className="input" />
                </label>
                {state?.error && <p className="text-sm text-rose-600">{state.error}</p>}
                <button className="btn-primary w-full" disabled={pending}>
                  {pending ? "Saving…" : "Create deal"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
