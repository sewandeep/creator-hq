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
      <label className="block sm:col-span-2">
        <span className="label">Notes</span>
        <textarea name="notes" rows={3} defaultValue={brand?.notes ?? ""} className="input" />
      </label>
    </div>
  );
}
