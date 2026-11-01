-- Creator HQ — Phase 1: brands, contacts, deals, deliverables, activity log, files.
-- Every table belongs to one user (you). Row Level Security makes sure only the
-- logged-in owner can ever read or change a row.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Brands
-- ---------------------------------------------------------------------------
create table public.brands (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  category    text,
  website     text,
  instagram   text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index brands_user_name_key on public.brands (user_id, lower(name));
create trigger brands_updated_at before update on public.brands
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Contacts (people at a brand or agency)
-- ---------------------------------------------------------------------------
create table public.contacts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  brand_id    uuid references public.brands (id) on delete set null,
  name        text not null check (length(trim(name)) > 0),
  email       text,
  phone       text,
  role        text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index contacts_brand_idx on public.contacts (brand_id);
create trigger contacts_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Deals (a lead is simply a deal in an early stage)
-- ---------------------------------------------------------------------------
create table public.deals (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  brand_id          uuid not null references public.brands (id) on delete restrict,
  contact_id        uuid references public.contacts (id) on delete set null,
  title             text not null check (length(trim(title)) > 0),
  stage             text not null default 'lead' check (stage in (
                      'lead', 'contacted', 'negotiating', 'confirmed',
                      'in_progress', 'posted', 'invoiced', 'paid', 'lost')),
  source            text check (source in ('inbound', 'outbound', 'agency', 'referral', 'other')),
  platform          text,
  amount            numeric(12, 2) check (amount is null or amount >= 0),
  is_barter         boolean not null default false,
  barter_value      numeric(12, 2) check (barter_value is null or barter_value >= 0),
  deal_date         date not null default current_date,
  due_date          date,
  next_follow_up    date,
  lost_reason       text,
  notes             text,
  stage_changed_at  timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index deals_brand_idx on public.deals (brand_id);
create index deals_stage_idx on public.deals (user_id, stage);
create index deals_follow_up_idx on public.deals (user_id, next_follow_up);
create trigger deals_updated_at before update on public.deals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Deliverables (what you owe the brand: reels, stories, videos…)
-- ---------------------------------------------------------------------------
create table public.deliverables (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  deal_id      uuid not null references public.deals (id) on delete cascade,
  type         text not null,
  platform     text,
  quantity     integer not null default 1 check (quantity > 0),
  due_date     date,
  posted_date  date,
  link         text,
  status       text not null default 'todo' check (status in (
                 'todo', 'in_progress', 'sent_for_approval', 'approved', 'posted')),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index deliverables_deal_idx on public.deliverables (deal_id);
create index deliverables_due_idx on public.deliverables (user_id, due_date);
create trigger deliverables_updated_at before update on public.deliverables
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Activity log: notes, calls, follow-ups and automatic history entries
-- ---------------------------------------------------------------------------
create table public.activities (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  deal_id     uuid references public.deals (id) on delete cascade,
  brand_id    uuid references public.brands (id) on delete cascade,
  kind        text not null check (kind in (
                'note', 'email', 'call', 'meeting', 'follow_up', 'stage_change', 'file', 'system')),
  body        text not null,
  created_at  timestamptz not null default now()
);
create index activities_deal_idx on public.activities (deal_id, created_at desc);
create index activities_brand_idx on public.activities (brand_id, created_at desc);

-- Record every stage change automatically so the history can never be lost.
create or replace function public.log_deal_stage_change()
returns trigger
language plpgsql
as $$
begin
  if new.stage is distinct from old.stage then
    new.stage_changed_at = now();
    insert into public.activities (user_id, deal_id, brand_id, kind, body)
    values (new.user_id, new.id, new.brand_id, 'stage_change', old.stage || ' → ' || new.stage);
  end if;
  return new;
end;
$$;
create trigger deals_stage_change before update of stage on public.deals
  for each row execute function public.log_deal_stage_change();

-- ---------------------------------------------------------------------------
-- Files (briefs, contracts) — the bytes live in the private "deal-files" bucket
-- ---------------------------------------------------------------------------
create table public.deal_files (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  deal_id       uuid not null references public.deals (id) on delete cascade,
  kind          text not null default 'other' check (kind in ('brief', 'contract', 'other')),
  name          text not null,
  storage_path  text not null unique,
  size_bytes    bigint,
  mime_type     text,
  created_at    timestamptz not null default now()
);
create index deal_files_deal_idx on public.deal_files (deal_id);

-- ---------------------------------------------------------------------------
-- Row Level Security: only the owner can see or touch their rows
-- ---------------------------------------------------------------------------
alter table public.brands       enable row level security;
alter table public.contacts     enable row level security;
alter table public.deals        enable row level security;
alter table public.deliverables enable row level security;
alter table public.activities   enable row level security;
alter table public.deal_files   enable row level security;

create policy "owner" on public.brands       for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner" on public.contacts     for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner" on public.deals        for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner" on public.deliverables for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner" on public.activities   for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner" on public.deal_files   for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Private storage bucket for briefs and contracts.
-- Files are stored under "<user id>/<deal id>/<file>", and only the owner of
-- that first folder can read, upload or delete them.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('deal-files', 'deal-files', false, 26214400) -- 25 MB per file
on conflict (id) do nothing;

create policy "deal files: owner read" on storage.objects for select to authenticated
  using (bucket_id = 'deal-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "deal files: owner upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'deal-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "deal files: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'deal-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
