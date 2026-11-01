export const STAGES = [
  { id: "lead", label: "Lead", color: "bg-slate-100 text-slate-700" },
  { id: "contacted", label: "Contacted", color: "bg-sky-100 text-sky-800" },
  { id: "negotiating", label: "Negotiating", color: "bg-amber-100 text-amber-800" },
  { id: "confirmed", label: "Confirmed", color: "bg-violet-100 text-violet-800" },
  { id: "in_progress", label: "Creating content", color: "bg-indigo-100 text-indigo-800" },
  { id: "posted", label: "Posted", color: "bg-teal-100 text-teal-800" },
  { id: "invoiced", label: "Invoiced", color: "bg-orange-100 text-orange-800" },
  { id: "paid", label: "Paid", color: "bg-emerald-100 text-emerald-800" },
  { id: "lost", label: "Lost", color: "bg-rose-100 text-rose-700" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];
export const STAGE_IDS = STAGES.map((s) => s.id) as StageId[];

/** Early stages: still a lead you're chasing. */
export const LEAD_STAGES: StageId[] = ["lead", "contacted", "negotiating"];
/** Work agreed but not yet paid. */
export const ACTIVE_STAGES: StageId[] = ["confirmed", "in_progress", "posted", "invoiced"];
/** Work that is done (for history and earnings). */
export const DONE_STAGES: StageId[] = ["posted", "invoiced", "paid"];

export function stageInfo(id: string) {
  return STAGES.find((s) => s.id === id) ?? STAGES[0];
}

export const SOURCES = [
  { id: "inbound", label: "Inbound (they reached out)" },
  { id: "outbound", label: "Outbound (I pitched)" },
  { id: "agency", label: "Agency / manager" },
  { id: "referral", label: "Referral" },
  { id: "other", label: "Other" },
] as const;

export const PLATFORMS = ["Instagram", "YouTube", "Instagram + YouTube", "Facebook", "X", "LinkedIn", "Other"];

export const DELIVERABLE_TYPES = [
  "Reel",
  "Story",
  "Post",
  "Carousel",
  "YouTube Video",
  "YouTube Short",
  "Integration",
  "Live",
  "Event / Appearance",
  "UGC",
  "Other",
];

export const DELIVERABLE_STATUSES = [
  { id: "todo", label: "To do" },
  { id: "in_progress", label: "Working on it" },
  { id: "sent_for_approval", label: "Sent for approval" },
  { id: "approved", label: "Approved" },
  { id: "posted", label: "Posted" },
] as const;

export const ACTIVITY_KINDS = [
  { id: "note", label: "Note" },
  { id: "email", label: "Email" },
  { id: "call", label: "Call" },
  { id: "meeting", label: "Meeting" },
  { id: "follow_up", label: "Follow-up" },
] as const;

export const FILE_KINDS = [
  { id: "brief", label: "Brief" },
  { id: "contract", label: "Contract" },
  { id: "other", label: "Other" },
] as const;
