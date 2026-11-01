# Creator HQ

Your private workspace for creator deals and (soon) personal finances.

**Phase 1 (done):** brands, contacts, leads with follow-ups, deal pipeline board, deliverables, calendar, notes timeline, brief/contract storage, work history report with CSV export, and bulk import of past work.

**Coming next:** Phase 2 adds invoices with your PAN, payments, TDS tracking and the 26AS/AIS check, brand emails sent from templates, and rate-card insights. Phase 3 adds bank statements read by AI. Phase 4 adds the Telegram bot and reminders.

---

## One-time setup

### 1. Create the database tables (Supabase)
1. Open your **Creator HQ** project at [supabase.com](https://supabase.com/dashboard).
2. Open **Table Editor**. If you already see tables called `brands`, `deals` and so on, the GitHub connection set them up; skip to step 2.
3. Otherwise go to **SQL Editor**, then **New query**. Paste everything from
   [`supabase/migrations/20261101000000_phase1_crm.sql`](supabase/migrations/20261101000000_phase1_crm.sql) and press **Run**.

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

### 4. Put it on your iPhone
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
