"use client";

import { useState, useTransition } from "react";
import { disconnectTelegram, registerWebhook, saveReminders, sendDigestNow, startTelegramLink, type TgResult } from "@/app/actions/telegram";
import { ActionForm, SubmitButton } from "@/components/forms";

export function TelegramControls({
  connected,
  webhookOk,
  reminders,
}: {
  connected: boolean;
  webhookOk: boolean;
  reminders: { digest?: boolean; statements?: boolean };
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<TgResult | null>(null);
  const run = (fn: () => Promise<TgResult>) => start(async () => setResult(await fn()));

  return (
    <div className="space-y-4 text-sm">
      <ol className="space-y-3">
        <li className="flex flex-wrap items-center justify-between gap-2">
          <span><b>1.</b> Point the bot at this app {webhookOk && <span className="text-emerald-700">✓</span>}</span>
          <button type="button" disabled={pending} onClick={() => run(registerWebhook)} className="btn-secondary px-3 py-1.5">
            {webhookOk ? "Re-connect bot" : "Connect bot"}
          </button>
        </li>
        <li className="flex flex-wrap items-center justify-between gap-2">
          <span><b>2.</b> Link your Telegram chat {connected && <span className="text-emerald-700">✓</span>}</span>
          {connected ? (
            <form action={disconnectTelegram}><button className="btn-ghost px-3 py-1.5 text-rose-600">Disconnect</button></form>
          ) : (
            <button
              type="button"
              disabled={pending || !webhookOk}
              onClick={() =>
                start(async () => {
                  const r = await startTelegramLink();
                  setResult(r.link ? { ok: true, message: "Opening Telegram — tap Start there." } : r);
                  if (r.link) window.open(r.link, "_blank");
                })
              }
              className="btn-primary px-3 py-1.5"
            >
              Open Telegram & connect
            </button>
          )}
        </li>
        <li className="flex flex-wrap items-center justify-between gap-2">
          <span><b>3.</b> Try the morning message</span>
          <button type="button" disabled={pending || !connected} onClick={() => run(sendDigestNow)} className="btn-secondary px-3 py-1.5">
            Send it now
          </button>
        </li>
      </ol>
      {result && <p className={`rounded-lg px-3 py-2 ${result.error ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-800"}`}>{result.error ?? result.message}</p>}

      <ActionForm action={saveReminders} className="space-y-2 border-t border-slate-100 pt-4">
        <label className="flex items-start gap-2">
          <input type="checkbox" name="digest" defaultChecked={reminders.digest !== false} className="mt-0.5" />
          <span><b>Morning message at 9 AM</b> — only on days something needs you: follow-ups, content due, overdue invoices, transactions to review, advance tax.</span>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" name="statements" defaultChecked={reminders.statements !== false} className="mt-0.5" />
          <span><b>Keep reminding me to upload last month&apos;s statement</b> — every morning from the 2nd until it&apos;s uploaded (you can snooze 3 days from the message).</span>
        </label>
        <SubmitButton className="btn-secondary">Save reminder settings</SubmitButton>
      </ActionForm>
    </div>
  );
}
