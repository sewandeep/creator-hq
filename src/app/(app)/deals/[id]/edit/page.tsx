import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { updateDeal } from "@/app/actions/deals";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { todayIST } from "@/lib/format";
import { DealForm } from "../../deal-form";
import { loadFormOptions } from "../../form-data";

export const metadata: Metadata = { title: "Edit deal" };

export default async function EditDealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const [{ data: deal }, options] = await Promise.all([
    supabase.from("deals").select("*").eq("id", id).maybeSingle(),
    loadFormOptions(supabase),
  ]);
  if (!deal) notFound();

  return (
    <div className="max-w-3xl">
      <PageHeader title="Edit deal" subtitle={deal.title} />
      <DealForm
        action={updateDeal.bind(null, id)}
        brands={options.brands}
        contacts={options.contacts}
        deal={deal}
        today={todayIST()}
        submitLabel="Save changes"
      />
    </div>
  );
}
