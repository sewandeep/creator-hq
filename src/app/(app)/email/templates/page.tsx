import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { TEMPLATE_VARIABLES } from "@/lib/templates";
import { ensureDefaultTemplates } from "@/lib/templates-server";
import { TemplateEditor } from "./template-editor";

export const metadata: Metadata = { title: "Email templates" };

export default async function TemplatesPage() {
  const { supabase } = await requireUser();
  await ensureDefaultTemplates(supabase);
  const { data } = await supabase.from("email_templates").select("id, name, subject, body, attach_invoice").order("position").order("created_at");

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Email templates" subtitle="Write once, reuse forever. Placeholders fill in automatically." />
      <div className="card divide-y divide-slate-100">
        {data?.map((t) => <TemplateEditor key={t.id} t={t} />)}
      </div>
      <TemplateEditor />
      <Card title="Placeholders you can use">
        <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {TEMPLATE_VARIABLES.map((v) => (
            <li key={v.key}>
              <code className="rounded bg-slate-100 px-1 text-xs">{`{{${v.key}}}`}</code> <span className="text-slate-500">{v.hint}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
