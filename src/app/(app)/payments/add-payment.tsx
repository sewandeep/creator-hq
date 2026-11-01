"use client";

import { useState } from "react";
import { PaymentForm } from "@/components/payment-form";

export function AddPayment(props: { today: string; brands: { id: string; name: string }[]; deals: { id: string; title: string; brand_id: string }[] }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        + Payment without an invoice
      </button>
    );
  return (
    <div className="card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Record a payment (no invoice)</h2>
        <button type="button" className="text-sm text-slate-500" onClick={() => setOpen(false)}>Close</button>
      </div>
      <PaymentForm {...props} onDone={() => setOpen(false)} />
    </div>
  );
}
