-- Creator HQ — agencies, TDS rules and simpler payments.
--
-- 1. A brand can be marked as an agency. Deals can come through an agency
--    (deals.agency_id) while still being for a brand (deals.brand_id).
-- 2. "Does this party cut TDS?" is saved on the agency/brand (brands.tds_rate:
--    null = not set, 0 = no, 10 / 2 = yes at that rate). A deal copies it and
--    can be changed (deals.tds_rate).
-- 3. Who the invoice is addressed to stays on the invoice (invoices.brand_id):
--    the agency or the brand — your choice per deal.
-- 4. Payments: what reached the bank is taken as "after TDS". An invoice is
--    paid once payments add up to its amount (within ₹1 for rounding).

alter table public.brands
  add column if not exists is_agency boolean not null default false,
  add column if not exists tds_rate  numeric(5, 2) check (tds_rate is null or tds_rate between 0 and 100);

-- agency_id points at a row in brands. It's kept as a plain column (no second
-- foreign key from deals to brands) so every existing "deal → brand" lookup
-- stays unambiguous; a trigger clears it if the agency is deleted.
alter table public.deals
  add column if not exists agency_id uuid,
  add column if not exists tds_rate  numeric(5, 2) check (tds_rate is null or tds_rate between 0 and 100);
create index if not exists deals_agency_idx on public.deals (agency_id) where agency_id is not null;

create or replace function public.clear_deal_agency()
returns trigger
language plpgsql
as $$
begin
  update public.deals set agency_id = null where agency_id = old.id;
  return old;
end;
$$;
drop trigger if exists brands_clear_deal_agency on public.brands;
create trigger brands_clear_deal_agency before delete on public.brands
  for each row execute function public.clear_deal_agency();

-- Deals that already have an invoice keep that invoice's TDS rate.
update public.deals d
   set tds_rate = i.tds_rate
  from public.invoices i
 where i.deal_id = d.id and d.tds_rate is null and i.status <> 'cancelled';

-- Paid when payments reach the invoice amount (₹1 slack for rounding after TDS).
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
           when v_paid > 0 and v_paid >= v_total - 1 and v_total > 0 then 'paid'
           when v_paid > 0 then 'partially_paid'
           when i.sent_at is not null then 'sent'
           else 'draft'
         end,
         paid_at = case when v_paid > 0 and v_paid >= v_total - 1 and v_total > 0 then v_last else null end
   where i.id = p_invoice;
end;
$$;
