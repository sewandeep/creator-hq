// Starts reading a statement and waits for the result by checking every few
// seconds (instead of holding one long connection, which phones drop).

export type StatementResult = {
  status: string;
  message: string;
  added?: number;
  duplicates?: number;
  review?: number;
  balanceOk?: boolean;
  issues?: string[];
};

export async function readStatement(
  id: string,
  password?: string,
  onWaiting?: (seconds: number, progress: string | null) => void,
  /** Called with the background job's id, so the page can show live steps + Stop. */
  onJob?: (jobId: string) => void,
): Promise<StatementResult> {
  const start = await fetch(`/api/statements/${id}/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: password || undefined }),
  })
    .then((r) => r.json())
    .catch(() => null);
  if (!start) return { status: "failed", message: "Couldn't reach the app — check your connection and try again." };
  if (start.status !== "processing") return start as StatementResult;
  if (start.jobId) onJob?.(start.jobId);

  // Up to ~6 minutes; a missed check (phone asleep, network blip) just tries again.
  for (let i = 0; i < 180; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const s = await fetch(`/api/statements/${id}/status`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    onWaiting?.((i + 1) * 2, s?.progress ?? null);
    if (s && s.status !== "processing") return s as StatementResult;
  }
  return { status: "failed", message: "This is taking unusually long. It may still finish — check the Money page in a few minutes." };
}
