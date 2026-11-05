import type { Metadata } from "next";
import { SuggestionCard } from "@/components/suggestion-card";
import { requireUser } from "@/lib/auth";
import { loadSuggestions } from "@/lib/suggestions";

export const metadata: Metadata = { title: "Suggestions" };

const GROUPS = [
  { type: "income", label: "Brand money to link" },
  { type: "recat", label: "Probably the wrong category" },
  { type: "duplicate", label: "Possible double charges" },
  { type: "lending", label: "Money you're owed" },
  { type: "subscription", label: "Monthly payments" },
  { type: "spike", label: "Spending this month" },
] as const;

export default async function SuggestionsPage() {
  const { supabase, userId } = await requireUser();
  const all = await loadSuggestions(supabase, userId, { limit: 200 });
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm text-slate-500">Things the app noticed in your data — one tap to fix, and every fix can be undone</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Suggestions</h1>
      </div>
      {all.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 ring-1 ring-slate-200">✨ Nothing to suggest right now.</p>
      ) : (
        GROUPS.map((g) => {
          const list = all.filter((s) => s.type === g.type);
          if (!list.length) return null;
          return (
            <section key={g.type} className="space-y-2.5">
              <h2 className="font-semibold">{g.label} <span className="text-sm font-normal text-slate-400">{list.length}</span></h2>
              {list.map((s) => (
                <SuggestionCard key={s.key} s={s} />
              ))}
            </section>
          );
        })
      )}
    </div>
  );
}
