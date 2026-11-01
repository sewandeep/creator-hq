# Creator HQ

Your private workspace for creator deals and (soon) personal finances.

**Phase 1 (done):** brands, contacts, leads with follow-ups, deal pipeline board, deliverables, calendar, notes timeline, brief/contract storage, work history report with CSV export, and bulk import of past work.

**Phase 2 (done):**
- Invoices with your PAN, numbered per financial year, as PDFs with the ₹ sign and amount in words
- Payments with TDS split out: in bank + TDS = invoice amount
- TDS & 26AS check per brand
- Brand emails from templates, with a preview before sending and the invoice attached
- Rate insights: what brands paid per piece, your rate card, who pays on time, monthly income

**Phase 3 (done):**
- Upload bank statement PDFs (Kotak, SBI and others, including password-protected ones)
- AI reads every row; the running balance double-checks each one
- A "Needs you" inbox for anything unclear; tick "Always use" and it remembers
- Quick entries ("450 cab", "lent 2000 to rahul") are linked to the matching bank line, so nothing is counted twice
- Monthly summary by category, payee and lending, plus a full change history on every transaction

**Phase 4 (done):**
- Telegram bot: type "450 cab" to log it, or forward a statement PDF and it gets read
- `/review` to sort transactions one tap at a time, plus `/summary`, `/today` and `/owe`
- A 9 AM message on days something needs you:
  - last month's statement until it's uploaded
  - transactions to review
  - follow-ups and content due
  - overdue invoices
  - advance-tax dates
  - a monthly recap

**Phase 5 (done): the AI assistant**, in the app (**Ask AI**, the ✨ button on every page, or the box on Home) and on Telegram:
- Ask about your own data: spending, brands, invoices, TDS, who owes you, what's due. Answers use your real numbers.
- Rundowns and summaries, including an automatic weekly rundown on Sunday mornings.
- Tell it to do things: create a deal, update a deal, draft an invoice, add entries, re-categorize in bulk. It prepares a card, and nothing is saved until you tap **Confirm**.
- Drop anything in and it handles it, always asking first:
  - a brand email or brief
  - a bank statement (including SBI with its password)
  - your 26AS
  - a receipt photo or UPI screenshot
  - an Excel sheet of past work
  - a voice note
- General questions: TDS sections, GST, pricing, drafting replies to brands.

---

## One-time setup

### 1. Create the database tables (Supabase)
1. Open your **Creator HQ** project at [supabase.com](https://supabase.com/dashboard).
2. Open **Table Editor**. If you already see tables called `brands`, `deals` and so on, the GitHub connection set them up; skip to step 2.
3. Otherwise go to **SQL Editor**, then **New query**. Paste everything from
   [`supabase/migrations/20261101000000_phase1_crm.sql`](supabase/migrations/20261101000000_phase1_crm.sql) and press **Run**.

   Do the same for **every file** in `supabase/migrations/`, in name order:
   - Phase 2: `20261101100000_phase2_money.sql`
   - Phase 3: `20261102000000_phase3_finance.sql`
   - Phase 4: `20261103000000_phase4_telegram.sql`
   - Phase 5: `20261104000000_phase5_assistant.sql`

   The app's **Setup check** page (`/setup`) shows which ones are still missing.

### 2. Create your login (only you)
1. In Supabase, go to **Authentication**, then **Users**, then **Add user**, then **Create new user**.
2. Enter your email and a strong password, and tick **Auto Confirm User**.
3. Go to **Authentication**, then **Sign In / Providers**, and turn **off** "Allow new users to sign up". Nobody else can create an account after this.

### 3. Put it online (Vercel)
1. In [Vercel](https://vercel.com), go to **Add New**, then **Project**, and import **creator-hq**.
2. Under **Environment Variables**, add these two values. Both are in Supabase under **Project Settings**, then **API Keys** (or the **Connect** button):
   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Your project URL, `https://xxxx.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The **publishable** key (`sb_publishable_…`) |

   If you connected Vercel to Supabase through the Vercel integration, these may already be filled in. That works too.
   **Never** use the `secret` / `service_role` key here.
3. Press **Deploy**. You'll get a link like `creator-hq-xxxx.vercel.app`.

### 4. Connect Gmail so the app can send emails (optional but recommended)
1. In your Google Account, go to **Security** and turn on **2-Step Verification**, using your phone or Google Authenticator (not only a security key or passkey). For a Google Workspace address (like name@sajilo.in), an admin may first need to allow it: **admin.google.com**, then **Security**, then **Authentication**, then **2-step verification**, then tick "Allow users to turn on 2-Step Verification".
2. Open **myaccount.google.com/apppasswords**, create one called "Creator HQ", and copy the 16 letters.
3. In Vercel, go to **Settings**, then **Environment Variables**, and add:
   | Name | Value |
   |---|---|
   | `GMAIL_USER` | your Gmail address |
   | `GMAIL_APP_PASSWORD` | the 16 letters |
4. Go to **Deployments**, then **Redeploy**. **Settings** in the app should now say "Connected".

Without this, the email screen still works: it opens Gmail with everything filled in.

**No app passwords available?** Use any email service that supports SMTP instead (for example Brevo, Zoho or Resend). Set these in Vercel:
- `SMTP_HOST`
- `SMTP_PORT` (usually 465 or 587)
- `SMTP_USER`
- `SMTP_PASSWORD`
- `EMAIL_FROM` (the address brands will see)

### 5. Turn on the AI statement reader (free)
1. Go to **aistudio.google.com/apikey**, sign in with Google, and click **Create API key**.
2. In Vercel, add the environment variable `GEMINI_API_KEY` with that key, then **Redeploy**.

The app uses `gemini-3.8-flash` and falls back to `gemini-3.5-flash-lite` (which has a bigger free daily limit). To pin a model, set `GEMINI_MODEL`.

### 6. Telegram bot & 9 AM reminders
1. In Telegram, message **@BotFather**, send `/newbot`, pick a name and a username ending in `bot`, and copy the token.
2. In Vercel, add these environment variables, then **Redeploy**:
   | Name | Value |
   |---|---|
   | `TELEGRAM_BOT_TOKEN` | the token from BotFather |
   | `SUPABASE_SECRET_KEY` | Supabase, then **Project Settings**, then **API Keys**, then **Secret keys** (`sb_secret_…`). Lets the bot save entries without a browser login. |
   | `CRON_SECRET` | any long random text. It protects the 9 AM job. |
3. Open the app on its **production address**. In **Settings**, then **Telegram bot & reminders**, press **Connect bot**, then **Open Telegram & connect**, then tap **Start** in Telegram.
4. If Telegram reports a 401 or 403 error, turn off Vercel **Deployment Protection** for production. The app's own login still protects every page.

The morning job runs from `vercel.json` at 03:30 UTC, which is 9:00 AM in India.

### 7. Put it on your iPhone
Open the link in **Safari**, tap **Share**, then **Add to Home Screen**. It opens like a normal app.

---

## Importing your past work
Go to **Import** and either paste rows from Google Sheets or Excel (include the header row) or upload a CSV. Useful columns:
`Brand, Date, Deliverables, Amount, Platform, Status, Contact, Email, Link, Notes`. Only **Brand** is required.

The import understands:
- Dates: `15/03/2025`, `Mar 2025`
- Amounts: `35,000`, `40k`, `1.2L`, `Barter`
- Deliverables: `1 reel + 2 stories`

You see a preview before anything is saved.

---

## For developers
- Next.js 16 (App Router, server actions), Tailwind CSS 4, Supabase (Postgres + Auth + Storage).
- Every table has Row Level Security, so only the logged-in owner can see their rows. Files go in a private storage bucket.
- Run it locally (needs Docker):
  ```bash
  npm install
  npx supabase start
  # copy the API URL + publishable key it prints into .env.local
  npm run dev
  ```
- Database changes go in `supabase/migrations/`.
