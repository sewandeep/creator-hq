"use server";

import { requireUser } from "@/lib/auth";
import { FormError, int, money, text, toActionError, type ActionState } from "@/lib/forms";
import { refreshAll } from "./helpers";

export async function saveProfile(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  try {
    const pan = text(fd, "pan")?.toUpperCase().replace(/\s+/g, "") ?? null;
    if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) throw new FormError("PAN should look like ABCDE1234F.");
    const ifsc = text(fd, "bank_ifsc")?.toUpperCase().replace(/\s+/g, "") ?? null;
    if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) throw new FormError("IFSC should look like KKBK0001234.");
    const rate = money(fd, "default_tds_rate") ?? 10;
    if (rate > 100) throw new FormError("TDS rate can't be more than 100%.");

    const { error } = await supabase.from("profile").upsert({
      user_id: userId,
      legal_name: text(fd, "legal_name"),
      display_name: text(fd, "display_name"),
      pan,
      address: text(fd, "address"),
      email: text(fd, "email"),
      phone: text(fd, "phone"),
      bank_account_name: text(fd, "bank_account_name"),
      bank_name: text(fd, "bank_name"),
      bank_account_number: text(fd, "bank_account_number")?.replace(/\s+/g, "") ?? null,
      bank_ifsc: ifsc,
      upi_id: text(fd, "upi_id"),
      invoice_prefix: (text(fd, "invoice_prefix") ?? "INV").replace(/[^\w-]/g, "").slice(0, 12) || "INV",
      payment_terms_days: int(fd, "payment_terms_days", 15),
      default_tds_rate: rate,
      default_tds_section: text(fd, "default_tds_section") ?? "194J",
      invoice_footer: text(fd, "invoice_footer"),
    });
    if (error) throw error;
  } catch (e) {
    return toActionError(e);
  }
  refreshAll();
  return { ok: true, message: "Saved." };
}
