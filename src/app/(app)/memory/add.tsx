"use client";

import { useState, useTransition } from "react";
import { addMemory } from "@/app/actions/memory";
import { toast } from "@/components/toast";

export function AddMemory() {
  const [text, setText] = useState("");
  const [, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t) return;
        setText("");
        start(async () => {
          const r = await addMemory(t);
          if (r.error) {
            setText(t);
            toast(r.error, { tone: "error" });
          } else toast("Remembered", { undoGroup: r.groupId });
        });
      }}
      className="card flex gap-2 p-3"
    >
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder='e.g. "Payments to Ramesh are Sajilo expenses"' className="input flex-1" />
      <button className="btn-primary" disabled={!text.trim()}>Remember</button>
    </form>
  );
}
