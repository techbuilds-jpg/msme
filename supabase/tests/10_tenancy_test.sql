-- Tenancy, permissions, invitations and trial-limit tests. Runs on a disposable database with the
-- migrations applied (scripts/test-db.sh). Steps that must be refused are wrapped in "expect" blocks.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role; reset session authorization;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'alice@a.test', now(), '{"full_name":"Alice Owner"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'arnel@a.test', now(), '{"full_name":"Arnel Employee"}'),
  ('00000000-0000-0000-0000-0000000000a3', 'amy@a.test', now(), '{"full_name":"Amy Manager"}'),
  ('00000000-0000-0000-0000-0000000000a4', 'abe@a.test', now(), '{}'),
  ('00000000-0000-0000-0000-0000000000b1', 'bob@b.test', now(), '{"full_name":"Bob Owner"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'carol@c.test', now(), '{}'),
  ('00000000-0000-0000-0000-0000000000d1', 'admin@platform.test', now(), '{}'),
  ('00000000-0000-0000-0000-0000000000e1', 'unverified@x.test', null, '{}');
insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000000d1');

create or replace function pg_temp.login(uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
$$;
create or replace function pg_temp.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'ASSERTION FAILED: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
-- Runs `stmt` and asserts it fails with SQLSTATE `code` (or any error when code is null).
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

-- helper to switch identity
\set as_alice   'reset role; select pg_temp.login(''00000000-0000-0000-0000-0000000000a1''); set role authenticated;'
\set as_arnel   'reset role; select pg_temp.login(''00000000-0000-0000-0000-0000000000a2''); set role authenticated;'
\set as_amy     'reset role; select pg_temp.login(''00000000-0000-0000-0000-0000000000a3''); set role authenticated;'
\set as_abe     'reset role; select pg_temp.login(''00000000-0000-0000-0000-0000000000a4''); set role authenticated;'
\set as_bob     'reset role; select pg_temp.login(''00000000-0000-0000-0000-0000000000b1''); set role authenticated;'
\set as_carol   'reset role; select pg_temp.login(''00000000-0000-0000-0000-0000000000c1''); set role authenticated;'
\set as_admin   'reset role; select pg_temp.login(''00000000-0000-0000-0000-0000000000d1''); set role authenticated;'
\set as_unver   'reset role; select pg_temp.login(''00000000-0000-0000-0000-0000000000e1''); set role authenticated;'
\set as_anon    'reset role; select set_config(''request.jwt.claims'', ''{"role":"anon"}'', false); set role anon;'

-- ---------- 1. Onboarding -------------------------------------------------------------------------
:as_unver
select pg_temp.expect_error($$select public.create_business('Nope Shop', 'retail', 'x@x.test')$$, '42501', 'unverified user cannot create a business');

:as_alice
select public.create_business('Alpha Services', 'service', 'hello@alpha.test', 'small', 5) as biz_a \gset
select pg_temp.ok((select count(*) = 1 from public.my_businesses()), 'alice sees her one business');
select pg_temp.ok((select role = 'owner' from public.business_members where business_id = :'biz_a'), 'alice is owner');
select pg_temp.ok((select count(*) = 9 from public.expense_categories where business_id = :'biz_a'), 'default expense categories seeded');
select pg_temp.ok((select dashboard_kpis[1] = 'open_orders' from public.business_settings where business_id = :'biz_a'), 'service template sets order-first KPIs');
select pg_temp.ok((select (public.business_context(:'biz_a') -> 'subscription' ->> 'days_left')::int = 14), 'trial has 14 days left');
select pg_temp.ok((select count(*) = 1 from public.employees where business_id = :'biz_a' and member_id is not null), 'owner employee record created');
select pg_temp.expect_error($$select public.create_business('Alpha Two', 'retail', 'two@alpha.test')$$, 'TR005', 'second trial business refused');

:as_bob
select public.create_business('Bravo Retail', 'retail', 'hi@bravo.test') as biz_b \gset
select pg_temp.ok((select dashboard_kpis[1] = 'total_sales' from public.business_settings where business_id = :'biz_b'), 'retail template sets sales-first KPIs');

-- ---------- 2. Cross-tenant isolation -------------------------------------------------------------
:as_alice
insert into public.customers (business_id, name, contact_number) values (:'biz_a', 'Ana Cruz', '0917') returning id as cust_a \gset
insert into public.expenses (business_id, expense_date, category_id, amount_centavos, description)
  select :'biz_a', current_date, id, 150000, 'Office rent' from public.expense_categories where business_id = :'biz_a' and name = 'Rent'
  returning id as exp_a \gset
select id as cat_a from public.expense_categories where business_id = :'biz_a' limit 1 \gset
select pg_temp.ok((select recorded_by = '00000000-0000-0000-0000-0000000000a1' from public.expenses where id = :'exp_a'), 'expense recorder forced to caller');

:as_bob
insert into public.customers (business_id, name) values (:'biz_b', 'Ben Santos') returning id as cust_b \gset
select pg_temp.ok((select count(*) = 1 from public.businesses), 'bob sees only his business');
select pg_temp.ok((select count(*) = 0 from public.customers where business_id = :'biz_a'), 'bob cannot read A customers');
select pg_temp.ok((select count(*) = 0 from public.customers where id = :'cust_a'), 'bob cannot read A customer by id');
select pg_temp.ok((select count(*) = 0 from public.expenses), 'bob sees none of A expenses');
select pg_temp.ok((select count(*) = 0 from public.expense_categories where business_id = :'biz_a'), 'bob cannot read A categories');
select pg_temp.ok((select count(*) = 0 from public.business_members where business_id = :'biz_a'), 'bob cannot read A members');
select pg_temp.ok((select count(*) = 0 from public.subscriptions where business_id = :'biz_a'), 'bob cannot read A subscription');
select pg_temp.ok((select count(*) = 0 from public.audit_logs where business_id = :'biz_a'), 'bob cannot read A audit log');
select pg_temp.ok((select count(*) = 0 from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 'bob cannot read alice profile');
select pg_temp.expect_error(format($$insert into public.customers (business_id, name) values (%L, 'Injected')$$, :'biz_a'), '42501', 'bob cannot insert into A');
update public.customers set name = 'Hacked' where id = :'cust_a';
reset role;
select pg_temp.ok((select name = 'Ana Cruz' from public.customers where id = :'cust_a'), 'bob update of A customer affected nothing');
:as_bob
select pg_temp.expect_error(format($$update public.customers set business_id = %L where id = %L$$, :'biz_a', :'cust_b'), '42501', 'cannot move a row to another business');
select pg_temp.expect_error(format($$select public.business_context(%L)$$, :'biz_a'), '42501', 'bob cannot load A context');
select pg_temp.expect_error(format($$select public.create_invitation(%L, 'x@b.test')$$, :'biz_a'), '42501', 'bob cannot invite into A');
select pg_temp.expect_error(format($$delete from public.customers where id = %L$$, :'cust_b'), '42501', 'customers cannot be deleted through the API');
select pg_temp.expect_error($$insert into public.sales (business_id, sale_number, sale_date, idempotency_key) values (gen_random_uuid(), 'X', current_date, gen_random_uuid())$$, '42501', 'sales cannot be inserted directly');
select pg_temp.expect_error($$insert into public.payments (business_id, sale_id, amount_centavos, method, idempotency_key) values (gen_random_uuid(), gen_random_uuid(), 1, 'cash', gen_random_uuid())$$, '42501', 'payments cannot be inserted directly');
select pg_temp.expect_error($$insert into public.orders (business_id, order_number, order_date) values (gen_random_uuid(), 'X', current_date)$$, '42501', 'orders cannot be inserted directly');
-- manipulated id: an expense in B pointing at A's category / an order of B pointing at A's customer
select pg_temp.expect_error(format($$insert into public.expenses (business_id, expense_date, category_id, amount_centavos) values (%L, current_date, %L, 100)$$, :'biz_b', :'cat_a'), '23503', 'B expense cannot reference A category id');
reset role;
select pg_temp.expect_error(format($$insert into public.orders (business_id, order_number, order_date, customer_id) values (%L, 'X-1', current_date, %L)$$, :'biz_b', :'cust_a'), '23503', 'composite FK blocks cross-tenant customer even for service code');

:as_anon
select pg_temp.expect_error($$select count(*) from public.customers$$, '42501', 'anon cannot read customers');
select pg_temp.expect_error($$select public.my_businesses()$$, '42501', 'anon cannot call RPCs');

:as_admin
select pg_temp.ok((select count(*) = 0 from public.customers), 'platform admin cannot read tenant customers without a grant');
select pg_temp.ok((select count(*) = 2 from public.businesses), 'platform admin sees business list');

-- ---------- 3. Invitations, roles, seat limit -----------------------------------------------------
:as_alice
select public.create_invitation(:'biz_a', 'Arnel@A.test', 'employee') ->> 'token' as tok_arnel \gset
select public.create_invitation(:'biz_a', 'amy@a.test', 'manager') ->> 'token' as tok_amy \gset
select pg_temp.ok((select count(*) = 2 from public.business_invitations where business_id = :'biz_a'), 'two pending invitations');
select pg_temp.ok((select token_hash <> :'tok_arnel' from public.business_invitations where email = 'arnel@a.test'), 'raw token not stored');
select pg_temp.expect_error(format($$select public.create_invitation(%L, 'abe@a.test')$$, :'biz_a'), 'TR003', 'fourth seat refused (owner + 2 pending = 3)');
select pg_temp.expect_error(format($$select public.create_invitation(%L, 'abe@a.test', 'owner')$$, :'biz_a'), '42501', 'cannot invite an owner');

:as_carol
select pg_temp.expect_error(format($$select public.accept_invitation(%L)$$, :'tok_arnel'), '42501', 'invite cannot be accepted by a different email');
:as_unver
select pg_temp.expect_error(format($$select public.accept_invitation(%L)$$, :'tok_arnel'), '42501', 'unverified user cannot accept');
:as_arnel
select pg_temp.ok((select public.preview_invitation(:'tok_arnel') ->> 'business_name' = 'Alpha Services'), 'invite preview shows business');
select pg_temp.ok((select public.accept_invitation(:'tok_arnel') = :'biz_a'::uuid), 'arnel accepts invitation');
select pg_temp.expect_error(format($$select public.accept_invitation(%L)$$, :'tok_arnel'), 'P0002', 'invitation cannot be reused');
:as_amy
select public.accept_invitation(:'tok_amy') \gset ignored_

-- employee permissions
:as_arnel
select pg_temp.ok((select count(*) = 1 from public.customers), 'employee can read customers');
select pg_temp.ok((select count(*) = 0 from public.expenses), 'employee cannot read expenses by default');
select pg_temp.ok((select count(*) = 0 from public.business_invitations), 'employee cannot read invitations');
select pg_temp.ok((select count(*) = 0 from public.audit_logs), 'employee cannot read audit log');
select pg_temp.ok((select count(*) = 3 from public.employees), 'employee sees staff directory');
select pg_temp.expect_error(format($$insert into public.expenses (business_id, expense_date, category_id, amount_centavos) select %L, current_date, id, 100 from public.expense_categories where business_id = %L limit 1$$, :'biz_a', :'biz_a'), '42501', 'employee cannot record expenses');
update public.businesses set name = 'Mine' where id = :'biz_a';
reset role;
select pg_temp.ok((select name = 'Alpha Services' from public.businesses where id = :'biz_a'), 'employee cannot rename business');
:as_arnel
select pg_temp.expect_error(format($$select public.update_member(id, 'owner') from public.business_members where user_id = '00000000-0000-0000-0000-0000000000a2' and business_id = %L$$, :'biz_a'), '42501', 'employee cannot promote self');

-- manager limits
:as_amy
select pg_temp.ok((select count(*) = 1 from public.expenses), 'manager can read expenses');
select pg_temp.expect_error(format($$select public.update_member(id, 'manager') from public.business_members where user_id = '00000000-0000-0000-0000-0000000000a2' and business_id = %L$$, :'biz_a'), '42501', 'manager cannot promote employee');
select pg_temp.expect_error(format($$select public.update_member(id, null, null, false) from public.business_members where user_id = '00000000-0000-0000-0000-0000000000a1' and business_id = %L$$, :'biz_a'), '42501', 'manager cannot deactivate owner');
select pg_temp.ok((select count(*) = 0 from public.audit_logs), 'manager cannot read audit log');

-- owner grants a financial permission
:as_alice
select public.update_member(id, null, array['expenses.view']) from public.business_members where user_id = '00000000-0000-0000-0000-0000000000a2' and business_id = :'biz_a';
select pg_temp.expect_error(format($$select public.update_member(id, 'employee') from public.business_members where user_id = '00000000-0000-0000-0000-0000000000a1' and business_id = %L$$, :'biz_a'), '42501', 'owner cannot demote self');
:as_arnel
select pg_temp.ok((select count(*) = 1 from public.expenses), 'granted employee can now read expenses');

-- deactivation removes access immediately
:as_alice
select public.update_member(id, null, null, false) from public.business_members where user_id = '00000000-0000-0000-0000-0000000000a2' and business_id = :'biz_a';
:as_arnel
select pg_temp.ok((select count(*) = 0 from public.customers), 'deactivated member sees nothing');
:as_alice
select pg_temp.ok((select count(*) > 0 from public.audit_logs where business_id = :'biz_a' and action = 'business_members.update'), 'membership change audited');

-- ---------- 4. Support access ---------------------------------------------------------------------
reset role;
insert into public.support_access_grants (business_id, admin_user_id, granted_by, reason, expires_at)
values (:'biz_a', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', 'Help with import', now() + interval '1 hour');
:as_admin
select pg_temp.ok((select count(*) = 1 from public.customers), 'admin with grant can read A customers');
select pg_temp.ok((select count(*) = 0 from public.customers where business_id = :'biz_b'), 'grant does not extend to B');
select pg_temp.expect_error(format($$insert into public.customers (business_id, name) values (%L, 'Admin write')$$, :'biz_a'), '42501', 'support access is read-only');

-- ---------- 5. Trial expiry and transaction limit -------------------------------------------------
reset role;
update public.subscriptions set trial_ends_at = now() - interval '1 minute', trial_started_at = now() - interval '15 days' where business_id = :'biz_a';
:as_alice
select pg_temp.ok((select count(*) = 1 from public.customers), 'expired trial: data still readable');
select pg_temp.ok((select public.business_context(:'biz_a') -> 'subscription' ->> 'access_state' = 'expired'), 'context reports expired');
select pg_temp.expect_error(format($$insert into public.customers (business_id, name) values (%L, 'After expiry')$$, :'biz_a'), 'TR001', 'expired trial: cannot add customers');
select pg_temp.expect_error(format($$update public.customers set name = 'x' where business_id = %L$$, :'biz_a'), 'TR001', 'expired trial: cannot edit customers');
select pg_temp.expect_error(format($$select public.create_invitation(%L, 'new@a.test')$$, :'biz_a'), 'TR001', 'expired trial: cannot invite');

reset role;
update public.subscriptions set max_transactions = 2 where business_id = :'biz_b';
insert into public.orders (business_id, order_number, order_date) values (:'biz_b', 'T-1', current_date), (:'biz_b', 'T-2', current_date);
select pg_temp.expect_error(format($$insert into public.orders (business_id, order_number, order_date) values (%L, 'T-3', current_date)$$, :'biz_b'), 'TR002', 'transaction limit enforced in the database');
select pg_temp.ok((select transactions_used = 2 from public.subscriptions where business_id = :'biz_b'), 'usage counter is 2');

reset role;

-- ---------- 6. Deleting a whole tenant (demo cleanup path) cascades cleanly -----------------------
reset role;
insert into public.expenses (business_id, expense_date, category_id, amount_centavos) select :'biz_b', current_date, id, 500 from public.expense_categories where business_id = :'biz_b' limit 1;
update public.orders set customer_id = :'cust_b' where business_id = :'biz_b';
delete from public.businesses where id = :'biz_b';
select pg_temp.ok((select count(*) = 0 from public.customers where business_id = :'biz_b'), 'business delete cascades to its records');
select pg_temp.ok((select count(*) = 1 from public.audit_logs where action = 'businesses.delete' and business_id is null), 'business deletion kept as platform audit event');
