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

**Simpler, faster app:**
- The server runs in Mumbai, next to the database.
- Four main places: **Today**, **Work**, **Money** and **Reports**.
- The AI panel is on every page (Ctrl/Cmd+K, or ✨ on your phone).
- **Today** is a short "Needs you" checklist with one-tap actions.
- **Work** is one board. Tap a deal and everything opens beside it:
  - edit any value in place
  - **Mark posted**, **Create & send invoice** and **Got paid ✓**
  - **+ New deal** by telling the AI, or with 4 fields

**Safety net & instant app:**
- Every AI answer, statement read, confirmed change, Telegram message and morning check is a tracked task:
  - you watch its steps live ("Reading part 2 of 5…")
  - you can **Stop** it
  - it has a time limit, so nothing hangs forever
- **Activity** (under More, or in the AI panel) lists everything that happened, including your own edits:
  - what changed, what failed and why
  - **Undo** puts back exactly what that tap, task or statement changed
- Taps update the screen at once and save in the background. A small "Saved · Undo" message confirms each one; if a save fails, the screen goes back and tells you why.
- Main tabs are loaded ahead, so switching between Today, Work, Money and Reports is instant.
- Voice notes are turned into text by Groq (free), so iPhone recordings work.
- **Kotak statements are read by the app's own code**: no AI, done in about a second, private, and every row is checked against the running balance. Other banks (SBI and the rest) still go to the AI.
- **Categories come from memory first**, in this order:
  1. your "always use" rules
  2. how you sorted the same payee before
  3. obvious patterns (bank charges, ATM, Zomato, petrol, Jio, SIPs, your own transfers, Sajilo)
  4. only then the AI, asked once with the list of new payees
- Every payee you sort makes the next statement smarter.
- **The assistant runs on Groq (free, fast)**:
  - its answer appears word by word as it's written
  - it gets a short picture of where things stand (this month's money, open deals, unpaid invoices), so most questions are answered in one go
  - if Groq is busy it switches to Gemini; photos and scanned PDFs always go to Gemini
  - models: `openai/gpt-oss-120b`, then `openai/gpt-oss-20b`; override with `GROQ_CHAT_MODELS`
- **Suggestions** (on Today, and under More), each with a one-tap fix that can be undone:
  - brand money with no invoice: link it to the deal, or create the deal and invoice (marked paid, TDS worked out) in one tap
  - payments in a different category than you usually use for that payee
  - possible double charges
  - money lent and not back after 30 days
  - monthly payments hiding outside Subscriptions
  - a category much higher than usual this month
- **How money is counted**:
  - **Categories fit a direction**: spending only for money out, income only for money in. Family, lending, transfers and pass-through work both ways.
  - **Income has four streams**: Creator, Freelance, Sajilo (kept separate) and Other (interest, investment returns, refunds).
  - **Family** is a two-way bucket ("gave / got", per person), never counted as spending or income.
  - **Lending & borrowing**, per person: Lent money / Paid back a loan (out), Money returned / Borrowed (in). Each person shows "owes you" or "you owe"; **Fix the balance** adds an opening balance for anything from before your statements.
  - **Pass-through**: money that came in only to go out again (received for a friend, a reversed payment, a client reimbursing you). The app suggests the pairs, including one-in-several-out to the same person, and they count as neither.
  - **Studio & equipment** is a creator business cost; camera EMI is EMI & loans.
  - **+ Add** on Money adds any entry, offering only the categories that fit.
  - **Re-sort my transactions** (on Money and Sort) re-sorts everything you haven't set yourself, using your rules, memory, clear patterns and the AI. Anything unclear stays for you, and it can be undone.
- **Work, simplified**:
  - **Sidebar:** All deals · New leads · Ongoing · Done · Lost, then every **agency** and every **brand** (direct) by name
  - **All deals** shows each agency with all its deals underneath ("Brand — deal"), then your direct brands the same way
  - **An agency's page** shows the **agency's** details (legal name, PAN, TAN, GSTIN, address, website, notes, people), all editable in place, plus its TDS rule and its deals grouped by brand. A brand's page works the same way.
  - **Inside a deal:** brand, agency and TDS; the invoice (addressed to the agency or the brand, simple editing, PDF, Send); and payments, any number of them (advance, parts, final), from your bank lines or added by hand
  - **TDS stays simple:** if a deal has TDS on, money that arrives counts as already after TDS, and the deal is paid once the payments add up
- **AI memory**: tell the assistant lasting facts ("Ravi is my landlord") and it uses them in every answer. You can see, add and delete them under More → AI memory.
- Sajilo money has its own categories (income, expenses, reimbursements) and is kept out of your personal totals.

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
   - Safety net: `20261105000000_safety_net.sql`
   - Suggestions & memory: `20261106000000_suggestions_memory.sql`
   - Money model: `20261107000000_money_model.sql`
   - Agencies & deal payments: `20261108000000_agencies.sql`

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

**Voice notes (free):** at **console.groq.com**, go to **API Keys**, then **Create**, and add the key in Vercel as `GROQ_API_KEY`.

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
