import type { Brand } from "@/lib/types";

export function BrandFields({ brand }: { brand?: Brand }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block">
        <span className="label">Brand name</span>
        <input name="name" required defaultValue={brand?.name} className="input" />
      </label>
      <label className="block">
        <span className="label">Category</span>
        <input name="category" defaultValue={brand?.category ?? ""} placeholder="Tech, beauty, food, finance…" className="input" />
      </label>
      <label className="block">
        <span className="label">Website</span>
        <input name="website" defaultValue={brand?.website ?? ""} placeholder="https://" className="input" />
      </label>
      <label className="block">
        <span className="label">Instagram handle</span>
        <input name="instagram" defaultValue={brand?.instagram ?? ""} placeholder="@brand" className="input" />
      </label>
      <details className="sm:col-span-2" open={Boolean(brand?.legal_name || brand?.billing_address || brand?.gstin || brand?.tan)}>
        <summary className="cursor-pointer text-sm font-medium text-slate-700">Billing details (for invoices & 26AS)</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Company legal name</span>
            <input name="legal_name" defaultValue={brand?.legal_name ?? ""} placeholder="Imagine Marketing Pvt Ltd" className="input" />
          </label>
          <label className="block">
            <span className="label">GSTIN</span>
            <input name="gstin" defaultValue={brand?.gstin ?? ""} className="input uppercase" />
          </label>
          <label className="block sm:col-span-2">
            <span className="label">Billing address</span>
            <textarea name="billing_address" rows={2} defaultValue={brand?.billing_address ?? ""} className="input" />
          </label>
          <label className="block">
            <span className="label">Company PAN</span>
            <input name="pan" defaultValue={brand?.pan ?? ""} className="input uppercase" />
          </label>
          <label className="block">
            <span className="label">TAN (shows in your 26AS)</span>
            <input name="tan" defaultValue={brand?.tan ?? ""} placeholder="MUMA12345B" className="input uppercase" />
          </label>
        </div>
      </details>
      <label className="block sm:col-span-2">
        <span className="label">Notes</span>
        <textarea name="notes" rows={3} defaultValue={brand?.notes ?? ""} className="input" />
      </label>
    </div>
  );
}
