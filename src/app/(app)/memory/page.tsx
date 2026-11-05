import type { Metadata } from "next";
import { deleteMemory } from "@/app/actions/memory";
import { Tap, TapRow } from "@/components/tap";
import { requireUser } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { AddMemory } from "./add";

export const metadata: Metadata = { title: "AI memory" };

export default async function MemoryPage() {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("ai_memory").select("id, fact, source, created_at").order("created_at", { ascending: false });
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <p className="text-sm text-slate-500">What the assistant knows about you — it reads this before every answer</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">AI memory</h1>
      </div>
      <p className="text-sm text-slate-600">
        Tell the assistant things like <i>“remember that Ravi is my landlord”</i> and they show up here. Sorting a payee with <b>Always use</b> is remembered separately (as a rule).
      </p>
      <AddMemory />
      {error ? (
        <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">Memory isn&apos;t set up yet — run the “Suggestions &amp; memory” database update (see Setup check).</p>
      ) : !data?.length ? (
        <p className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 ring-1 ring-slate-200">Nothing remembered yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
          {data.map((m) => (
            <TapRow key={m.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="text-[15px] break-words">{m.fact}</div>
                <div className="text-xs text-slate-400">{fmtDateTime(m.created_at)} · {m.source === "you" ? "added by you" : `told on ${m.source === "telegram" ? "Telegram" : "the app"}`}</div>
              </div>
              <Tap action={deleteMemory.bind(null, m.id)} hideRow saved="Forgotten" className="btn-ghost shrink-0 px-2 py-1 text-xs text-slate-500">Forget</Tap>
            </TapRow>
          ))}
        </ul>
      )}
    </div>
  );
}
