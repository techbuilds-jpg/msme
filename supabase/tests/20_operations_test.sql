-- Phase 2: orders, sales, payments, expenses, receipts, dashboard — including cross-tenant attempts.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000001a1', 'olga@o.test', now(), '{"full_name":"Olga Owner"}'),
  ('00000000-0000-0000-0000-0000000001a2', 'eli@o.test', now(), '{"full_name":"Eli Employee"}'),
  ('00000000-0000-0000-0000-0000000001b1', 'pat@p.test', now(), '{"full_name":"Pat Other"}');

create or replace function pg_temp.login(uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
$$;
create or replace function pg_temp.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'ASSERTION FAILED: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
create or replace function pg_temp.expect_error(stmt text, code text, msg text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'ASSERTION FAILED (no error): %', msg;
exception when others then
  if sqlerrm like 'ASSERTION FAILED%' then raise; end if;
  if code is not null and sqlstate <> code then
    raise exception 'ASSERTION FAILED: % (expected %, got % %)', msg, code, sqlstate, sqlerrm;
  end if;
  raise notice 'ok - % [%]', msg, sqlstate;
end $$;
grant execute on all functions in schema pg_temp to public;

\set as_olga 'reset role; select pg_temp.login(''00000000-0000-0000-0000-0000000001a1''); set role authenticated;'
\set as_eli  'reset role; select pg_temp.login(''00000000-0000-0000-0000-0000000001a2''); set role authenticated;'
\set as_pat  'reset role; select pg_temp.login(''00000000-0000-0000-0000-0000000001b1''); set role authenticated;'

:as_olga
select public.create_business('Olga Tailoring', 'service', 'olga@o.test') as biz \gset
insert into public.customers (business_id, name) values (:'biz', 'Maria Santos') returning id as cust \gset
select public.create_invitation(:'biz', 'eli@o.test') ->> 'token' as tok \gset
select id as emp_owner from public.employees where business_id = :'biz' limit 1 \gset
:as_eli
select public.accept_invitation(:'tok') \gset ignored_
:as_pat
select public.create_business('Pat Shop', 'retail', 'pat@p.test') as biz_p \gset
insert into public.customers (business_id, name) values (:'biz_p', 'Pat Customer') returning id as cust_p \gset

-- ---------- Orders ----------------------------------------------------------------------------------
:as_olga
select public.save_order(:'biz', null, :'cust', null, 'Hem 3 pants', :'emp_owner', null, 'high', null,
  '[{"description":"Hemming","quantity":3,"unit_price_centavos":15000},{"description":"Rush fee","quantity":1,"unit_price_centavos":5000,"item_type":"service"}]') as ord \gset
select pg_temp.ok((select order_number = 'ORD-000001' and total_centavos = 50000 and status = 'new' from public.orders where id = :'ord'), 'order numbered and totalled');
select pg_temp.ok((select count(*) = 2 from public.order_activity where order_id = :'ord'), 'order created + assigned activity');
select public.change_order_status(:'ord', 'in_progress', 'Started cutting');
select pg_temp.ok((select count(*) = 1 from public.order_activity where order_id = :'ord' and kind = 'status_changed' and from_status = 'new' and to_status = 'in_progress' and actor_id = '00000000-0000-0000-0000-0000000001a1'), 'status change recorded with actor');
select public.save_order(:'biz', :'ord', :'cust', null, 'Hem 4 pants', :'emp_owner', null, 'normal', 'note',
  '[{"description":"Hemming","quantity":4,"unit_price_centavos":15000}]') \gset ignored_
select pg_temp.ok((select total_centavos = 60000 and description = 'Hem 4 pants' from public.orders where id = :'ord'), 'order edited, items replaced');
select pg_temp.expect_error(format($$select public.save_order(%L, null, %L)$$, :'biz', :'cust_p'), '23503', 'order cannot use another business''s customer');
select pg_temp.expect_error(format($$select public.save_order(%L, null, null, '2026-10-10', null, null, '2026-10-01')$$, :'biz'), '22023', 'due date before order date refused');

:as_eli
select public.change_order_status(:'ord', 'completed');
select pg_temp.expect_error(format($$select public.change_order_status(%L, 'in_progress')$$, :'ord'), '42501', 'employee cannot reopen a completed order');
select public.add_order_note(:'ord', 'Customer picked up');
select pg_temp.ok((select count(*) = 1 from public.order_activity where order_id = :'ord' and kind = 'note'), 'employee added note');

:as_pat
select pg_temp.expect_error(format($$select public.change_order_status(%L, 'cancelled')$$, :'ord'), '42501', 'other tenant cannot change order status');
select pg_temp.expect_error(format($$select public.add_order_note(%L, 'x')$$, :'ord'), '42501', 'other tenant cannot add notes');
select pg_temp.expect_error(format($$select public.save_order(%L, %L)$$, :'biz_p', :'ord'), 'P0002', 'other tenant cannot edit order via own business id');
select pg_temp.ok((select count(*) = 0 from public.order_activity where order_id = :'ord'), 'other tenant sees no activity');

-- ---------- Sales & payments ------------------------------------------------------------------------
:as_olga
select public.create_sale(:'biz', '11111111-1111-1111-1111-111111111111', '[{"description":"Alteration","quantity":2,"unit_price_centavos":25000}]',
  :'cust', :'ord', null, 5000, null, '{"amount_centavos":20000,"method":"gcash","idempotency_key":"22222222-2222-2222-2222-222222222222"}') as sale \gset
select pg_temp.ok((select subtotal_centavos = 50000 and discount_centavos = 5000 and total_centavos = 45000 and paid_centavos = 20000 and payment_status = 'partially_paid' and sale_number = 'SAL-000001' from public.sales where id = :'sale'), 'sale totals and partial payment');
select pg_temp.ok((select public.create_sale(:'biz', '11111111-1111-1111-1111-111111111111', '[{"description":"x","quantity":1,"unit_price_centavos":1}]') = :'sale'::uuid), 'retried sale returns the same sale');
select pg_temp.ok((select count(*) = 1 from public.sales where business_id = :'biz'), 'no duplicate sale created');
select public.record_payment(:'sale', 10000, 'cash', '33333333-3333-3333-3333-333333333333') as pay2 \gset
select pg_temp.ok((select public.record_payment(:'sale', 10000, 'cash', '33333333-3333-3333-3333-333333333333') = :'pay2'::uuid), 'retried payment returns the same payment');
select pg_temp.ok((select paid_centavos = 30000 from public.sales where id = :'sale'), 'duplicate payment not counted');
select pg_temp.expect_error(format($$select public.record_payment(%L, 20000, 'cash', gen_random_uuid())$$, :'sale'), '22023', 'overpayment refused');
select public.record_payment(:'sale', 15000, 'bank_transfer', gen_random_uuid(), 'payment', 'BDO-123') \gset ignored_
select pg_temp.ok((select payment_status = 'paid' and paid_centavos = 45000 from public.sales where id = :'sale'), 'fully paid');
select pg_temp.expect_error(format($$select public.record_payment(%L, 50000, 'cash', gen_random_uuid(), 'refund')$$, :'sale'), '22023', 'refund above paid refused');
select public.record_payment(:'sale', 5000, 'cash', gen_random_uuid(), 'refund') as refund \gset
select pg_temp.ok((select payment_status = 'partially_paid' and paid_centavos = 40000 and refunded_centavos = 5000 from public.sales where id = :'sale'), 'partial refund recomputed');
select public.void_payment(:'refund', 'Entered by mistake');
select pg_temp.ok((select payment_status = 'paid' and paid_centavos = 45000 from public.sales where id = :'sale'), 'voided refund restores paid');
select pg_temp.expect_error(format($$select public.void_sale(%L, 'oops')$$, :'sale'), '22023', 'cannot void a sale with payments');
select pg_temp.expect_error(format($$select public.create_sale(%L, gen_random_uuid(), '[{"description":"x","quantity":1,"unit_price_centavos":100}]', null, null, null, 200)$$, :'biz'), '22023', 'discount above subtotal refused');
select pg_temp.expect_error(format($$select public.create_sale(%L, gen_random_uuid(), '[]')$$, :'biz'), '22023', 'sale without items refused');
select pg_temp.expect_error(format($$select public.create_sale(%L, gen_random_uuid(), '[{"description":"x","quantity":1,"unit_price_centavos":100}]', %L)$$, :'biz', :'cust_p'), '23503', 'sale cannot use another business''s customer');
select pg_temp.ok((select count(*) = 1 and sum(balance_centavos) = 0 from public.customer_balances where customer_id = :'cust'), 'customer balance view');
select pg_temp.ok((select count(*) > 0 from public.audit_logs where business_id = :'biz' and entity_type = 'payments'), 'payments audited');

:as_eli
select pg_temp.ok((select count(*) = 0 from public.sales), 'employee cannot read sales by default');
select pg_temp.ok((select count(*) = 0 from public.customer_balances), 'employee cannot read balances');
select pg_temp.expect_error(format($$select public.create_sale(%L, gen_random_uuid(), '[{"description":"x","quantity":1,"unit_price_centavos":100}]')$$, :'biz'), '42501', 'employee cannot create sales by default');
select pg_temp.expect_error(format($$select public.record_payment(%L, 1, 'cash', gen_random_uuid())$$, :'sale'), '42501', 'employee cannot record payments by default');
select pg_temp.ok((select public.dashboard_summary(:'biz', current_date - 30, current_date) ? 'total_sales' = false), 'employee dashboard hides financial figures');
select pg_temp.ok((select (public.dashboard_summary(:'biz', current_date - 30, current_date) ->> 'completed_orders')::int = 1), 'employee dashboard shows order figures');

:as_olga
select public.update_member(id, null, array['sales.view', 'sales.manage', 'payments.manage']) from public.business_members where user_id = '00000000-0000-0000-0000-0000000001a2';
:as_eli
select public.create_sale(:'biz', gen_random_uuid(), '[{"description":"Patch","quantity":1,"unit_price_centavos":10000}]') as sale2 \gset
select pg_temp.expect_error(format($$select public.create_sale(%L, gen_random_uuid(), '[{"description":"x","quantity":1,"unit_price_centavos":1000}]', null, null, null, 100)$$, :'biz'), '42501', 'discount needs sales.discount');
select pg_temp.expect_error(format($$select public.void_payment(%L, 'x')$$, :'pay2'), '42501', 'employee cannot void payments');

:as_pat
select pg_temp.expect_error(format($$select public.record_payment(%L, 100, 'cash', gen_random_uuid())$$, :'sale2'), '42501', 'other tenant cannot pay into sale');
select pg_temp.expect_error(format($$select public.void_sale(%L, 'x')$$, :'sale2'), '42501', 'other tenant cannot void sale');
select pg_temp.expect_error(format($$select public.dashboard_summary(%L, current_date - 7, current_date)$$, :'biz'), '42501', 'other tenant cannot load dashboard');
select pg_temp.ok((select count(*) = 0 from public.payments where sale_id = :'sale'), 'other tenant sees no payments');

:as_olga
select public.void_sale(:'sale2', 'Wrong customer');
select pg_temp.ok((select status = 'voided' and void_reason = 'Wrong customer' from public.sales where id = :'sale2'), 'unpaid sale voided with reason');
select pg_temp.expect_error(format($$select public.record_payment(%L, 100, 'cash', gen_random_uuid())$$, :'sale2'), '22023', 'cannot pay a voided sale');

-- ---------- Dashboard -------------------------------------------------------------------------------
insert into public.expenses (business_id, expense_date, category_id, amount_centavos)
  select :'biz', current_date, id, 12000 from public.expense_categories where business_id = :'biz' and name = 'Supplies' returning id as exp \gset
select public.dashboard_summary(:'biz', current_date - 6, current_date) as dash \gset
select pg_temp.ok(((:'dash')::jsonb ->> 'total_sales')::bigint = 45000, 'dashboard total sales excludes voided');
select pg_temp.ok(((:'dash')::jsonb ->> 'collected')::bigint = 45000, 'dashboard collected = payments - refunds');
select pg_temp.ok(((:'dash')::jsonb ->> 'receivables')::bigint = 0, 'dashboard receivables');
select pg_temp.ok(((:'dash')::jsonb ->> 'expenses')::bigint = 12000, 'dashboard expenses');
select pg_temp.ok(((:'dash')::jsonb ->> 'net_cash')::bigint = 33000, 'dashboard net cash movement');
select pg_temp.ok(jsonb_array_length((:'dash')::jsonb -> 'trend') = 7, 'trend has one point per day');
select pg_temp.ok(((:'dash')::jsonb ->> 'active_customers')::int = 1, 'active customers');
select pg_temp.expect_error(format($$select public.dashboard_summary(%L, current_date - 400, current_date)$$, :'biz'), '22023', 'range over a year refused');

-- ---------- Expenses & receipts ---------------------------------------------------------------------
select public.void_expense(:'exp', 'Duplicate');
select pg_temp.expect_error(format($$update public.expenses set amount_centavos = 1 where id = %L$$, :'exp'), '42501', 'voided expense cannot be edited');
select pg_temp.expect_error(format($$update public.expenses set status = 'active' where id = %L$$, :'exp'), '42501', 'status cannot be changed directly');
insert into storage.objects (bucket_id, name) values ('receipts', :'biz' || '/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg');
select pg_temp.ok((select count(*) = 1 from storage.objects where bucket_id = 'receipts'), 'owner uploads and reads own receipt');
:as_pat
select pg_temp.ok((select count(*) = 0 from storage.objects where bucket_id = 'receipts'), 'other tenant cannot see receipts');
select pg_temp.expect_error(format($$insert into storage.objects (bucket_id, name) values ('receipts', %L)$$, :'biz' || '/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg'), '42501', 'other tenant cannot upload into business folder');
select pg_temp.expect_error(format($$insert into public.expenses (business_id, expense_date, category_id, amount_centavos, receipt_path) select %L, current_date, id, 100, %L from public.expense_categories where business_id = %L limit 1$$, :'biz_p', :'biz' || '/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg', :'biz_p'), '23514', 'expense cannot point at another business''s receipt');
reset role;

-- ---------- Expense summary (security invoker → RLS applies) ----------------------------------------
:as_olga
insert into public.expenses (business_id, expense_date, category_id, amount_centavos)
  select :'biz', current_date, id, 7000 from public.expense_categories where business_id = :'biz' and name = 'Rent';
select pg_temp.ok((select total_centavos = 7000 and expense_count = 1 from public.expense_summary(:'biz', current_date, current_date) where category_name = 'Rent'), 'expense summary totals active expenses');
select pg_temp.ok((select count(*) = 1 from public.expense_summary(:'biz', current_date, current_date)), 'voided expense excluded from summary');
:as_pat
select pg_temp.ok((select count(*) = 0 from public.expense_summary(:'biz', current_date, current_date)), 'other tenant gets empty expense summary');
reset role;
