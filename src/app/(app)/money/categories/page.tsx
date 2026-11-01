import type { Metadata } from "next";
import { deleteCategory, deleteRule } from "@/app/actions/finance";
import { ConfirmButton } from "@/components/forms";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { KIND_LABEL, type CategoryKind } from "@/lib/finance/categories";
import { ensureCategories } from "@/lib/finance/categories-server";
import { CategoryForm, EditCategory } from "./parts";

export const metadata: Metadata = { title: "Categories & rules" };

export default async function CategoriesPage() {
  const { supabase } = await requireUser();
  const categories = await ensureCategories(supabase);
  const { data: rules } = await supabase.from("category_rules").select("id, pattern, direction, hits, category:categories(name, emoji)").order("created_at", { ascending: false });

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Categories & rules" />
      <Card title={`Your rules (${rules?.length ?? 0})`}>
        <p className="mb-3 text-sm text-slate-600">Made when you tick &quot;Always use this category&quot;. They run before the AI, on every new statement.</p>
        {rules?.length ? (
          <ul className="divide-y divide-slate-100">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>
                  {r.direction === "credit" ? "Money in" : r.direction === "debit" ? "Money out" : "Anything"} containing <b>“{r.pattern}”</b> → {r.category?.emoji} {r.category?.name}
                  <span className="text-xs text-slate-400"> · used {r.hits}×</span>
                </span>
                <ConfirmButton action={deleteRule.bind(null, r.id)} confirmText="Delete this rule? (Already categorised transactions stay as they are.)" className="text-xs text-rose-500 hover:underline">Delete</ConfirmButton>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No rules yet.</p>
        )}
      </Card>

      {(Object.keys(KIND_LABEL) as CategoryKind[]).map((k) => (
        <Card key={k} title={KIND_LABEL[k]}>
          <ul className="divide-y divide-slate-100">
            {categories.filter((c) => c.kind === k).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>{c.emoji} {c.name}{c.is_business && <span className="ml-1 text-xs text-brand-600">· work</span>}</span>
                <span className="flex items-center gap-3">
                  <EditCategory c={c} />
                  <ConfirmButton action={deleteCategory.bind(null, c.id)} confirmText={`Delete "${c.name}"? Its transactions go back to the review list.`} className="text-xs text-rose-500 hover:underline">Delete</ConfirmButton>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
      <Card title="Add a category"><CategoryForm /></Card>
    </div>
  );
}
