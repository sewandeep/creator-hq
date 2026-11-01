import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { ensureCategories } from "@/lib/finance/categories-server";
import { todayIST } from "@/lib/format";
import { QuickAdd } from "../quick-add";
import { AddForm } from "./form";

export const metadata: Metadata = { title: "Add entry" };

export default async function AddPage() {
  const { supabase } = await requireUser();
  const categories = await ensureCategories(supabase);
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Add an entry" subtitle="For cash, or anything you want noted before the statement comes in. When the statement arrives, the matching bank line is linked to it — nothing counts twice." />
      <div>
        <div className="label">The fast way</div>
        <QuickAdd />
      </div>
      <div>
        <div className="label">Or fill in the details</div>
        <AddForm categories={categories} today={todayIST()} />
      </div>
    </div>
  );
}
