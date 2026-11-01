"use server";

import { requireUser } from "@/lib/auth";
import { FILE_KINDS } from "@/lib/constants";
import { FormError, oneOf, toActionError, type ActionState } from "@/lib/forms";
import { refreshAll } from "./helpers";

const KINDS = FILE_KINDS.map((k) => k.id);
const MAX_BYTES = 25 * 1024 * 1024;

export async function uploadDealFile(dealId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  try {
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new FormError("Choose a file to upload.");
    if (file.size > MAX_BYTES) throw new FormError("Files can be up to 25 MB.");
    const kind = oneOf(fd, "kind", KINDS) ?? "other";

    const { data: deal, error: dealError } = await supabase.from("deals").select("brand_id").eq("id", dealId).single();
    if (dealError) throw dealError;

    const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(-120);
    const path = `${userId}/${dealId}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("deal-files")
      .upload(path, file, { contentType: file.type || "application/octet-stream" });
    if (uploadError) throw uploadError;

    const { error } = await supabase.from("deal_files").insert({
      deal_id: dealId,
      kind,
      name: file.name,
      storage_path: path,
      size_bytes: file.size,
      mime_type: file.type || null,
    });
    if (error) {
      await supabase.storage.from("deal-files").remove([path]);
      throw error;
    }
    await supabase.from("activities").insert({
      deal_id: dealId,
      brand_id: deal.brand_id,
      kind: "file",
      body: `Uploaded ${kind}: ${file.name}`,
    });
  } catch (e) {
    return toActionError(e);
  }
  refreshAll();
  return { ok: true, message: "Uploaded." };
}

export async function deleteDealFile(fileId: string) {
  const { supabase } = await requireUser();
  const { data: file, error } = await supabase.from("deal_files").select("storage_path").eq("id", fileId).single();
  if (error) throw new Error(error.message);
  await supabase.storage.from("deal-files").remove([file.storage_path]);
  const { error: deleteError } = await supabase.from("deal_files").delete().eq("id", fileId);
  if (deleteError) throw new Error(deleteError.message);
  refreshAll();
}
