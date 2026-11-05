-- Creator HQ — a clearer money model.
--
-- 1. Every category says which way money goes: out, in, or both. The app only
--    offers categories that fit (no more "income" on money you spent).
-- 2. Income is grouped into streams: creator, freelance, sajilo, other.
-- 3. Family is a two-way bucket (gave / got) kept out of spending and income.
-- 4. Lending covers both ways: lent / got back, borrowed / paid back.
-- 5. Pass-through: money that came in only to go out again, linked as a group
--    (pair_id) and kept out of spending and income.

-- New kinds ------------------------------------------------------------------
alter table public.categories drop constraint if exists categories_kind_check;
alter table public.categories add constraint categories_kind_check
  check (kind in ('expense', 'income', 'transfer', 'savings', 'lending', 'family', 'passthrough'));

alter table public.categories
  add column if not exists direction text not null default 'both' check (direction in ('out', 'in', 'both')),
  add column if not exists stream    text check (stream in ('creator', 'freelance', 'sajilo', 'other'));

alter table public.transactions add column if not exists pair_id uuid;
create index if not exists transactions_pair_idx on public.transactions (pair_id) where pair_id is not null;

-- Which way each existing category goes ---------------------------------------
update public.categories set direction = 'out' where kind = 'expense';
update public.categories set direction = 'in'  where kind = 'income';
update public.categories set direction = 'both' where kind in ('transfer', 'savings');
update public.categories set direction = 'out' where kind = 'transfer' and name in ('Cash withdrawal', 'Credit card bill');
update public.categories set direction = 'out' where kind = 'lending' and name = 'Lent money';
update public.categories set direction = 'in'  where kind = 'lending' and name = 'Money returned';

-- Family: two-way, its own bucket.
update public.categories set kind = 'family', direction = 'both', emoji = coalesce(emoji, '👨‍👩‍👧') where name = 'Family';

-- Income streams.
update public.categories set stream = 'creator'   where name = 'Creator income';
update public.categories set stream = 'sajilo'    where name ilike 'sajilo%';
update public.categories set stream = 'other'     where kind = 'income' and stream is null;
-- "Salary & other income" is really "other income" for this app.
update public.categories set name = 'Other income' where name = 'Salary & other income'
  and not exists (select 1 from public.categories x where x.user_id = categories.user_id and x.name = 'Other income');

-- New categories (for everyone who already has the starter set) --------------
insert into public.categories (user_id, name, kind, emoji, position, is_business, direction, stream)
select u.user_id, v.name, v.kind, v.emoji, v.position, v.is_business, v.direction, v.stream
  from (select distinct user_id from public.categories) u
  cross join (values
    ('Studio & equipment', 'expense',     '🎬', 21, true,  'out',  null),
    ('Freelance income',   'income',      '🧑‍💻', 23, false, 'in',   'freelance'),
    ('Investment returns', 'income',      '📈', 26, false, 'in',   'other'),
    ('Borrowed',           'lending',     '🙏', 33, false, 'in',   null),
    ('Paid back a loan',   'lending',     '↩️', 34, false, 'out',  null),
    ('Pass-through',       'passthrough', '🔀', 35, false, 'both', null)
  ) as v(name, kind, emoji, position, is_business, direction, stream)
 where not exists (select 1 from public.categories c where c.user_id = u.user_id and lower(c.name) = lower(v.name));

-- Clean up rows whose category points the wrong way ---------------------------
-- (e.g. money in tagged with a spending category). They go back to "To sort".
update public.transactions t
   set needs_review = true,
       review_reason = case when t.direction = 'debit'
         then 'This was money out, but its category is for money coming in — pick again.'
         else 'This was money in, but its category is for spending — pick again (refund? family? got money back?).' end
  from public.categories c
 where c.id = t.category_id
   and ((c.direction = 'out' and t.direction = 'credit') or (c.direction = 'in' and t.direction = 'debit'))
   and t.needs_review = false;
