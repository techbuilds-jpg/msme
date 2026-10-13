-- Phase 4: consultation, support access, demo sandbox, platform admin.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, is_anonymous) values
  ('00000000-0000-0000-0000-0000000003a1', 'owen@w.test', now(), '{"full_name":"Owen Owner"}', false),
  ('00000000-0000-0000-0000-0000000003d1', 'support@platform.test', now(), '{"full_name":"Support"}', false),
  ('00000000-0000-0000-0000-0000000003e1', null, null, '{}', true),
  ('00000000-0000-0000-0000-0000000003e2', null, null, '{}', true);
insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000003d1');

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

\set as_owen  'reset role; select pg_temp.login(''00000000-0000-0000-0000-0000000003a1''); set role authenticated;'
\set as_admin 'reset role; select pg_temp.login(''00000000-0000-0000-0000-0000000003d1''); set role authenticated;'
\set as_anon1 'reset role; select pg_temp.login(''00000000-0000-0000-0000-0000000003e1''); set role authenticated;'
\set as_anon2 'reset role; select pg_temp.login(''00000000-0000-0000-0000-0000000003e2''); set role authenticated;'

:as_owen
select public.create_business('Owen Services', 'service', 'owen@w.test') as biz \gset
insert into public.customers (business_id, name) values (:'biz', 'Real Customer') returning id as cust \gset

-- ---------- Demo sandbox ----------------------------------------------------------------------------
:as_anon1
select pg_temp.expect_error($$select public.create_business('Anon Biz', 'retail', 'x@x.test')$$, '42501', 'anonymous visitor cannot create a real business');
select public.start_demo() as demo \gset
select pg_temp.ok((select is_demo from public.businesses where id = :'demo'), 'demo business flagged');
select pg_temp.ok((select public.start_demo() = :'demo'::uuid), 'one demo per visitor');
select pg_temp.ok((select count(*) = 8 from public.customers), 'demo seeded with 8 sample customers');
select pg_temp.ok((select count(*) = 12 from public.orders), 'demo seeded with 12 orders');
select pg_temp.ok((select count(*) >= 5 from public.sales), 'demo seeded with sales');
select pg_temp.ok((select count(*) = 8 from public.expenses), 'demo seeded with expenses');
select pg_temp.ok((select bool_and(notes like '%fictional%') from public.customers), 'demo customers labelled fictional');
select pg_temp.ok((select count(*) = 0 from public.customers where name = 'Real Customer'), 'demo visitor sees no real data');
select pg_temp.ok((public.dashboard_summary(:'demo', current_date - 30, current_date) ->> 'total_sales')::bigint > 0, 'demo dashboard has figures');
select pg_temp.expect_error(format($$select public.create_invitation(%L, 'friend@x.test')$$, :'demo'), 'TR003', 'demo cannot invite other users');
:as_anon2
select public.start_demo() as demo2 \gset
select pg_temp.ok(:'demo2' <> :'demo', 'second visitor gets a separate demo');
select pg_temp.ok((select count(*) = 8 from public.customers), 'second visitor sees only their own demo data');
select pg_temp.expect_error(format($$insert into public.customers (business_id, name) values (%L, 'x')$$, :'demo'), '42501', 'visitor cannot write to another demo');

reset role;
update public.businesses set created_at = now() - interval '49 hours' where id = :'demo';
update auth.users set created_at = now() - interval '49 hours' where id = '00000000-0000-0000-0000-0000000003e1';
select pg_temp.ok((select private.cleanup_demos() = 1), 'cleanup removes demo older than 48 h');
select pg_temp.ok((select count(*) = 0 from auth.users where id = '00000000-0000-0000-0000-0000000003e1'), 'cleanup removes the anonymous demo user');
select pg_temp.ok((select count(*) = 1 from public.businesses where id = :'demo2'), 'recent demo kept');
select pg_temp.ok((select count(*) = 1 from public.businesses where id = :'biz'), 'real business untouched');
select pg_temp.ok((select count(*) = 0 from public.audit_logs where action = 'businesses.delete' and entity_id = :'demo'), 'demo deletion not written to the audit log');

-- ---------- Consultation & support access -----------------------------------------------------------
:as_owen
select public.request_consultation(:'biz', 'Interested in a subscription', 'Call 0917') \gset ignored_
select pg_temp.ok((select upgrade_interest_at is not null from public.subscriptions where business_id = :'biz'), 'upgrade interest recorded');
:as_admin
select pg_temp.ok((select count(*) = 0 from public.customers), 'admin sees no tenant customers without a grant');
select pg_temp.expect_error(format($$select public.support_open(%L)$$, :'biz'), '42501', 'admin cannot open business without a grant');
select pg_temp.ok((select count(*) = 0 from public.my_businesses()), 'admin switcher empty without grant');
:as_owen
select pg_temp.expect_error(format($$select public.grant_support_access(%L, 'owen@w.test', 2, 'x')$$, :'biz'), 'P0002', 'grant only to platform support accounts');
select public.grant_support_access(:'biz', 'support@platform.test', 2, 'Help with setup') as grant_id \gset
:as_admin
select pg_temp.ok((select support_access and role is null from public.my_businesses() where business_id = :'biz'), 'granted business appears for admin as support access');
select public.support_open(:'biz');
select pg_temp.ok((select count(*) = 1 from public.customers), 'admin with grant reads customers');
select pg_temp.ok((select count(*) = 1 from public.audit_logs where business_id = :'biz' and action = 'support.opened'), 'support session audited and visible to admin');
:as_owen
select pg_temp.ok((select count(*) = 1 from public.audit_logs where business_id = :'biz' and action = 'support.opened'), 'owner can see the support session in their audit log');
select public.revoke_support_access(:'grant_id');
:as_admin
select pg_temp.ok((select count(*) = 0 from public.customers), 'revoked grant removes access');

-- ---------- Platform admin ---------------------------------------------------------------------------
:as_owen
select pg_temp.expect_error($$select public.admin_overview()$$, '42501', 'owner cannot use admin overview');
select pg_temp.expect_error(format($$select public.admin_extend_trial(%L, 30, 'x')$$, :'biz'), '42501', 'owner cannot extend own trial');
reset role;
select count(*) as real_count from public.businesses where not is_demo \gset
:as_admin
select pg_temp.ok((public.admin_overview() ->> 'businesses')::int = :real_count, 'overview counts real businesses only (demos excluded)');
select pg_temp.ok((public.admin_overview() ->> 'upgrade_interest')::int >= 1, 'overview counts upgrade interest');
select pg_temp.ok(jsonb_array_length(public.admin_list_businesses()) = :real_count, 'business list excludes demos');
select pg_temp.ok((select x ->> 'owner_email' = 'owen@w.test' from jsonb_array_elements(public.admin_list_businesses()) x where x ->> 'id' = :'biz'), 'business list shows owner contact');
select pg_temp.ok((select count(*) = 1 from jsonb_array_elements(public.admin_list_consultations()) x where x ->> 'business_name' = 'Owen Services'), 'admin sees consultation requests');
reset role;
update public.subscriptions set trial_ends_at = now() - interval '1 day', trial_started_at = now() - interval '20 days' where business_id = :'biz';
:as_admin
select public.admin_extend_trial(:'biz', 7, 'Customer asked for more time');
select pg_temp.ok((select private.access_state(:'biz') = 'trialing'), 'extended trial is active again');
select public.admin_set_suspension(:'biz', true, 'Payment dispute');
:as_owen
select pg_temp.expect_error(format($$insert into public.customers (business_id, name) values (%L, 'x')$$, :'biz'), 'TR004', 'suspended business is read-only');
select pg_temp.ok((select count(*) = 1 from public.customers), 'suspended owner can still read');
:as_admin
select public.admin_set_suspension(:'biz', false, 'Resolved');
select public.admin_set_plan(:'biz', 'standard', 10, null, array['sales', 'orders', 'customers'], 'Converted to subscription');
select pg_temp.ok((select private.access_state(:'biz') = 'active'), 'standard plan is active');
select pg_temp.expect_error(format($$select public.business_context(%L)$$, :'biz'), '42501', 'admin still has no tenant context without a grant');
:as_owen
select pg_temp.ok((select enabled_modules @> array['dashboard', 'sales', 'orders', 'customers'] and not enabled_modules && array['expenses', 'reports'] from public.business_settings where business_id = :'biz'), 'admin changed feature availability');
select pg_temp.ok((select count(*) >= 4 from public.audit_logs where business_id = :'biz' and action like 'admin.%'), 'admin actions visible to the owner in the audit log');
:as_admin
select pg_temp.ok((select count(*) >= 4 from public.audit_logs where business_id = :'biz' and action like 'admin.%'), 'admin actions visible to admin');
select pg_temp.ok((select count(*) = 0 from public.audit_logs where business_id = :'biz' and action like 'business_members.%'), 'admin cannot read tenant audit entries');
select pg_temp.expect_error($$select public.admin_set_setting('trial_days', '0')$$, '22023', 'invalid platform setting refused');
select public.admin_set_setting('trial_days', '21');
select pg_temp.ok((select value = '21' from public.platform_settings where key = 'trial_days'), 'platform setting changed');
reset role;

-- grant keeps the support email visible to the owner
:as_owen
select pg_temp.ok((select admin_email = 'support@platform.test' from public.support_access_grants where id = :'grant_id'), 'owner sees which support account had access');
reset role;
