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

**Coming next:** Phase 4 adds the Telegram bot and reminders.

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
1. In your Google Account, go to **Security** and turn on **2-Step Verification**.
2. Open **myaccount.google.com/apppasswords**, create one called "Creator HQ", and copy the 16 letters.
3. In Vercel, go to **Settings**, then **Environment Variables**, and add:
   | Name | Value |
   |---|---|
   | `GMAIL_USER` | your Gmail address |
   | `GMAIL_APP_PASSWORD` | the 16 letters |
4. Go to **Deployments**, then **Redeploy**. **Settings** in the app should now say "Connected".

Without this, the email screen still works: it opens Gmail with everything filled in.

### 5. Turn on the AI statement reader (free)
1. Go to **aistudio.google.com/apikey**, sign in with Google, and click **Create API key**.
2. In Vercel, add the environment variable `GEMINI_API_KEY` with that key, then **Redeploy**.

The app uses `gemini-3.8-flash` and falls back to `gemini-3.5-flash-lite` (which has a bigger free daily limit). To pin a model, set `GEMINI_MODEL`.

### 6. Put it on your iPhone
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
