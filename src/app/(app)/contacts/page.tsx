import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Contacts" };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("contacts").select("*, brand:brands(id, name)").order("name");
  if (error) throw error;

  const needle = q.trim().toLowerCase();
  const contacts = (data ?? []).filter(
    (c) =>
      !needle ||
      [c.name, c.email, c.phone, c.role, c.brand?.name].some((v) => v?.toLowerCase().includes(needle)),
  );

  return (
    <>
      <PageHeader title="Contacts" subtitle="Everyone you talk to at brands and agencies. Add contacts from a brand's page." />
      <form className="mb-4 flex gap-2" action="/contacts">
        <input name="q" defaultValue={q} placeholder="Search name, email, brand…" className="input max-w-xs" />
        <button className="btn-secondary">Search</button>
      </form>
      {contacts.length === 0 ? (
        <Empty action={<Link href="/brands" className="btn-secondary">Go to brands</Link>}>No contacts yet.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead>
              <tr>
                <th className="th">Name</th>
                <th className="th">Brand</th>
                <th className="th">Email</th>
                <th className="th">Phone</th>
                <th className="th">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="td font-medium">{c.name}</td>
                  <td className="td">{c.brand ? <Link href={`/brands/${c.brand.id}#contacts`} className="link">{c.brand.name}</Link> : "—"}</td>
                  <td className="td">{c.email ? <a href={`mailto:${c.email}`} className="link">{c.email}</a> : "—"}</td>
                  <td className="td whitespace-nowrap">{c.phone ? <a href={`tel:${c.phone}`} className="link">{c.phone}</a> : "—"}</td>
                  <td className="td text-slate-600">{c.role ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
