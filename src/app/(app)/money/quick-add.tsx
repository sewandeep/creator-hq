"use client";

import { useRef, useState, useTransition } from "react";
import { quickAdd } from "@/app/actions/finance";
import { toast } from "@/components/toast";

/** "450 cab" → saved. The box clears straight away; the result pops up with Undo. */
export function QuickAdd() {
  const [text, setText] = useState("");
  const [, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  return (
    <form
      className="card p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t) return;
        setText("");
        input.current?.focus();
        start(async () => {
          const fd = new FormData();
          fd.set("text", t);
          const r = await quickAdd(undefined, fd).catch(() => ({ error: "Couldn't reach the app — try again.", message: undefined, groupId: undefined }));
          if (r?.error) {
            setText(t);
            toast(r.error, { tone: "error" });
          } else toast(`✅ ${r?.message ?? "Added"}`, { undoGroup: r?.groupId });
        });
      }}
    >
      <div className="flex gap-2">
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
          placeholder='Quick add: "450 cab", "200 chai cash", "lent 2000 to rahul"'
          className="input flex-1"
        />
        <button className="btn-primary" disabled={!text.trim()}>Add</button>
      </div>
    </form>
  );
}
