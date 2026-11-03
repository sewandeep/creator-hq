"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { toast } from "./toast";

// One-tap buttons that react instantly: the screen changes the moment you tap,
// the save happens in the background, and you get "Saved · Undo". If the save
// fails, the screen goes back and tells you why.

type Result = { groupId?: string; error?: string } | void | undefined | unknown;

const RowCtx = createContext<{ hide: () => void; show: () => void } | null>(null);

/** Wraps a list row so a Tap inside can make it disappear right away. */
export function TapRow({ children, className = "", as = "li" }: { children: React.ReactNode; className?: string; as?: "li" | "div" }) {
  const [hidden, setHidden] = useState(false);
  const Tag = as;
  if (hidden) return null;
  return (
    <RowCtx value={{ hide: () => setHidden(true), show: () => setHidden(false) }}>
      <Tag className={className}>{children}</Tag>
    </RowCtx>
  );
}

export function Tap({
  action,
  children,
  className = "btn-secondary",
  done,
  hideRow = false,
  saved = "Saved",
  title,
  disabled,
}: {
  action: () => Promise<Result>;
  children: React.ReactNode;
  className?: string;
  /** What the button says once tapped (e.g. "Posted ✓"). */
  done?: React.ReactNode;
  /** Remove the surrounding TapRow straight away. */
  hideRow?: boolean;
  /** The toast text. Empty string = no toast. */
  saved?: string;
  title?: string;
  disabled?: boolean;
}) {
  const row = useContext(RowCtx);
  const [tapped, setTapped] = useState(false);
  const [pending, start] = useTransition();

  function onClick() {
    setTapped(true);
    if (hideRow) row?.hide();
    start(async () => {
      try {
        const r = (await action()) as { groupId?: string; error?: string } | undefined;
        if (r?.error) throw new Error(r.error);
        if (saved) toast(saved, { undoGroup: r?.groupId });
      } catch (e) {
        // Redirects (e.g. to the email screen) aren't errors.
        if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) throw e;
        setTapped(false);
        row?.show();
        toast(`Couldn't save: ${e instanceof Error ? e.message : "something went wrong"}`, { tone: "error" });
      }
    });
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled || (pending && !done)} title={title} className={`${className} ${pending && !done ? "opacity-70" : ""}`}>
      {tapped && done ? done : children}
    </button>
  );
}
