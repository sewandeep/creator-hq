import type { Metadata } from "next";
import { createDeal } from "@/app/actions/deals";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { todayIST } from "@/lib/format";
import { DealForm } from "../deal-form";
import { loadFormOptions } from "../form-data";

export const metadata: Metadata = { title: "New deal" };

export default async function NewDealPage({ searchParams }: { searchParams: Promise<{ brand?: string; stage?: string }> }) {
  const { brand, stage } = await searchParams;
  const { supabase } = await requireUser();
  const { brands, contacts } = await loadFormOptions(supabase);

  return (
    <div className="max-w-3xl">
      <PageHeader title="New deal" subtitle="A lead you're chasing, a deal in talks, or work already done." />
      <DealForm
        action={createDeal}
        brands={brands}
        contacts={contacts}
        defaults={{ brand_id: brand, stage }}
        today={todayIST()}
        submitLabel="Create deal"
      />
    </div>
  );
}
