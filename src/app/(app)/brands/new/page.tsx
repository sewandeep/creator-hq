import type { Metadata } from "next";
import { createBrand } from "@/app/actions/brands";
import { ActionForm, SubmitButton } from "@/components/forms";
import { PageHeader } from "@/components/ui";
import { BrandFields } from "../brand-fields";

export const metadata: Metadata = { title: "New brand" };

export default function NewBrandPage() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="New brand" />
      <ActionForm action={createBrand} className="card space-y-4 p-5">
        <BrandFields />
        <SubmitButton>Create brand</SubmitButton>
      </ActionForm>
    </div>
  );
}
