import "server-only";
import nodemailer from "nodemailer";

// Emails go out through your own mailbox over SMTP.
// Simplest: Gmail / Google Workspace with an App Password —
//   GMAIL_USER (your address) + GMAIL_APP_PASSWORD.
// Any other provider (e.g. Brevo, Zoho, Resend) works too —
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and EMAIL_FROM (the address brands see).

export function emailConfig() {
  const from = (process.env.EMAIL_FROM || process.env.GMAIL_USER || "").trim();
  const user = (process.env.SMTP_USER || process.env.GMAIL_USER || "").trim();
  const pass = (process.env.SMTP_PASSWORD || process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
  const host = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
  if (!from || !user || (!pass && host === "smtp.gmail.com")) return null;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465;
  return { from, user, pass, host, port, secure };
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
  if (!cfg) throw new Error("Email sending isn't set up yet (see Settings → Email sending).");
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
  const fromName = input.fromName.replace(/["<>]/g, "").trim();
  return transport.sendMail({
    from: fromName ? `"${fromName}" <${cfg.from}>` : cfg.from,
    replyTo: cfg.from,
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
