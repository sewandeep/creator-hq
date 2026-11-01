-- Creator HQ — Phase 5: the AI assistant.
-- Chat history (app + Telegram), actions the assistant proposes (nothing is
-- saved until you confirm), and private storage for files you drop in.

create table public.ai_messages (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  channel       text not null default 'app' check (channel in ('app', 'telegram', 'rundown')),
  role          text not null check (role in ('user', 'assistant')),
  content       text not null,
  attachments   jsonb not null default '[]'::jsonb,
  proposal_ids  uuid[] not null default '{}',
  created_at    timestamptz not null default now()
);
create index ai_messages_idx on public.ai_messages (user_id, channel, created_at desc);

create table public.ai_proposals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null,
  summary     text not null,
  payload     jsonb not null,
  status      text not null default 'pending' check (status in ('pending', 'applied', 'cancelled', 'failed')),
  result      jsonb,
  channel     text not null default 'app',
  created_at  timestamptz not null default now(),
  applied_at  timestamptz
);
create index ai_proposals_idx on public.ai_proposals (user_id, status, created_at desc);

alter table public.ai_messages  enable row level security;
alter table public.ai_proposals enable row level security;
create policy "owner" on public.ai_messages  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner" on public.ai_proposals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- The bot (server) can create these on your behalf too.
create trigger ai_messages_fill_user_id before insert on public.ai_messages
  for each row execute function public.fill_user_id();
create trigger ai_proposals_fill_user_id before insert on public.ai_proposals
  for each row execute function public.fill_user_id();

-- Files you hand to the assistant (screenshots, PDFs, voice notes, sheets).
insert into storage.buckets (id, name, public, file_size_limit)
values ('inbox', 'inbox', false, 20971520) -- 20 MB
on conflict (id) do nothing;

create policy "inbox: owner read" on storage.objects for select to authenticated
  using (bucket_id = 'inbox' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "inbox: owner upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'inbox' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "inbox: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'inbox' and (storage.foldername(name))[1] = (select auth.uid())::text);
