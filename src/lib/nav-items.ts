// The four main places, plus everything else under "More".
export const MAIN_NAV = [
  { href: "/", label: "Today", icon: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" },
  { href: "/deals", label: "Work", icon: "M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v6h-4z" },
  { href: "/money", label: "Money", icon: "M3 7h18v12H3zM16 13h2M3 10h18" },
  { href: "/reports", label: "Reports", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
];

export const MORE_NAV = [
  { href: "/suggestions", label: "Suggestions" },
  { href: "/money/lending", label: "Lending & borrowing" },
  { href: "/activity", label: "Activity & undo" },
  { href: "/memory", label: "AI memory" },
  { href: "/calendar", label: "Calendar" },
  { href: "/brands", label: "Brands" },
  { href: "/contacts", label: "Contacts" },
  { href: "/invoices", label: "Invoices" },
  { href: "/email", label: "Emails" },
  { href: "/import", label: "Import past work" },
  { href: "/settings", label: "Settings" },
  { href: "/setup", label: "Setup check" },
];

// Kept for older screens that list everything.
export const NAV = [...MAIN_NAV.map((n) => ({ ...n, group: "" })), ...MORE_NAV.map((n) => ({ ...n, group: "More", icon: "" }))];

/** Which main tab a page belongs to. */
export function sectionOf(pathname: string) {
  if (pathname === "/") return "/";
  if (/^\/(deals|leads|brands|contacts|calendar|email|invoices)/.test(pathname)) return "/deals";
  if (pathname.startsWith("/money")) return "/money";
  if (/^\/(reports|history|insights|tax|payments)/.test(pathname)) return "/reports";
  return "";
}
