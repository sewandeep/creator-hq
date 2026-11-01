import { timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { webhookSecret } from "@/lib/telegram/api";
import { handleUpdate, type TgUpdate } from "@/lib/telegram/bot";

// Reading a forwarded statement can take a minute or two (runs after we reply to Telegram).
export const maxDuration = 300;

export async function POST(req: Request) {
  // Only Telegram knows this secret (we gave it when registering the webhook).
  const got = Buffer.from(req.headers.get("x-telegram-bot-api-secret-token") ?? "");
  const want = Buffer.from(webhookSecret());
  if (got.length !== want.length || !timingSafeEqual(got, want)) return new NextResponse("Forbidden", { status: 403 });

  const update = (await req.json().catch(() => null)) as TgUpdate | null;
  if (!update) return NextResponse.json({ ok: true });
  try {
    const later = await handleUpdate(update);
    if (later) after(async () => {
      try {
        await later();
      } catch (e) {
        console.error("telegram background task failed", e);
      }
    });
  } catch (e) {
    // Always answer 200, otherwise Telegram keeps re-sending the same message.
    console.error("telegram update failed", e);
  }
  return NextResponse.json({ ok: true });
}
