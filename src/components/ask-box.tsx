"use client";

import { useState } from "react";
import { useAssistant } from "./assistant";

/** "Ask or add anything" — opens the assistant with your message. */
export function AskBox({ placeholder = 'Ask or add anything — "450 cab", "add a deal with Noise, 1 reel, 25k", "who owes me?"' }: { placeholder?: string }) {
  const [q, setQ] = useState("");
  const { open } = useAssistant();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        open(q);
        setQ("");
      }}
      className="flex gap-2 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-brand-500"
    >
      <span className="self-center pl-2 text-lg" aria-hidden>✨</span>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent px-1 text-[15px] outline-none placeholder:text-slate-400" aria-label="Ask AI" />
      <button className="btn-primary rounded-xl">Ask</button>
    </form>
  );
}
