"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** "Ask or add anything" — sends you to the assistant with your message. */
export function AskBox({ placeholder = 'Ask or add anything — "how much did I spend on food?", "450 cab", "add a deal with Noise…"' }: { placeholder?: string }) {
  const [q, setQ] = useState("");
  const router = useRouter();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/ask?q=${encodeURIComponent(q.trim())}`);
      }}
      className="card flex gap-2 p-3"
    >
      <span className="self-center pl-1 text-lg" aria-hidden>✨</span>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="input flex-1" aria-label="Ask AI" />
      <button className="btn-primary">Ask</button>
    </form>
  );
}
