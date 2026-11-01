-- Creator HQ — Phase 4: Telegram bot + reminders.

-- Your Telegram connection and reminder settings.
alter table public.profile
  add column telegram_chat_id       bigint unique,
  add column telegram_link_code     text,
  add column telegram_link_expires  timestamptz,
  add column telegram_state         jsonb not null default '{}'::jsonb,
  add column reminders              jsonb not null default '{"digest": true, "statements": true}'::jsonb,
  add column last_digest_on         date;

-- The bot and the daily reminder job run on the server without a browser
-- login, using the secret service key. For their inserts, fill in user_id
-- from the "x-acting-user" request header — but only for that trusted
-- service role, never for normal logged-in requests.
create or replace function public.fill_user_id()
returns trigger
language plpgsql
as $$
declare
  acting text;
begin
  if new.user_id is null and (current_user = 'service_role' or coalesce(auth.role(), '') = 'service_role') then
    acting := nullif(current_setting('request.headers', true)::json ->> 'x-acting-user', '');
    if acting is not null then
      new.user_id := acting::uuid;
    end if;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'brands', 'contacts', 'deals', 'deliverables', 'activities', 'deal_files',
    'invoices', 'invoice_items', 'payments', 'tds_checks', 'email_templates', 'email_log', 'rate_card',
    'bank_accounts', 'statements', 'categories', 'category_rules', 'transactions', 'transaction_changes'
  ] loop
    execute format('create trigger %I before insert on public.%I for each row execute function public.fill_user_id()', t || '_fill_user_id', t);
  end loop;
end;
$$;
