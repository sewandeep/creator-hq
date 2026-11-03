-- Creator HQ — Safety net.
--
-- 1. jobs: every AI answer, statement read, confirmed change, Telegram message
--    and automatic task is a "job" with a live status and step-by-step progress.
-- 2. audit_log: every change to your data is recorded with its before/after
--    values, grouped by the tap or job that made it, so it can be undone.
-- 3. undo_group(): puts a group of changes back the way they were.

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------
create table public.jobs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind             text not null,                   -- chat, statement, apply, rundown, telegram, daily
  source           text not null default 'app',     -- app, telegram, auto
  title            text not null,
  status           text not null default 'running' check (status in ('running', 'done', 'failed', 'cancelled')),
  steps            jsonb not null default '[]'::jsonb,
  summary          text,
  error            text,
  result           jsonb,
  ref_id           uuid,                            -- the statement / message / proposal it's about
  cancel_requested boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  finished_at      timestamptz
);
create index jobs_user_created_idx on public.jobs (user_id, created_at desc);
create index jobs_ref_idx on public.jobs (ref_id) where ref_id is not null;

alter table public.jobs enable row level security;
create policy "owner" on public.jobs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create trigger jobs_fill_user_id before insert on public.jobs for each row execute function public.fill_user_id();

-- Adds one progress line and tells the worker whether you pressed Stop.
create or replace function public.job_step(p_job uuid, p_text text)
returns boolean
language sql
as $$
  update public.jobs
     set steps = steps || jsonb_build_array(jsonb_build_object('at', now(), 'text', left(p_text, 300))),
         updated_at = now()
   where id = p_job
  returning cancel_requested;
$$;

-- Live updates in the browser.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.jobs;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Change log
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  group_id   uuid not null,          -- one tap, or one job
  job_id     uuid,
  table_name text not null,
  row_id     uuid not null,
  op         text not null check (op in ('insert', 'update', 'delete')),
  before     jsonb,
  after      jsonb,
  undo_of    uuid,                   -- set when this change was itself an undo
  undone_at  timestamptz,
  at         timestamptz not null default now()
);
create index audit_log_group_idx on public.audit_log (group_id, id);
create index audit_log_user_at_idx on public.audit_log (user_id, at desc);
create index audit_log_job_idx on public.audit_log (job_id) where job_id is not null;

alter table public.audit_log enable row level security;
create policy "owner reads" on public.audit_log for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  h   json;
  b   jsonb;
  a   jsonb;
  u   uuid;
  rid uuid;
  j   uuid;
  g   uuid;
begin
  if tg_op = 'UPDATE' then
    b := to_jsonb(old);
    a := to_jsonb(new);
    if (b - 'updated_at') = (a - 'updated_at') then
      return null;
    end if;
  elsif tg_op = 'INSERT' then
    a := to_jsonb(new);
  else
    b := to_jsonb(old);
  end if;

  u := coalesce(a ->> 'user_id', b ->> 'user_id')::uuid;
  rid := coalesce(a ->> 'id', b ->> 'id')::uuid;
  if u is null or rid is null then
    return null;
  end if;

  begin
    h := nullif(current_setting('request.headers', true), '')::json;
    j := nullif(h ->> 'x-job-id', '')::uuid;
    g := nullif(h ->> 'x-group-id', '')::uuid;
  exception when others then
    h := null;
  end;
  -- No header (e.g. the SQL editor): group by database transaction.
  g := coalesce(j, g, md5('tx' || txid_current()::text)::uuid);

  insert into public.audit_log (user_id, group_id, job_id, table_name, row_id, op, before, after, undo_of)
  values (u, g, j, tg_table_name, rid, lower(tg_op), b, a, nullif(current_setting('app.undo_of', true), '')::uuid);
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'brands', 'contacts', 'deals', 'deliverables', 'activities', 'deal_files',
    'invoices', 'invoice_items', 'payments', 'tds_checks', 'email_templates', 'rate_card',
    'categories', 'category_rules', 'transactions'
  ] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()', t || '_audit', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Undo
-- ---------------------------------------------------------------------------
-- Reverses one group of changes, newest first. Anything you've changed again
-- since is left alone (and counted as "skipped") so nothing newer is lost.
create or replace function public.undo_group(p_group uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me       uuid := auth.uid();
  r        public.audit_log;
  cur      jsonb;
  cols     text;
  k        text;
  changed  boolean;
  done     int := 0;
  skipped  int := 0;
  retry    bigint[] := '{}';
  pass     int;
  ids      bigint[];
begin
  if me is null then
    raise exception 'Not logged in';
  end if;
  if not exists (select 1 from audit_log where group_id = p_group and user_id = me) then
    return jsonb_build_object('undone', 0, 'skipped', 0, 'missing', true);
  end if;
  if exists (select 1 from audit_log where group_id = p_group and user_id = me and undone_at is not null) then
    return jsonb_build_object('undone', 0, 'skipped', 0, 'already', true);
  end if;
  perform set_config('app.undo_of', p_group::text, true);

  select array_agg(id order by id desc) into ids from audit_log where group_id = p_group and user_id = me;

  for pass in 1..2 loop
    if pass = 2 then
      ids := retry;
      retry := '{}';
    end if;
    foreach k in array coalesce(ids::text[], '{}') loop
      select * into r from audit_log where id = k::bigint;
      execute format('select to_jsonb(t) from public.%I t where id = $1', r.table_name) into cur using r.row_id;

      if r.op = 'insert' then
        if cur is null then
          continue;                                   -- already gone
        end if;
        if (cur - 'updated_at' - 'hits') is distinct from (r.after - 'updated_at' - 'hits') then
          skipped := skipped + 1;                     -- edited since
          continue;
        end if;
        begin
          execute format('delete from public.%I where id = $1', r.table_name) using r.row_id;
          done := done + 1;
        exception when others then
          if pass = 1 then retry := retry || r.id; else skipped := skipped + 1; end if;
        end;

      elsif r.op = 'update' then
        if cur is null then
          skipped := skipped + 1;
          continue;
        end if;
        changed := false;
        select string_agg(quote_ident(c.column_name), ', ')
          into cols
          from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = r.table_name
           and c.is_generated = 'NEVER' and c.column_name <> 'updated_at'
           and (r.before -> c.column_name) is distinct from (r.after -> c.column_name);
        if cols is null then
          continue;
        end if;
        -- Only undo if those values are still what this change set them to.
        select bool_or((cur -> c.column_name) is distinct from (r.after -> c.column_name))
          into changed
          from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = r.table_name
           and c.is_generated = 'NEVER' and c.column_name <> 'updated_at'
           and (r.before -> c.column_name) is distinct from (r.after -> c.column_name);
        if changed then
          skipped := skipped + 1;
          continue;
        end if;
        begin
          execute format('update public.%I t set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1)) where id = $2',
                         r.table_name, cols, cols, r.table_name) using r.before, r.row_id;
          done := done + 1;
        exception when others then
          if pass = 1 then retry := retry || r.id; else skipped := skipped + 1; end if;
        end;

      else -- delete
        if cur is not null then
          continue;                                   -- already back
        end if;
        select string_agg(quote_ident(c.column_name), ', ')
          into cols
          from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = r.table_name and c.is_generated = 'NEVER';
        begin
          execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)',
                         r.table_name, cols, cols, r.table_name) using r.before;
          done := done + 1;
        exception when others then
          if pass = 1 then retry := retry || r.id; else skipped := skipped + 1; end if;
        end;
      end if;
    end loop;
  end loop;

  update audit_log set undone_at = now() where group_id = p_group and user_id = me;
  return jsonb_build_object('undone', done, 'skipped', skipped);
end;
$$;

revoke all on function public.undo_group(uuid) from public, anon;
grant execute on function public.undo_group(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Sajilo: a third category for money Sajilo pays you back.
-- ---------------------------------------------------------------------------
insert into public.categories (user_id, name, kind, emoji, position)
select distinct c.user_id, 'Sajilo reimbursements', 'income', '🏢', 1000
  from public.categories c
 where not exists (
   select 1 from public.categories x where x.user_id = c.user_id and lower(x.name) = 'sajilo reimbursements'
 );

-- Money from Sajilo that you haven't sorted yourself: salary → Sajilo income,
-- anything else gets asked once (income, reimbursement, or something else?).
update public.transactions t
   set category_id = c.id, category_source = 'rule', category_reason = 'Salary from Sajilo', needs_review = false, review_reason = null
  from public.categories c
 where c.user_id = t.user_id and c.name = 'Sajilo income'
   and t.direction = 'credit' and t.category_source <> 'user'
   and (t.description ilike '%sajiloservice%' or t.counterparty ilike '%sajilo%')
   and (t.description ilike '%salary%' or t.note ilike '%salary%');

update public.transactions t
   set needs_review = true, review_reason = 'From Sajilo — Sajilo income, a reimbursement, or something else?'
 where t.category_source <> 'user'
   and (t.description ilike '%sajiloservice%' or t.counterparty ilike '%sajilo%')
   and not (t.description ilike '%salary%' or coalesce(t.note, '') ilike '%salary%');
