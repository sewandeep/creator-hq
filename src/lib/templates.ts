// Email templates: placeholders like {{brand}} get filled in from the deal,
// contact and invoice. Shared by the composer preview and the sender, so the
// preview is exactly what goes out.

export const TEMPLATE_VARIABLES = [
  { key: "brand", hint: "Brand name" },
  { key: "first_name", hint: "Contact's first name" },
  { key: "contact_name", hint: "Contact's full name" },
  { key: "deal", hint: "Deal / campaign name" },
  { key: "deal_amount", hint: "Deal fee" },
  { key: "invoice_number", hint: "Invoice number" },
  { key: "invoice_amount", hint: "Invoice total" },
  { key: "due_date", hint: "Invoice due date" },
  { key: "days_overdue", hint: "Days past the due date" },
  { key: "my_name", hint: "Your name" },
  { key: "my_phone", hint: "Your phone" },
] as const;

export type TemplateVars = Partial<Record<(typeof TEMPLATE_VARIABLES)[number]["key"], string>>;

const PLACEHOLDER = /\{\{\s*([a-z_]+)\s*\}\}/g;

export function fillTemplate(text: string, vars: TemplateVars) {
  return text.replace(PLACEHOLDER, (whole, key: string) => {
    const v = vars[key as keyof TemplateVars];
    return v ? v : whole;
  });
}

/** Placeholders still left in the text after filling (no value available). */
export function missingPlaceholders(text: string) {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]))];
}

export const DEFAULT_TEMPLATES = [
  {
    name: "Send invoice",
    attach_invoice: true,
    subject: "Invoice {{invoice_number}} – {{deal}}",
    body: `Hi {{first_name}},

Hope you're doing well! Please find attached invoice {{invoice_number}} for {{deal}}.

Amount: {{invoice_amount}}
Due date: {{due_date}}

Bank and UPI details are on the invoice. Once TDS is deducted, please share the TDS certificate (Form 16A) when it's available.

Thanks so much,
{{my_name}}`,
  },
  {
    name: "Payment reminder",
    attach_invoice: true,
    subject: "Gentle reminder: invoice {{invoice_number}}",
    body: `Hi {{first_name}},

Just a gentle reminder that invoice {{invoice_number}} for {{invoice_amount}} ({{deal}}) was due on {{due_date}}. I've attached it again for easy reference.

Could you let me know when I can expect the payment?

Thanks,
{{my_name}}`,
  },
  {
    name: "Follow up on proposal",
    attach_invoice: false,
    subject: "Following up – {{brand}} x {{my_name}}",
    body: `Hi {{first_name}},

Just following up on my earlier note about collaborating with {{brand}}. I'd love to create something for you — happy to share ideas, my rate card or past work if that helps.

Let me know what works for you!

Best,
{{my_name}}
{{my_phone}}`,
  },
  {
    name: "Draft for approval",
    attach_invoice: false,
    subject: "Draft for approval – {{deal}}",
    body: `Hi {{first_name}},

The draft for {{deal}} is ready. Please have a look and share any changes — once approved, I'll lock in the posting date.

Thanks,
{{my_name}}`,
  },
  {
    name: "Payment received – thank you",
    attach_invoice: false,
    subject: "Payment received – thank you!",
    body: `Hi {{first_name}},

Just confirming I've received the payment for {{deal}}. Thank you — it was great working with {{brand}}, and I'd love to do more together.

Best,
{{my_name}}`,
  },
];
