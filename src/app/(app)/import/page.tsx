import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { ImportWizard } from "./wizard";

export const metadata: Metadata = { title: "Import past work" };

export default function ImportPage() {
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Import past work"
        subtitle="Paste rows from Google Sheets / Excel, or upload a CSV. You'll see a preview before anything is saved."
      />
      <ImportWizard />
    </div>
  );
}
