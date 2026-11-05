-- Creator HQ — Suggestions & memory.
--
-- 1. suggestion_dismissals: suggestions you dismissed (or snoozed until a date).
--    The suggestions themselves are worked out fresh from your data each time.
-- 2. ai_memory: facts you've told the assistant to remember
--    ("Ramesh is a Sajilo supplier"). You can see and delete them in Memory.

create table public.suggestion_dismissals (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key        text not null,
  until      date,               -- null = for good; a date = snoozed until then
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.suggestion_dismissals enable row level security;
create policy "owner" on public.suggestion_dismissals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create trigger suggestion_dismissals_fill_user_id before insert on public.suggestion_dismissals for each row execute function public.fill_user_id();

create table public.ai_memory (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fact       text not null check (length(trim(fact)) > 0 and length(fact) <= 300),
  source     text not null default 'app',   -- app, telegram, you
  created_at timestamptz not null default now()
);
create index ai_memory_user_idx on public.ai_memory (user_id, created_at desc);
alter table public.ai_memory enable row level security;
create policy "owner" on public.ai_memory for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create trigger ai_memory_fill_user_id before insert on public.ai_memory for each row execute function public.fill_user_id();
create trigger ai_memory_audit after insert or update or delete on public.ai_memory for each row execute function public.audit_row();

-- Undo: ignore timestamps the database sets by itself (like "stage changed at")
-- when checking whether you've edited something since — so undoing a created
-- deal removes it cleanly.
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
        if (cur - 'updated_at' - 'hits' - 'stage_changed_at') is distinct from (r.after - 'updated_at' - 'hits' - 'stage_changed_at') then
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
           and c.is_generated = 'NEVER' and c.column_name not in ('updated_at', 'stage_changed_at', 'hits')
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

