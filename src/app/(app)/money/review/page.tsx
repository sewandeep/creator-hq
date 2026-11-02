import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { ensureCategories } from "@/lib/finance/categories-server";
import { ReviewList } from "../review-card";
import { loadReviewItems } from "../review-data";

export const metadata: Metadata = { title: "Review" };

export default async function ReviewPage() {
  const { supabase } = await requireUser();
  const categories = await ensureCategories(supabase);
  const { items, count } = await loadReviewItems(supabase, categories, 30);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Sort transactions"
        subtitle={count ? `${count} the AI wasn't sure about. Tap a category — tick "Always use" and it remembers.` : "All caught up."}
        actions={<Link href="/money" className="btn-secondary">Back to Money</Link>}
      />
      {!items.length ? (
        <Empty action={<Link href="/money" className="btn-secondary">Back to Money</Link>}>Nothing to sort. 🎉</Empty>
      ) : (
        <div className="space-y-3">
          <ReviewList categories={categories} items={items} />
          {count > items.length && <p className="text-center text-sm text-slate-500">Showing 30 at a time — reload for the next batch.</p>}
        </div>
      )}
    </div>
  );
}
