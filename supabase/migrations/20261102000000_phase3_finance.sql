-- Creator HQ — Phase 3: personal finance.
-- Bank accounts, uploaded statements, every transaction (from statements or
-- typed by you), categories, "always categorize X as Y" rules, and a full
-- change history so you can always see why something is categorized the way
-- it is — and undo it.

-- ---------------------------------------------------------------------------
-- Bank accounts
-- ---------------------------------------------------------------------------
create table public.bank_accounts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null check (length(trim(name)) > 0),
  bank          text not null default 'other' check (bank in ('kotak', 'sbi', 'hdfc', 'icici', 'axis', 'other')),
  last4         text,
  pdf_password  text,          -- for password-protected statements (e.g. SBI); only you can read it
  is_archived   boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Uploaded statements
-- ---------------------------------------------------------------------------
create table public.statements (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id       uuid not null references public.bank_accounts (id) on delete cascade,
  file_path        text not null,
  file_name        text not null,
  status           text not null default 'uploaded' check (status in ('uploaded', 'processing', 'needs_password', 'done', 'failed')),
  error            text,
  period_from      date,
  period_to        date,
  opening_balance  numeric(14, 2),
  closing_balance  numeric(14, 2),
  rows_found       integer,
  rows_added       integer,
  rows_duplicate   integer,
  balance_ok       boolean,
  issues           jsonb not null default '[]'::jsonb,
  model            text,
  created_at       timestamptz not null default now(),
  processed_at     timestamptz
);
create index statements_account_idx on public.statements (account_id, period_from);

-- ---------------------------------------------------------------------------
-- Categories and your rules
-- ---------------------------------------------------------------------------
create table public.categories (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  kind         text not null check (kind in ('expense', 'income', 'transfer', 'savings', 'lending')),
  emoji        text,
  position     integer not null default 0,
  is_business  boolean not null default false,   -- creator work expense (useful at tax time)
  created_at   timestamptz not null default now()
);
create unique index categories_user_name_key on public.categories (user_id, lower(name));

create table public.category_rules (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pattern      text not null check (length(trim(pattern)) >= 2),   -- matched (lower-case) inside payee / narration
  direction    text check (direction in ('debit', 'credit')),
  category_id  uuid not null references public.categories (id) on delete cascade,
  hits         integer not null default 0,
  created_at   timestamptz not null default now()
);
create unique index category_rules_key on public.category_rules (user_id, lower(pattern), coalesce(direction, 'any'));

-- ---------------------------------------------------------------------------
-- Transactions
-- source = statement (read from a bank PDF), manual (typed in the app),
--          telegram (sent from the bot, Phase 4)
-- A manual entry that matches a bank line is linked to it (matched_txn_id)
-- and then only the bank line counts in reports — nothing is double counted.
-- ---------------------------------------------------------------------------
create table public.transactions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id            uuid references public.bank_accounts (id) on delete cascade,
  statement_id          uuid references public.statements (id) on delete cascade,
  source                text not null default 'manual' check (source in ('statement', 'manual', 'telegram')),
  txn_date              date not null,
  seq                   integer,
  description           text not null,
  amount                numeric(14, 2) not null check (amount > 0),
  direction             text not null check (direction in ('debit', 'credit')),
  balance               numeric(14, 2),
  reference             text,
  counterparty          text,
  upi_id                text,
  category_id           uuid references public.categories (id) on delete set null,
  category_source       text not null default 'none' check (category_source in ('ai', 'rule', 'user', 'match', 'none')),
  category_reason       text,
  confidence            numeric(3, 2),
  needs_review          boolean not null default false,
  review_reason         text,
  note                  text,
  person                text,
  is_cash               boolean not null default false,
  matched_txn_id        uuid references public.transactions (id) on delete set null,
  payment_id            uuid references public.payments (id) on delete set null,
  suggested_invoice_id  uuid references public.invoices (id) on delete set null,
  dedupe_key            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index transactions_dedupe_key on public.transactions (user_id, dedupe_key) where dedupe_key is not null;
create index transactions_date_idx on public.transactions (user_id, txn_date);
create index transactions_review_idx on public.transactions (user_id, needs_review) where needs_review;
create index transactions_category_idx on public.transactions (category_id);
create index transactions_matched_idx on public.transactions (matched_txn_id);
create index transactions_statement_idx on public.transactions (statement_id);
create trigger transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

-- Every change to a transaction's category / note / person, and who made it.
create table public.transaction_changes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  transaction_id  uuid not null references public.transactions (id) on delete cascade,
  field           text not null,
  old_value       text,
  new_value       text,
  source          text not null,     -- ai / rule / user / match / system
  created_at      timestamptz not null default now()
);
create index transaction_changes_txn_idx on public.transaction_changes (transaction_id, created_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.bank_accounts       enable row level security;
alter table public.statements          enable row level security;
alter table public.categories          enable row level security;
alter table public.category_rules      enable row level security;
alter table public.transactions        enable row level security;
alter table public.transaction_changes enable row level security;

create policy "owner" on public.bank_accounts       for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner" on public.statements          for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner" on public.categories          for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner" on public.category_rules      for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner" on public.transactions        for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner" on public.transaction_changes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Private storage for statement PDFs ("<user id>/<file>")
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('statements', 'statements', false, 15728640) -- 15 MB
on conflict (id) do nothing;

create policy "statements: owner read" on storage.objects for select to authenticated
  using (bucket_id = 'statements' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "statements: owner upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'statements' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "statements: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'statements' and (storage.foldername(name))[1] = (select auth.uid())::text);
