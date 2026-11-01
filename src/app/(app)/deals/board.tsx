"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { moveDealToStage } from "@/app/actions/deals";
import { STAGES, type StageId } from "@/lib/constants";
import { relativeDay, rupees } from "@/lib/format";

export type BoardDeal = {
  id: string;
  title: string;
  stage: string;
  amount: number | null;
  is_barter: boolean;
  due_date: string | null;
  next_follow_up: string | null;
  brand: string;
};

export function Board({ deals, today, showLost }: { deals: BoardDeal[]; today: string; showLost: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(deals, (state, move: { id: string; stage: string }) =>
    state.map((d) => (d.id === move.id ? { ...d, stage: move.stage } : d)),
  );
  const [, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function move(id: string, stage: StageId) {
    setError(null);
    startTransition(async () => {
      setOptimistic({ id, stage });
      try {
        await moveDealToStage(id, stage);
      } catch {
        setError("Couldn't move that deal. Please try again.");
      }
    });
  }

  const columns = STAGES.filter((s) => showLost || s.id !== "lost");

  return (
    <>
      {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <div className="flex flex-col gap-3 pb-4 sm:-mx-6 sm:flex-row sm:overflow-x-auto sm:px-6 lg:-mx-8 lg:px-8">
        {columns.map((col) => {
          const items = optimistic.filter((d) => d.stage === col.id);
          const total = items.reduce((t, d) => t + Number(d.amount ?? 0), 0);
          return (
            <section
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(col.id);
              }}
              onDragLeave={() => setDragOver((c) => (c === col.id ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const id = e.dataTransfer.getData("text/deal-id");
                const deal = optimistic.find((d) => d.id === id);
                if (deal && deal.stage !== col.id) move(id, col.id);
              }}
              className={`${items.length === 0 ? "hidden sm:flex" : "flex"} w-full shrink-0 flex-col rounded-xl border p-2 transition-colors sm:w-72 ${
                dragOver === col.id ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-slate-100/70"
              }`}
            >
              <header className="flex items-center justify-between px-1.5 pt-1 pb-2">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${col.color}`}>{col.label}</span>
                  <span className="text-xs text-slate-500">{items.length}</span>
                </div>
                {total > 0 && <span className="text-xs font-medium text-slate-600">{rupees(total)}</span>}
              </header>
              <div className="flex flex-col gap-2 sm:min-h-24">
                {items.map((d) => (
                  <article
                    key={d.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/deal-id", d.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className="card cursor-grab p-3 active:cursor-grabbing"
                  >
                    <Link href={`/deals/${d.id}`} className="block">
                      <div className="text-xs font-medium text-slate-500">{d.brand}</div>
                      <div className="mt-0.5 text-sm leading-snug font-medium text-slate-900">{d.title}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="font-semibold text-slate-700">
                          {d.amount ? rupees(d.amount) : d.is_barter ? "Barter" : "No amount"}
                        </span>
                        {d.next_follow_up && !["paid", "lost"].includes(d.stage) && (
                          <span className={`rounded px-1.5 py-0.5 ${d.next_follow_up <= today ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
                            Follow up {relativeDay(d.next_follow_up, today).toLowerCase()}
                          </span>
                        )}
                        {d.due_date && ["confirmed", "in_progress"].includes(d.stage) && (
                          <span className={`rounded px-1.5 py-0.5 ${d.due_date < today ? "bg-rose-100 text-rose-700" : "bg-amber-50 text-amber-800"}`}>
                            Due {relativeDay(d.due_date, today).toLowerCase()}
                          </span>
                        )}
                      </div>
                    </Link>
                    {/* Phones can't drag well, so offer a quick "move to" menu too. */}
                    <select
                      aria-label="Move to stage"
                      value={d.stage}
                      onChange={(e) => move(d.id, e.target.value as StageId)}
                      className="mt-2 w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600"
                    >
                      {STAGES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.id === d.stage ? `Stage: ${s.label}` : `Move to ${s.label}`}
                        </option>
                      ))}
                    </select>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
