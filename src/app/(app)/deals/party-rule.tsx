"use client";

import { useState, useTransition } from "react";
import { setPartyRule } from "@/app/actions/deal-money";
import { toast } from "@/components/toast";

/** "Does this agency/brand cut TDS?" — and whether it's an agency at all. */
export function PartyRule({ brandId, isAgency, tdsRate }: { brandId: string; isAgency: boolean; tdsRate: number | null }) {
  const [rate, setRate] = useState(tdsRate === null ? "" : String(tdsRate));
  const [, start] = useTransition();
  const save = (rule: Parameters<typeof setPartyRule>[1], ok: string) =>
    start(async () => {
      const r = await setPartyRule(brandId, rule);
      if (r.error) toast(r.error, { tone: "error" });
      else toast(ok, { undoGroup: r.groupId });
    });
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs">
      <select
        value={rate}
        onChange={(e) => {
          setRate(e.target.value);
          save({ tdsRate: e.target.value === "" ? null : Number(e.target.value) }, e.target.value === "0" ? "Saved: doesn't cut TDS" : e.target.value ? `Saved: cuts ${e.target.value}% TDS` : "TDS rule cleared");
        }}
        className={`rounded-full px-2 py-0.5 ring-1 ${rate === "" ? "text-slate-500 ring-slate-200" : rate === "0" ? "text-slate-600 ring-slate-200" : "bg-amber-50 text-amber-800 ring-amber-200"}`}
        title="Does this one cut TDS? New deals with them use this."
      >
        <option value="">TDS rule: not set</option>
        <option value="10">Cuts 10% TDS</option>
        <option value="2">Cuts 2% TDS</option>
        <option value="0">No TDS</option>
      </select>
      <button
        type="button"
        onClick={() => save({ isAgency: !isAgency }, isAgency ? "Now treated as a brand" : "Now treated as an agency")}
        className="rounded-full px-2 py-0.5 text-slate-500 ring-1 ring-slate-200 hover:text-slate-800"
      >
        {isAgency ? "Not an agency?" : "This is an agency"}
      </button>
    </span>
  );
}
