import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { ensureCategories } from "@/lib/finance/categories-server";
import { fmtDate, rupees } from "@/lib/format";
import { QuickAdd } from "../quick-add";

export const metadata: Metadata = { title: "Lending" };

export default async function LendingPage() {
  const { supabase } = await requireUser();
  const categories = await ensureCategories(supabase);
  const ids = categories.filter((c) => c.kind === "lending").map((c) => c.id);
  const { data } = ids.length
    ? await supabase.from("transactions").select("id, txn_date, amount, direction, person, description, note, source, matched_txn_id").in("category_id", ids).order("txn_date", { ascending: false })
    : { data: [] };

  // Count each payment once (your entry and its bank line are the same money).
  const rows = (data ?? []).filter((t) => !(t.source !== "statement" && t.matched_txn_id));
  const people = new Map<string, { name: string; lent: number; back: number; items: typeof rows }>();
  for (const t of rows) {
    const name = t.person?.trim() || "Not named yet";
    const key = name.toLowerCase();
    const p = people.get(key) ?? { name, lent: 0, back: 0, items: [] };
    if (t.direction === "debit") p.lent += Number(t.amount);
    else p.back += Number(t.amount);
    p.items.push(t);
    people.set(key, p);
  }
  const list = [...people.values()].sort((a, b) => b.lent - b.back - (a.lent - a.back));
  const owed = list.reduce((s, p) => s + Math.max(0, p.lent - p.back), 0);

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Lending" subtitle="Money you've lent and who still owes you." />
      <QuickAdd />
      <div className="grid grid-cols-2 gap-3">
        <Stat label="People owe you" value={rupees(owed)} />
        <Stat label="People" value={list.filter((p) => p.lent - p.back > 0).length} hint="with money still to return" />
      </div>
      {list.length === 0 ? (
        <Empty>Nothing yet. Type &quot;lent 2000 to rahul&quot; above, or mark a bank payment as &quot;Lent money&quot;.</Empty>
      ) : (
        list.map((p) => {
          const due = p.lent - p.back;
          return (
            <Card key={p.name} title={p.name} action={due > 0 ? <Badge tone="amber">Owes {rupees(due)}</Badge> : due < 0 ? <Badge tone="violet">You owe {rupees(-due)}</Badge> : <Badge tone="green">Settled</Badge>}>
              <ul className="space-y-1.5 text-sm">
                {p.items.map((t) => (
                  <li key={t.id} className="flex justify-between gap-2">
                    <Link href={`/money/transactions/${t.id}`} className="truncate hover:underline">
                      {fmtDate(t.txn_date, true)} · {t.direction === "debit" ? "Lent" : "Got back"} {t.note ? `· ${t.note}` : ""}
                    </Link>
                    <span className={`tabular-nums ${t.direction === "credit" ? "text-emerald-700" : ""}`}>{t.direction === "debit" ? "−" : "+"}{rupees(t.amount)}</span>
                  </li>
                ))}
              </ul>
              {p.name === "Not named yet" && <p className="mt-2 text-xs text-slate-500">Open these and add who it was, so they&apos;re tracked per person.</p>}
            </Card>
          );
        })
      )}
    </div>
  );
}
