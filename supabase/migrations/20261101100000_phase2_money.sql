-- Creator HQ — Phase 2: your profile, invoices, payments + TDS, 26AS checks,
-- email templates + sent log, and your rate card.

-- ---------------------------------------------------------------------------
-- Your details (printed on invoices)
-- ---------------------------------------------------------------------------
create table public.profile (
  user_id              uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  legal_name           text,
  display_name         text,
  pan                  text check (pan is null or pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  address              text,
  email                text,
  phone                text,
  bank_account_name    text,
  bank_name            text,
  bank_account_number  text,
  bank_ifsc            text,
  upi_id               text,
  invoice_prefix       text not null default 'INV',
  payment_terms_days   integer not null default 15 check (payment_terms_days between 0 and 365),
  default_tds_rate     numeric(5, 2) not null default 10 check (default_tds_rate between 0 and 100),
  default_tds_section  text not null default '194J',
  invoice_footer       text,
  updated_at           timestamptz not null default now()
);
create trigger profile_updated_at before update on public.profile
  for each row execute function public.set_updated_at();

-- Billing details for brands (who the invoice is addressed to, and their TAN for 26AS)
alter table public.brands
  add column legal_name       text,
  add column billing_address  text,
  add column gstin            text,
  add column pan              text,
  add column tan              text;

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------
create table public.invoices (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  brand_id         uuid not null references public.brands (id) on delete restrict,
  deal_id          uuid references public.deals (id) on delete set null,
  fy               integer not null,          -- financial year it belongs to (2026 = FY 2026-27)
  seq              integer not null,          -- running number inside that year
  invoice_number   text not null,
  issue_date       date not null default current_date,
  due_date         date,
  bill_to_name     text not null,
  bill_to_address  text,
  bill_to_gstin    text,
  bill_to_pan      text,
  subtotal         numeric(12, 2) not null default 0,   -- kept in sync with the line items
  tds_rate         numeric(5, 2) check (tds_rate is null or tds_rate between 0 and 100),
  tds_section      text,
  notes            text,
  status           text not null default 'draft' check (status in ('draft', 'sent', 'partially_paid', 'paid', 'cancelled')),
  sent_at          timestamptz,
  paid_at          date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, invoice_number),
  unique (user_id, fy, seq)
);
create index invoices_brand_idx on public.invoices (brand_id);
create index invoices_deal_idx on public.invoices (deal_id);
create index invoices_status_idx on public.invoices (user_id, status);
create trigger invoices_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();

create table public.invoice_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  invoice_id   uuid not null references public.invoices (id) on delete cascade,
  position     integer not null default 0,
  description  text not null check (length(trim(description)) > 0),
  quantity     numeric(10, 2) not null default 1 check (quantity > 0),
  rate         numeric(12, 2) not null check (rate >= 0),
  amount       numeric(12, 2) generated always as (round(quantity * rate, 2)) stored
);
create index invoice_items_invoice_idx on public.invoice_items (invoice_id, position);

-- ---------------------------------------------------------------------------
-- Payments received. gross = what the brand owed for it, tds = what they cut,
-- net = what actually reached your bank.
-- ---------------------------------------------------------------------------
create table public.payments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  brand_id       uuid not null references public.brands (id) on delete restrict,
  invoice_id     uuid references public.invoices (id) on delete set null,
  deal_id        uuid references public.deals (id) on delete set null,
  received_date  date not null,
  gross_amount   numeric(12, 2) not null check (gross_amount >= 0),
  tds_amount     numeric(12, 2) not null default 0 check (tds_amount >= 0),
  net_amount     numeric(12, 2) generated always as (gross_amount - tds_amount) stored,
  tds_section    text,
  mode           text,
  reference      text,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (tds_amount <= gross_amount)
);
create index payments_brand_idx on public.payments (brand_id);
create index payments_invoice_idx on public.payments (invoice_id);
create index payments_date_idx on public.payments (user_id, received_date);
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- Keep each invoice's total and status in step with its items and payments.
create or replace function public.refresh_invoice(p_invoice uuid)
returns void
language plpgsql
as $$
declare
  v_total numeric(12, 2);
  v_paid  numeric(12, 2);
  v_last  date;
begin
  if p_invoice is null then
    return;
  end if;
  select coalesce(sum(amount), 0) into v_total from public.invoice_items where invoice_id = p_invoice;
  select coalesce(sum(gross_amount), 0), max(received_date) into v_paid, v_last
    from public.payments where invoice_id = p_invoice;

  update public.invoices i
     set subtotal = v_total,
         status = case
           when i.status = 'cancelled' then 'cancelled'
           when v_paid > 0 and v_paid >= v_total and v_total > 0 then 'paid'
           when v_paid > 0 then 'partially_paid'
           when i.sent_at is not null then 'sent'
           else 'draft'
         end,
         paid_at = case when v_paid > 0 and v_paid >= v_total and v_total > 0 then v_last else null end
   where i.id = p_invoice;
end;
$$;

create or replace function public.on_invoice_item_change()
returns trigger
language plpgsql
as $$
begin
  perform public.refresh_invoice(coalesce(new.invoice_id, old.invoice_id));
  return null;
end;
$$;
create trigger invoice_items_refresh after insert or update or delete on public.invoice_items
  for each row execute function public.on_invoice_item_change();

create or replace function public.on_payment_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.refresh_invoice(old.invoice_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.invoice_id is distinct from old.invoice_id or new.gross_amount <> old.gross_amount or new.received_date <> old.received_date) then
    perform public.refresh_invoice(new.invoice_id);
  end if;
  return null;
end;
$$;
create trigger payments_refresh after insert or update or delete on public.payments
  for each row execute function public.on_payment_change();

-- ---------------------------------------------------------------------------
-- What 26AS / AIS shows for each brand, per financial year
-- ---------------------------------------------------------------------------
create table public.tds_checks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fy               integer not null,
  brand_id         uuid not null references public.brands (id) on delete cascade,
  tds_in_26as      numeric(12, 2),
  amount_in_26as   numeric(12, 2),
  checked_on       date not null default current_date,
  notes            text,
  updated_at       timestamptz not null default now(),
  unique (user_id, fy, brand_id)
);
create trigger tds_checks_updated_at before update on public.tds_checks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Email templates and every email sent from the app
-- ---------------------------------------------------------------------------
create table public.email_templates (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  subject         text not null,
  body            text not null,
  attach_invoice  boolean not null default false,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger email_templates_updated_at before update on public.email_templates
  for each row execute function public.set_updated_at();

create table public.email_log (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  brand_id         uuid references public.brands (id) on delete set null,
  deal_id          uuid references public.deals (id) on delete set null,
  invoice_id       uuid references public.invoices (id) on delete set null,
  to_addresses     text not null,
  cc_addresses     text,
  subject          text not null,
  body             text not null,
  attachment_name  text,
  status           text not null check (status in ('sent', 'failed')),
  error            text,
  created_at       timestamptz not null default now()
);
create index email_log_created_idx on public.email_log (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Your own rate card (what you charge), compared against what deals paid
-- ---------------------------------------------------------------------------
create table public.rate_card (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type        text not null,
  platform    text not null default '',
  price       numeric(12, 2) not null check (price >= 0),
  notes       text,
  updated_at  timestamptz not null default now(),
  unique (user_id, type, platform)
);
create trigger rate_card_updated_at before update on public.rate_card
  for each row execute function public.set_updated_at();

-- New kinds of timeline entries
alter table public.activities drop constraint activities_kind_check;
alter table public.activities add constraint activities_kind_check check (kind in (
  'note', 'email', 'call', 'meeting', 'follow_up', 'stage_change', 'file', 'system', 'invoice', 'payment'));

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profile         enable row level security;
alter table public.invoices        enable row level security;
alter table public.invoice_items   enable row level security;
alter table public.payments        enable row level security;
alter table public.tds_checks      enable row level security;
alter table public.email_templates enable row level security;
alter table public.email_log       enable row level security;
alter table public.rate_card       enable row level security;

create policy "owner" on public.profile         for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner" on public.invoices        for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner" on public.invoice_items   for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner" on public.payments        for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner" on public.tds_checks      for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner" on public.email_templates for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner" on public.email_log       for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner" on public.rate_card       for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
