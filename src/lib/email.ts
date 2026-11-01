import "server-only";
import nodemailer from "nodemailer";

// Emails go out through your own Gmail, using a Gmail "App Password".
// Set GMAIL_USER and GMAIL_APP_PASSWORD in Vercel's environment variables.
// (SMTP_HOST / SMTP_PORT / SMTP_SECURE can point it at another mail server.)

export function emailConfig() {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  const host = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
  if (!user || (!pass && host === "smtp.gmail.com")) return null;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465;
  return { user, pass: pass ?? "", host, port, secure };
}

export function isEmailConfigured() {
  return emailConfig() !== null;
}

export async function sendMail(input: {
  fromName: string;
  to: string[];
  cc: string[];
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}) {
  const cfg = emailConfig();
  if (!cfg) throw new Error("Email sending isn't set up yet (GMAIL_USER / GMAIL_APP_PASSWORD).");
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
  const fromName = input.fromName.replace(/["<>]/g, "").trim();
  return transport.sendMail({
    from: fromName ? `"${fromName}" <${cfg.user}>` : cfg.user,
    to: input.to,
    cc: input.cc.length ? input.cc : undefined,
    subject: input.subject,
    text: input.text,
    attachments: input.attachments,
  });
}

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

/** "a@x.com, b@y.com; c@z.com" → validated list */
export function parseAddresses(raw: string | null | undefined): { ok: string[]; bad: string[] } {
  const parts = (raw ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return { ok: parts.filter((p) => EMAIL_RE.test(p)), bad: parts.filter((p) => !EMAIL_RE.test(p)) };
}
