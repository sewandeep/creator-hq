import { NextResponse } from "next/server";
import { runDailyDigest } from "@/lib/telegram/run-digest";
import { isTelegramConfigured } from "@/lib/telegram/api";

export const maxDuration = 60;

// Called by Vercel Cron every morning (see vercel.json). Vercel sends
// "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (!isTelegramConfigured()) return NextResponse.json({ ok: false, reason: "Telegram not configured" });
  const results = await runDailyDigest();
  return NextResponse.json({ ok: true, results });
}
