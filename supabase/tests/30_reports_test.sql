-- Phase 3: reports, export logging, settings validation, numbering.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000002a1', 'rita@r.test', now(), '{"full_name":"Rita Owner"}'),
  ('00000000-0000-0000-0000-0000000002a2', 'emil@r.test', now(), '{"full_name":"Emil Employee"}'),
  ('00000000-0000-0000-0000-0000000002b1', 'zed@z.test', now(), '{}');

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

\set as_rita 'reset role; select pg_temp.login(''00000000-0000-0000-0000-0000000002a1''); set role authenticated;'
\set as_emil 'reset role; select pg_temp.login(''00000000-0000-0000-0000-0000000002a2''); set role authenticated;'
\set as_zed  'reset role; select pg_temp.login(''00000000-0000-0000-0000-0000000002b1''); set role authenticated;'

:as_rita
select public.create_business('Rita Retail', 'retail', 'rita@r.test') as biz \gset
insert into public.customers (business_id, name) values (:'biz', 'Buyer One') returning id as cust \gset
insert into public.employees (business_id, full_name) values (:'biz', 'Rider Ray') returning id as emp \gset
select public.save_order(:'biz', null, :'cust', null, 'Deliver', :'emp', current_date - 1, 'normal', null, '[]') \gset ignored_
select public.create_sale(:'biz', gen_random_uuid(), '[{"description":"Item","quantity":1,"unit_price_centavos":30000}]', :'cust', null, null, 0, null,
  '{"amount_centavos":10000,"method":"maya"}') as sale \gset
select public.create_invitation(:'biz', 'emil@r.test') ->> 'token' as tok \gset
:as_emil
select public.accept_invitation(:'tok') \gset ignored_

:as_rita
select pg_temp.ok((public.report_data(:'biz', 'sales_summary', current_date, current_date) -> 'rows' -> 0 ->> 'total_centavos')::bigint = 30000, 'sales summary report');
select pg_temp.ok((public.report_data(:'biz', 'collections', current_date, current_date) -> 'rows' -> 0 ->> 'method') = 'maya', 'collections report');
select pg_temp.ok((public.report_data(:'biz', 'receivables', current_date, current_date) -> 'rows' -> 0 ->> 'balance_centavos')::bigint = 20000, 'receivables report');
select pg_temp.ok((public.report_data(:'biz', 'customer_history', current_date, current_date) -> 'rows' -> 0 ->> 'customer') = 'Buyer One', 'customer history report');
select pg_temp.ok((public.report_data(:'biz', 'employee_assignments', current_date - 1, current_date) -> 'rows' -> 0 ->> 'overdue')::int = 1, 'employee assignments report counts overdue');
select pg_temp.ok(jsonb_array_length(public.report_data(:'biz', 'orders_by_status', current_date, current_date) -> 'rows') = 1, 'orders report');
select pg_temp.ok((public.report_data(:'biz', 'expenses', current_date, current_date) ->> 'truncated') = 'false', 'expenses report (empty)');
select pg_temp.expect_error(format($$select public.report_data(%L, 'payroll', current_date, current_date)$$, :'biz'), '22023', 'unknown report refused');
select public.log_export(:'biz', 'sales_summary', current_date, current_date, 1);
select pg_temp.ok((select count(*) = 1 from public.audit_logs where business_id = :'biz' and action = 'report.exported'), 'export recorded in audit log');

-- settings validation and numbering after a prefix change
select pg_temp.expect_error(format($$update public.business_settings set enabled_modules = array['payroll'] where business_id = %L$$, :'biz'), '23514', 'unknown module refused');
update public.business_settings set sale_prefix = 'INV' where business_id = :'biz';
select public.create_sale(:'biz', gen_random_uuid(), '[{"description":"x","quantity":1,"unit_price_centavos":100}]') as s2 \gset
update public.business_settings set sale_prefix = 'SAL' where business_id = :'biz';
reset role;
update public.business_settings set next_sale_no = 1 where business_id = :'biz';
:as_rita
select public.create_sale(:'biz', gen_random_uuid(), '[{"description":"x","quantity":1,"unit_price_centavos":100}]') as s3 \gset
select pg_temp.ok((select sale_number = 'SAL-000002' from public.sales where id = :'s3'), 'numbering skips numbers already used');
select pg_temp.expect_error(format($$update public.business_settings set next_sale_no = 1 where business_id = %L$$, :'biz'), '42501', 'counters cannot be edited through the API');

-- employee: no reports by default; with reports.view but not sales.view only operational reports
:as_emil
select pg_temp.expect_error(format($$select public.report_data(%L, 'orders_by_status', current_date, current_date)$$, :'biz'), '42501', 'employee without reports.view refused');
:as_rita
select public.update_member(id, null, array['reports.view']) from public.business_members where user_id = '00000000-0000-0000-0000-0000000002a2';
:as_emil
select pg_temp.ok(jsonb_array_length(public.report_data(:'biz', 'orders_by_status', current_date, current_date) -> 'rows') = 1, 'employee with reports.view sees orders report');
select pg_temp.expect_error(format($$select public.report_data(%L, 'sales_summary', current_date, current_date)$$, :'biz'), '42501', 'reports.view alone does not reveal sales');
select pg_temp.expect_error(format($$select public.log_export(%L, 'orders_by_status', current_date, current_date, 1)$$, :'biz'), '42501', 'export needs reports.export');
update public.employees set full_name = 'x' where id = :'emp';
reset role;
select pg_temp.ok((select full_name = 'Rider Ray' from public.employees where id = :'emp'), 'directory unchanged by employee');

:as_zed
select pg_temp.expect_error(format($$select public.report_data(%L, 'sales_summary', current_date, current_date)$$, :'biz'), '42501', 'other tenant cannot run reports');
select pg_temp.expect_error(format($$select public.log_export(%L, 'sales_summary', current_date, current_date, 1)$$, :'biz'), '42501', 'other tenant cannot log exports');
reset role;
