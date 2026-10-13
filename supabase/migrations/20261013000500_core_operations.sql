-- =====================================================================================================
-- Phase 2: orders, sales & payments, expense voiding, receipt storage, customer balances, dashboard.
-- All multi-row and financial writes are atomic SECURITY DEFINER functions with explicit permission checks.
-- =====================================================================================================

-- ---------------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------------
create function private.business_today(bid uuid) returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone b.timezone)::date from public.businesses b where b.id = bid
$$;

create function private.business_tz(bid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select b.timezone from public.businesses b where b.id = bid
$$;

-- Allocates the next order/sale number. The UPDATE locks the settings row, so numbers never collide.
create function private.next_number(bid uuid, kind text) returns text
language plpgsql security definer set search_path = '' as $$
declare n bigint; prefix text;
begin
  if kind = 'order' then
    update public.business_settings set next_order_no = next_order_no + 1 where business_id = bid
    returning next_order_no - 1, order_prefix into n, prefix;
  else
    update public.business_settings set next_sale_no = next_sale_no + 1 where business_id = bid
    returning next_sale_no - 1, sale_prefix into n, prefix;
  end if;
  return prefix || '-' || lpad(n::text, 6, '0');
end $$;

create function private.is_manager_or_owner(bid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.member_role(bid) in ('owner', 'manager'), false)
$$;

-- Validates a JSON array of line items: [{description, quantity, unit_price_centavos, item_type?, catalog_item_id?}]
create function private.assert_items(items jsonb, allow_empty boolean) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if items is null or jsonb_typeof(items) <> 'array' then
    raise exception 'Items must be a list.' using errcode = '22023';
  end if;
  if not allow_empty and jsonb_array_length(items) = 0 then
    raise exception 'Add at least one item.' using errcode = '22023';
  end if;
  if jsonb_array_length(items) > 100 then
    raise exception 'At most 100 items.' using errcode = '22023';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------------------------------
create function public.save_order(
  p_business_id uuid,
  p_order_id uuid default null,          -- null = create
  p_customer_id uuid default null,
  p_order_date date default null,
  p_description text default null,
  p_assigned_employee_id uuid default null,
  p_due_date date default null,
  p_priority public.order_priority default 'normal',
  p_notes text default null,
  p_items jsonb default '[]'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  o public.orders;
  oid uuid;
  it jsonb;
  i integer := 0;
begin
  perform private.assert_perm(p_business_id, 'orders.manage');
  perform private.assert_items(p_items, true);
  if p_due_date is not null and p_order_date is not null and p_due_date < p_order_date then
    raise exception 'The due date cannot be before the order date.' using errcode = '22023';
  end if;

  if p_order_id is null then
    insert into public.orders (business_id, order_number, customer_id, order_date, description, assigned_employee_id,
                               due_date, priority, notes, created_by)
    values (p_business_id, private.next_number(p_business_id, 'order'), p_customer_id,
            coalesce(p_order_date, private.business_today(p_business_id)), nullif(btrim(p_description), ''),
            p_assigned_employee_id, p_due_date, coalesce(p_priority, 'normal'), nullif(btrim(p_notes), ''), uid)
    returning id into oid;
    insert into public.order_activity (business_id, order_id, kind, to_status, actor_id, message)
    values (p_business_id, oid, 'created', 'new', uid, 'Order created');
  else
    select * into o from public.orders where id = p_order_id and business_id = p_business_id for update;
    if o.id is null then raise exception 'Order not found.' using errcode = 'P0002'; end if;
    if o.status = 'cancelled' then raise exception 'A cancelled order cannot be edited.' using errcode = '42501'; end if;
    oid := o.id;
    update public.orders set customer_id = p_customer_id, order_date = coalesce(p_order_date, o.order_date),
           description = nullif(btrim(p_description), ''), assigned_employee_id = p_assigned_employee_id,
           due_date = p_due_date, priority = coalesce(p_priority, o.priority), notes = nullif(btrim(p_notes), '')
     where id = oid;
    delete from public.order_items where order_id = oid and business_id = p_business_id;
    insert into public.order_activity (business_id, order_id, kind, actor_id, message)
    values (p_business_id, oid, 'updated', uid, 'Order details updated');
    if o.assigned_employee_id is distinct from p_assigned_employee_id then
      insert into public.order_activity (business_id, order_id, kind, actor_id, message)
      values (p_business_id, oid, 'assigned', uid,
              coalesce('Assigned to ' || (select full_name from public.employees where id = p_assigned_employee_id), 'Unassigned'));
    end if;
  end if;

  if p_order_id is null and p_assigned_employee_id is not null then
    insert into public.order_activity (business_id, order_id, kind, actor_id, message)
    values (p_business_id, oid, 'assigned', uid, 'Assigned to ' || (select full_name from public.employees where id = p_assigned_employee_id));
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    i := i + 1;
    insert into public.order_items (business_id, order_id, catalog_item_id, item_type, description, quantity, unit_price_centavos, sort_order)
    values (p_business_id, oid, nullif(it ->> 'catalog_item_id', '')::uuid, coalesce(it ->> 'item_type', 'service'),
            btrim(it ->> 'description'), (it ->> 'quantity')::numeric, coalesce((it ->> 'unit_price_centavos')::bigint, 0), i);
  end loop;
  update public.orders set total_centavos = coalesce((select sum(line_total_centavos) from public.order_items where order_id = oid), 0)
   where id = oid;
  return oid;
end $$;

create function public.change_order_status(p_order_id uuid, p_status public.order_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'Order not found.' using errcode = 'P0002'; end if;
  perform private.assert_perm(o.business_id, 'orders.manage');
  if o.status = p_status then return; end if;
  if o.status in ('completed', 'cancelled') and not private.is_manager_or_owner(o.business_id) then
    raise exception 'Only an owner or manager can reopen a completed or cancelled order.' using errcode = '42501';
  end if;
  update public.orders
     set status = p_status,
         completed_at = case when p_status = 'completed' then now() end,
         cancelled_at = case when p_status = 'cancelled' then now() else null end
   where id = o.id;
  insert into public.order_activity (business_id, order_id, kind, from_status, to_status, actor_id, message)
  values (o.business_id, o.id, 'status_changed', o.status, p_status, (select auth.uid()), nullif(btrim(left(p_note, 2000)), ''));
end $$;

create function public.add_order_note(p_order_id uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare bid uuid;
begin
  select business_id into bid from public.orders where id = p_order_id;
  if bid is null then raise exception 'Order not found.' using errcode = 'P0002'; end if;
  perform private.assert_perm(bid, 'orders.manage');
  if coalesce(btrim(p_note), '') = '' then raise exception 'The note is empty.' using errcode = '22023'; end if;
  insert into public.order_activity (business_id, order_id, kind, actor_id, message)
  values (bid, p_order_id, 'note', (select auth.uid()), left(btrim(p_note), 2000));
end $$;

-- ---------------------------------------------------------------------------------------------------
-- Sales & payments
-- ---------------------------------------------------------------------------------------------------
-- Recomputes paid/refunded/payment_status from active payment rows. Caller must hold the sale row lock.
create function private.recompute_sale(sid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare paid bigint; refunded bigint; total bigint;
begin
  select coalesce(sum(amount_centavos) filter (where kind = 'payment'), 0),
         coalesce(sum(amount_centavos) filter (where kind = 'refund'), 0)
    into paid, refunded
    from public.payments where sale_id = sid and status = 'active';
  select total_centavos into total from public.sales where id = sid;
  if paid - refunded < 0 then
    raise exception 'This change would make the amount paid negative.' using errcode = '22023';
  end if;
  if paid - refunded > total then
    raise exception 'Payments cannot exceed the sale total.' using errcode = '22023';
  end if;
  update public.sales set
    paid_centavos = paid - refunded,
    refunded_centavos = refunded,
    payment_status = case
      when refunded > 0 and paid - refunded = 0 then 'refunded'
      when paid - refunded = 0 then 'unpaid'
      when paid - refunded < total then 'partially_paid'
      else 'paid' end::public.payment_status
  where id = sid;
end $$;

create function public.record_payment(
  p_sale_id uuid,
  p_amount_centavos bigint,
  p_method public.payment_method,
  p_idempotency_key uuid,
  p_kind text default 'payment',
  p_reference_no text default null,
  p_paid_at timestamptz default null,
  p_notes text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  s public.sales;
  existing uuid;
  pid uuid;
begin
  if p_idempotency_key is null then raise exception 'Missing idempotency key.' using errcode = '22023'; end if;
  select * into s from public.sales where id = p_sale_id for update;
  if s.id is null then raise exception 'Sale not found.' using errcode = 'P0002'; end if;
  perform private.assert_perm(s.business_id, 'payments.manage');
  perform private.check_rate_limit('payment:' || (select auth.uid()), 120, interval '10 minutes');

  -- Same request retried (double click, network retry): return the payment already recorded.
  select id into existing from public.payments where business_id = s.business_id and idempotency_key = p_idempotency_key;
  if existing is not null then return existing; end if;

  if s.status = 'voided' then raise exception 'This sale was voided.' using errcode = '22023'; end if;
  if p_kind not in ('payment', 'refund') then raise exception 'Unknown payment type.' using errcode = '22023'; end if;
  if p_amount_centavos is null or p_amount_centavos <= 0 then raise exception 'Enter an amount greater than zero.' using errcode = '22023'; end if;
  if p_kind = 'payment' and p_amount_centavos > s.total_centavos - s.paid_centavos then
    raise exception 'The payment is more than the outstanding balance.' using errcode = '22023';
  end if;
  if p_kind = 'refund' and p_amount_centavos > s.paid_centavos then
    raise exception 'The refund is more than the amount paid.' using errcode = '22023';
  end if;
  if p_paid_at is not null and p_paid_at > now() + interval '1 day' then
    raise exception 'The payment date cannot be in the future.' using errcode = '22023';
  end if;

  insert into public.payments (business_id, sale_id, kind, amount_centavos, method, reference_no, paid_at, notes, idempotency_key, recorded_by)
  values (s.business_id, s.id, p_kind, p_amount_centavos, p_method, nullif(btrim(p_reference_no), ''), coalesce(p_paid_at, now()),
          nullif(btrim(p_notes), ''), p_idempotency_key, (select auth.uid()))
  returning id into pid;
  perform private.recompute_sale(s.id);
  return pid;
end $$;

create function public.create_sale(
  p_business_id uuid,
  p_idempotency_key uuid,
  p_items jsonb,
  p_customer_id uuid default null,
  p_order_id uuid default null,
  p_sale_date date default null,
  p_discount_centavos bigint default 0,
  p_notes text default null,
  p_payment jsonb default null          -- optional {amount_centavos, method, reference_no, idempotency_key}
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  existing uuid;
  sid uuid;
  it jsonb;
  i integer := 0;
  subtotal bigint;
  max_pct numeric;
begin
  perform private.assert_perm(p_business_id, 'sales.manage');
  if p_idempotency_key is null then raise exception 'Missing idempotency key.' using errcode = '22023'; end if;
  select id into existing from public.sales where business_id = p_business_id and idempotency_key = p_idempotency_key;
  if existing is not null then return existing; end if;
  perform private.assert_items(p_items, false);
  perform private.check_rate_limit('sale:' || uid, 120, interval '10 minutes');

  insert into public.sales (business_id, sale_number, customer_id, order_id, sale_date, notes, idempotency_key, created_by)
  values (p_business_id, private.next_number(p_business_id, 'sale'), p_customer_id, p_order_id,
          coalesce(p_sale_date, private.business_today(p_business_id)), nullif(btrim(p_notes), ''), p_idempotency_key, uid)
  returning id into sid;

  for it in select * from jsonb_array_elements(p_items) loop
    i := i + 1;
    insert into public.sale_items (business_id, sale_id, catalog_item_id, item_type, description, quantity, unit_price_centavos, sort_order)
    values (p_business_id, sid, nullif(it ->> 'catalog_item_id', '')::uuid, coalesce(it ->> 'item_type', 'service'),
            btrim(it ->> 'description'), (it ->> 'quantity')::numeric, (it ->> 'unit_price_centavos')::bigint, i);
  end loop;

  select coalesce(sum(line_total_centavos), 0) into subtotal from public.sale_items where sale_id = sid;
  p_discount_centavos := coalesce(p_discount_centavos, 0);
  if p_discount_centavos < 0 or p_discount_centavos > subtotal then
    raise exception 'The discount must be between zero and the subtotal.' using errcode = '22023';
  end if;
  if p_discount_centavos > 0 then
    perform private.assert_perm(p_business_id, 'sales.discount');
    select max_discount_pct into max_pct from public.business_settings where business_id = p_business_id;
    if private.member_role(p_business_id) <> 'owner' and subtotal > 0 and p_discount_centavos * 100.0 / subtotal > max_pct then
      raise exception 'Discounts above % percent need the owner.', max_pct using errcode = '42501';
    end if;
  end if;
  update public.sales set subtotal_centavos = subtotal, discount_centavos = p_discount_centavos,
         total_centavos = subtotal - p_discount_centavos where id = sid;

  if p_payment is not null and coalesce((p_payment ->> 'amount_centavos')::bigint, 0) > 0 then
    perform public.record_payment(sid, (p_payment ->> 'amount_centavos')::bigint, (p_payment ->> 'method')::public.payment_method,
                                  coalesce((p_payment ->> 'idempotency_key')::uuid, gen_random_uuid()), 'payment',
                                  p_payment ->> 'reference_no', null, null);
  end if;
  return sid;
end $$;

create function public.void_payment(p_payment_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.payments;
begin
  select * into p from public.payments where id = p_payment_id;
  if p.id is null then raise exception 'Payment not found.' using errcode = 'P0002'; end if;
  perform private.assert_perm(p.business_id, 'payments.manage');
  if not private.is_manager_or_owner(p.business_id) then
    raise exception 'Only an owner or manager can void a payment.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Give a reason for voiding.' using errcode = '22023'; end if;
  perform 1 from public.sales where id = p.sale_id for update;   -- lock order: sale, then payment
  update public.payments set status = 'voided', voided_at = now(), voided_by = (select auth.uid()), void_reason = left(btrim(p_reason), 500)
   where id = p.id and status = 'active';
  perform private.recompute_sale(p.sale_id);
end $$;

create function public.void_sale(p_sale_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.sales;
begin
  select * into s from public.sales where id = p_sale_id for update;
  if s.id is null then raise exception 'Sale not found.' using errcode = 'P0002'; end if;
  perform private.assert_perm(s.business_id, 'sales.manage');
  if not private.is_manager_or_owner(s.business_id) then
    raise exception 'Only an owner or manager can void a sale.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Give a reason for voiding.' using errcode = '22023'; end if;
  if exists (select 1 from public.payments where sale_id = s.id and status = 'active') and s.paid_centavos <> 0 then
    raise exception 'Refund or void the payments on this sale first.' using errcode = '22023';
  end if;
  update public.sales set status = 'voided', voided_at = now(), voided_by = (select auth.uid()), void_reason = left(btrim(p_reason), 500)
   where id = s.id and status = 'active';
end $$;

-- ---------------------------------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------------------------------
create function public.void_expense(p_expense_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.expenses;
begin
  select * into e from public.expenses where id = p_expense_id for update;
  if e.id is null then raise exception 'Expense not found.' using errcode = 'P0002'; end if;
  perform private.assert_perm(e.business_id, 'expenses.manage');
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Give a reason for voiding.' using errcode = '22023'; end if;
  update public.expenses set status = 'voided', voided_at = now(), voided_by = (select auth.uid()), void_reason = left(btrim(p_reason), 500)
   where id = e.id and status = 'active';
end $$;

-- ---------------------------------------------------------------------------------------------------
-- Receipt storage: private bucket, files at <business_id>/<uuid>.<ext>
-- ---------------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- Businesses where the caller holds `perm` and the business currently accepts writes.
create function private.writable_businesses_with(perm text) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select b from private.businesses_with(perm) b where private.access_state(b) in ('trialing', 'active')
$$;
grant execute on function private.writable_businesses_with(text) to authenticated;

create policy receipts_select on storage.objects for select to authenticated using (
  bucket_id = 'receipts' and (storage.foldername(name))[1] in (select r::text from private.readable_businesses('expenses.view') r)
);
create policy receipts_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] in (select w::text from private.writable_businesses_with('expenses.manage') w)
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf)$'
);
-- Only unattached uploads can be removed (e.g. the expense form was abandoned); attached receipts are kept.
create policy receipts_delete on storage.objects for delete to authenticated using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] in (select w::text from private.writable_businesses_with('expenses.manage') w)
  and not exists (select 1 from public.expenses e where e.receipt_path = storage.objects.name)
);

-- ---------------------------------------------------------------------------------------------------
-- Customer balances (RLS of `sales` applies because the view runs as the caller)
-- ---------------------------------------------------------------------------------------------------
create view public.customer_balances with (security_invoker = true) as
select s.business_id, s.customer_id,
       count(*)::integer as sales_count,
       sum(s.total_centavos)::bigint as total_centavos,
       sum(s.paid_centavos)::bigint as paid_centavos,
       sum(s.total_centavos - s.paid_centavos)::bigint as balance_centavos,
       max(s.sale_date) as last_sale_date
from public.sales s
where s.status = 'active' and s.customer_id is not null
group by s.business_id, s.customer_id;
grant select on public.customer_balances to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- Dashboard: one round trip, every figure computed from stored records. Sections the caller may not
-- see (no sales.view / expenses.view) come back as null.
-- ---------------------------------------------------------------------------------------------------
create function public.dashboard_summary(p_business_id uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  tz text := private.business_tz(p_business_id);
  can_sales boolean := private.has_perm(p_business_id, 'sales.view') or private.has_support_access(p_business_id);
  can_exp boolean := private.has_perm(p_business_id, 'expenses.view') or private.has_support_access(p_business_id);
  can_orders boolean := private.has_perm(p_business_id, 'orders.view') or private.has_support_access(p_business_id);
  can_cust boolean := private.has_perm(p_business_id, 'customers.view') or private.has_support_access(p_business_id);
  collected bigint; refunds bigint; exp bigint;
  r jsonb := '{}';
begin
  if not private.is_member(p_business_id) and not private.has_support_access(p_business_id) then
    raise exception 'You do not have access to this business.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Choose a date range of up to one year.' using errcode = '22023';
  end if;

  if can_sales then
    select coalesce(sum(amount_centavos) filter (where kind = 'payment'), 0), coalesce(sum(amount_centavos) filter (where kind = 'refund'), 0)
      into collected, refunds
      from public.payments
     where business_id = p_business_id and status = 'active' and (paid_at at time zone tz)::date between p_from and p_to;
    r := r || jsonb_build_object(
      'total_sales', (select coalesce(sum(total_centavos), 0) from public.sales
                      where business_id = p_business_id and status = 'active' and sale_date between p_from and p_to),
      'sales_count', (select count(*) from public.sales
                      where business_id = p_business_id and status = 'active' and sale_date between p_from and p_to),
      'collected', collected - refunds,
      'refunds', refunds,
      'receivables', (select coalesce(sum(total_centavos - paid_centavos), 0) from public.sales
                      where business_id = p_business_id and status = 'active'),
      'trend', (select coalesce(jsonb_agg(jsonb_build_object('date', d::date, 'sales', coalesce(s.amt, 0), 'collected', coalesce(p.amt, 0)) order by d), '[]')
                from generate_series(p_from, p_to, interval '1 day') d
                left join (select sale_date, sum(total_centavos) amt from public.sales
                           where business_id = p_business_id and status = 'active' and sale_date between p_from and p_to group by 1) s on s.sale_date = d::date
                left join (select (paid_at at time zone tz)::date pd,
                                  sum(case when kind = 'payment' then amount_centavos else -amount_centavos end) amt
                           from public.payments where business_id = p_business_id and status = 'active'
                             and (paid_at at time zone tz)::date between p_from and p_to group by 1) p on p.pd = d::date),
      'recent_sales', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
                         select s.id, s.sale_number, s.sale_date, s.total_centavos, s.paid_centavos, s.payment_status, s.created_at,
                                c.name as customer_name
                         from public.sales s left join public.customers c on c.id = s.customer_id
                         where s.business_id = p_business_id and s.status = 'active'
                         order by s.created_at desc limit 8) x));
  end if;

  if can_exp then
    select coalesce(sum(amount_centavos), 0) into exp from public.expenses
     where business_id = p_business_id and status = 'active' and expense_date between p_from and p_to;
    r := r || jsonb_build_object('expenses', exp);
  end if;
  if can_sales and can_exp then
    r := r || jsonb_build_object('net_cash', collected - refunds - exp);
  end if;

  if can_orders then
    r := r || jsonb_build_object(
      'open_orders', (select count(*) from public.orders where business_id = p_business_id and status not in ('completed', 'cancelled')),
      'completed_orders', (select count(*) from public.orders where business_id = p_business_id and status = 'completed'
                           and (completed_at at time zone tz)::date between p_from and p_to),
      'orders_by_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (
                             select status, count(*) n from public.orders
                             where business_id = p_business_id and order_date between p_from and p_to group by status) x));
  end if;
  if can_cust then
    r := r || jsonb_build_object('active_customers',
      (select count(*) from public.customers where business_id = p_business_id and status = 'active'));
  end if;
  return r;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.save_order(uuid, uuid, uuid, date, text, uuid, date, public.order_priority, text, jsonb),
  public.change_order_status(uuid, public.order_status, text),
  public.add_order_note(uuid, text),
  public.record_payment(uuid, bigint, public.payment_method, uuid, text, text, timestamptz, text),
  public.create_sale(uuid, uuid, jsonb, uuid, uuid, date, bigint, text, jsonb),
  public.void_payment(uuid, text), public.void_sale(uuid, text), public.void_expense(uuid, text),
  public.dashboard_summary(uuid, date, date)
to authenticated;
