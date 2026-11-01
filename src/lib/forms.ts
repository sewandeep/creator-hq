// Small helpers for reading values out of submitted forms.

export function text(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export function requiredText(fd: FormData, key: string, label: string): string {
  const v = text(fd, key);
  if (!v) throw new FormError(`${label} is required.`);
  return v;
}

export function money(fd: FormData, key: string): number | null {
  const v = text(fd, key);
  if (!v) return null;
  const n = Number(v.replace(/[₹,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) throw new FormError(`"${v}" isn't a valid amount.`);
  return n;
}

export function int(fd: FormData, key: string, fallback: number): number {
  const v = text(fd, key);
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function date(fd: FormData, key: string): string | null {
  const v = text(fd, key);
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new FormError(`"${v}" isn't a valid date.`);
  return v;
}

export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

export function oneOf<T extends string>(fd: FormData, key: string, allowed: readonly T[]): T | null {
  const v = text(fd, key);
  if (!v) return null;
  return (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

/** An error whose message is safe to show to the user. */
export class FormError extends Error {}

export type ActionState = { error?: string; ok?: boolean; message?: string } | undefined;

export function toActionError(e: unknown): ActionState {
  if (e instanceof FormError) return { error: e.message };
  if (e && typeof e === "object" && "message" in e && typeof e.message === "string") {
    // Supabase/Postgres errors: make the common ones readable.
    if (e.message.includes("brands_user_name_key")) return { error: "A brand with that name already exists." };
    if (e.message.includes("violates foreign key") && e.message.includes("deals")) {
      return { error: "This brand still has deals. Delete or move those deals first." };
    }
    return { error: e.message };
  }
  return { error: "Something went wrong. Please try again." };
}
