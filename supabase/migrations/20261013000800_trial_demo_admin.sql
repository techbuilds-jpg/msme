-- =====================================================================================================
-- Phase 4: consultation requests, support access, demo sandbox, platform administration.
-- Platform admins get aggregates and account metadata only; tenant records need an owner-issued grant.
-- =====================================================================================================

-- Deleting a tenant (e.g. demo cleanup) must cascade through payments. Sales can't be deleted through the API,
-- so cascading payments with their sale only ever happens as part of a whole-business delete.
alter table public.payments drop constraint payments_business_id_sale_id_fkey,
  add constraint payments_business_id_sale_id_fkey foreign key (business_id, sale_id) references public.sales (business_id, id) on delete cascade,
  add constraint payments_business_id_fkey foreign key (business_id) references public.businesses (id) on delete cascade;

-- ---------------------------------------------------------------------------------------------------
-- Consultation / upgrade interest (allowed even after the trial ends)
-- ---------------------------------------------------------------------------------------------------
create function public.request_consultation(p_business_id uuid, p_message text, p_preferred_contact text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare rid uuid;
begin
  if not private.is_member(p_business_id) then raise exception 'You do not have access to this business.' using errcode = '42501'; end if;
  perform private.check_rate_limit('consult:' || (select auth.uid()), 5, interval '1 day');
  insert into public.consultation_requests (business_id, user_id, message, preferred_contact)
  values (p_business_id, (select auth.uid()), nullif(left(btrim(p_message), 2000), ''), nullif(left(btrim(p_preferred_contact), 200), ''))
  returning id into rid;
  update public.subscriptions set upgrade_interest_at = coalesce(upgrade_interest_at, now()) where business_id = p_business_id;
  perform private.audit(p_business_id, 'consultation.requested', 'consultation_requests', rid::text, '{}');
  return rid;
end $$;

-- ---------------------------------------------------------------------------------------------------
-- Support access: the owner grants a named platform admin temporary read-only access
-- ---------------------------------------------------------------------------------------------------
create function public.grant_support_access(p_business_id uuid, p_admin_email text, p_hours integer, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare aid uuid; gid uuid;
begin
  perform private.assert_perm(p_business_id, 'settings.manage');
  if p_hours is null or p_hours < 1 or p_hours > 168 then raise exception 'Access can last 1 to 168 hours (7 days).' using errcode = '22023'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Give a reason.' using errcode = '22023'; end if;
  select a.user_id into aid from public.platform_admins a join public.profiles p on p.id = a.user_id where p.email = lower(btrim(p_admin_email));
  if aid is null then raise exception 'That email is not a platform support account.' using errcode = 'P0002'; end if;
  insert into public.support_access_grants (business_id, admin_user_id, granted_by, reason, expires_at)
  values (p_business_id, aid, (select auth.uid()), left(btrim(p_reason), 500), now() + make_interval(hours => p_hours))
  returning id into gid;
  return gid;
end $$;

create function public.revoke_support_access(p_grant_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare bid uuid;
begin
  select business_id into bid from public.support_access_grants where id = p_grant_id;
  if bid is null then raise exception 'Grant not found.' using errcode = 'P0002'; end if;
  perform private.assert_perm(bid, 'settings.manage');
  update public.support_access_grants set revoked_at = now() where id = p_grant_id and revoked_at is null;
end $$;

-- Called by the admin UI when opening a business under a grant, so every session is on record.
create function public.support_open(p_business_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_support_access(p_business_id) then raise exception 'No active support access for this business.' using errcode = '42501'; end if;
  perform private.audit(p_business_id, 'support.opened', 'businesses', p_business_id::text, '{}');
end $$;

-- The business switcher also lists businesses opened under an active support grant (role = null).
drop function public.my_businesses();
create function public.my_businesses()
returns table (business_id uuid, name text, category public.business_category, role public.member_role,
               is_demo boolean, access_state text, trial_ends_at timestamptz, support_access boolean)
language sql stable security definer set search_path = '' as $$
  select b.id, b.name, b.category, m.role, b.is_demo, private.access_state(b.id), s.trial_ends_at, false
  from public.business_members m
  join public.businesses b on b.id = m.business_id
  join public.subscriptions s on s.business_id = b.id
  where m.user_id = (select auth.uid()) and m.is_active
  union all
  select b.id, b.name, b.category, null, b.is_demo, private.access_state(b.id), s.trial_ends_at, true
  from public.support_access_grants g
  join public.platform_admins a on a.user_id = g.admin_user_id
  join public.businesses b on b.id = g.business_id
  join public.subscriptions s on s.business_id = b.id
  where g.admin_user_id = (select auth.uid()) and g.revoked_at is null and g.expires_at > now()
    and not exists (select 1 from public.business_members m2 where m2.business_id = b.id and m2.user_id = g.admin_user_id and m2.is_active)
  order by 5, 2
$$;

-- ---------------------------------------------------------------------------------------------------
-- Demo sandbox: each visitor gets a private, fictional business that is deleted after 48 hours.
-- ---------------------------------------------------------------------------------------------------
create function private.seed_demo(bid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  today date := private.business_today(bid);
  emps uuid[] := '{}';
  custs uuid[] := '{}';
  e uuid; c uuid; o uuid; s uuid;
  i integer;
  names text[] := array['Andrea Villanueva', 'Bong Dizon', 'Carla Mendoza', 'Dennis Uy', 'Ella Navarro', 'Franco Lim', 'Grace Pascual', 'Hector Ramos'];
  staff text[] := array['Liza Cruz', 'Marco Reyes', 'Nina Santos'];
  svc text[] := array['Basic service visit', 'Rush service', 'Materials and supplies', 'Consultation (1 hour)', 'Delivery'];
  price bigint[] := array[150000, 250000, 80000, 120000, 35000];
  statuses public.order_status[] := array['new', 'confirmed', 'in_progress', 'for_review', 'completed', 'completed', 'completed', 'cancelled', 'in_progress', 'completed', 'new', 'confirmed'];
  cats text[] := array['Rent', 'Utilities', 'Supplies', 'Transportation', 'Marketing', 'Supplies', 'Maintenance', 'Software'];
  amts bigint[] := array[1500000, 420000, 185000, 60000, 250000, 92000, 130000, 99900];
begin
  for i in 1 .. array_length(staff, 1) loop
    insert into public.employees (business_id, full_name, job_title, employment_status, notes)
    values (bid, staff[i], (array['Technician', 'Technician', 'Front desk'])[i], 'active', 'Sample employee (fictional)')
    returning id into e;
    emps := emps || e;
  end loop;
  for i in 1 .. 5 loop
    insert into public.catalog_items (business_id, kind, name, unit_price_centavos) values (bid, case when i = 3 then 'product' else 'service' end, svc[i], price[i]);
  end loop;
  for i in 1 .. array_length(names, 1) loop
    insert into public.customers (business_id, name, contact_number, notes)
    values (bid, names[i], '0917 000 ' || lpad((1000 + i)::text, 4, '0'), 'Sample customer (fictional)')
    returning id into c;
    custs := custs || c;
  end loop;

  for i in 1 .. 12 loop
    o := public.save_order(bid, null, custs[1 + (i % 8)], today - (24 - i * 2), 'Sample job #' || i, emps[1 + (i % 3)],
           today - (24 - i * 2) + 5, (array['normal', 'high', 'normal', 'urgent', 'low'])[1 + (i % 5)]::public.order_priority, null,
           jsonb_build_array(jsonb_build_object('description', svc[1 + (i % 5)], 'quantity', 1 + (i % 3), 'unit_price_centavos', price[1 + (i % 5)])));
    if statuses[i] <> 'new' then
      perform public.change_order_status(o, 'confirmed');
      if statuses[i] <> 'confirmed' then perform public.change_order_status(o, statuses[i], case when statuses[i] = 'cancelled' then 'Customer rescheduled (sample)' end); end if;
    end if;
    if i % 4 = 0 then perform public.add_order_note(o, 'Customer asked for an update by text (sample note).'); end if;

    if statuses[i] in ('completed', 'for_review', 'in_progress') then
      s := public.create_sale(bid, gen_random_uuid(),
             jsonb_build_array(jsonb_build_object('description', svc[1 + (i % 5)], 'quantity', 1 + (i % 3), 'unit_price_centavos', price[1 + (i % 5)])),
             custs[1 + (i % 8)], o, today - (24 - i * 2) + 1, case when i = 5 then 20000 else 0 end, 'Sample sale (fictional)', null);
      perform public.record_payment(s, (select case when i % 3 = 0 then total_centavos / 2 else total_centavos end from public.sales where id = s),
                                    (array['cash', 'gcash', 'bank_transfer', 'maya'])[1 + (i % 4)]::public.payment_method, gen_random_uuid(), 'payment',
                                    'SAMPLE-' || i, ((today - (24 - i * 2) + 2)::timestamp + interval '10 hours') at time zone 'Asia/Manila', null);
    end if;
  end loop;

  for i in 1 .. array_length(cats, 1) loop
    insert into public.expenses (business_id, expense_date, category_id, amount_centavos, description, payment_method, vendor)
    select bid, today - (24 - i * 3), ec.id, amts[i], 'Sample expense (fictional)', 'cash', 'Sample Supplier ' || i
    from public.expense_categories ec where ec.business_id = bid and ec.name = cats[i];
  end loop;
end $$;

create function public.start_demo() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  bid uuid;
begin
  if uid is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  select b.id into bid from public.business_members m join public.businesses b on b.id = m.business_id
   where m.user_id = uid and b.is_demo limit 1;
  if bid is not null then return bid; end if;               -- one demo per visitor
  perform private.check_rate_limit('demo:' || uid, 3, interval '1 hour');
  perform private.check_rate_limit('demo:global', 200, interval '1 hour');
  bid := private.create_business_internal(uid, 'Sample Services Co. (DEMO)', 'service', 'Fictional address, Quezon City',
                                          'demo@example.invalid', null, 'small', 4, 'PHP', 'Asia/Manila', true);
  perform private.seed_demo(bid);
  return bid;
end $$;

-- Demo deletions are not audited (see header of audit_row).
create or replace function private.audit_row() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  -- counters change on every order/sale and are not worth auditing
  noise text[] := array['token_hash', 'updated_at', 'transactions_used', 'next_order_no', 'next_sale_no'];
  o jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - noise end;
  n jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - noise end;
  changed jsonb;
  bid uuid;
  rid text;
begin
  -- demo sandboxes are deleted automatically; that is not an auditable business event
  if tg_op = 'DELETE' and tg_table_name = 'businesses' and coalesce((o ->> 'is_demo')::boolean, false) then
    return old;
  end if;
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(k, jsonb_build_object('from', o -> k, 'to', n -> k)), '{}') into changed
    from jsonb_object_keys(n) k where (o -> k) is distinct from (n -> k);
    if changed = '{}' then return new; end if;
  end if;
  bid := coalesce((n ->> 'business_id'), (o ->> 'business_id'), case when tg_table_name = 'businesses' then coalesce(n ->> 'id', o ->> 'id') end)::uuid;
  -- rows removed by a cascading business delete: the business delete itself is the audit record
  if tg_op = 'DELETE' and tg_table_name <> 'businesses' and bid is not null
     and not exists (select 1 from public.businesses where id = bid) then
    return old;
  end if;
  rid := coalesce(n ->> 'id', o ->> 'id', n ->> 'business_id', o ->> 'business_id', n ->> 'user_id', o ->> 'user_id');
  insert into public.audit_logs (business_id, actor_id, action, entity_type, entity_id, details)
  values (case when tg_op = 'DELETE' and tg_table_name = 'businesses' then null else bid end,
          (select auth.uid()), tg_table_name || '.' || lower(tg_op), tg_table_name, rid,
          case tg_op when 'INSERT' then n when 'DELETE' then o else jsonb_build_object('changes', changed) end);
  return coalesce(new, old);
end $$;


-- Deletes demo businesses and anonymous demo users older than 48 hours. Scheduled with pg_cron where available.
create function private.cleanup_demos() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.businesses where is_demo and created_at < now() - interval '48 hours';
  get diagnostics n = row_count;
  delete from auth.users u
   where u.is_anonymous and u.created_at < now() - interval '48 hours'
     and not exists (select 1 from public.business_members m where m.user_id = u.id);
  delete from private.rate_limits where window_start < now() - interval '2 days';
  return n;
end $$;

-- ---------------------------------------------------------------------------------------------------
-- Platform administration (metadata and aggregates only)
-- ---------------------------------------------------------------------------------------------------
create function private.assert_platform_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'Platform administrators only.' using errcode = '42501'; end if;
end $$;

create function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform private.assert_platform_admin();
  select jsonb_build_object(
    'businesses', count(*) filter (where not b.is_demo),
    'active_trials', count(*) filter (where not b.is_demo and private.access_state(b.id) = 'trialing' and s.plan = 'trial'),
    'expired_trials', count(*) filter (where not b.is_demo and private.access_state(b.id) = 'expired'),
    'active_subscriptions', count(*) filter (where not b.is_demo and s.plan = 'standard' and private.access_state(b.id) = 'active'),
    'suspended', count(*) filter (where not b.is_demo and private.access_state(b.id) = 'suspended'),
    'new_7d', count(*) filter (where not b.is_demo and b.created_at > now() - interval '7 days'),
    'new_30d', count(*) filter (where not b.is_demo and b.created_at > now() - interval '30 days'),
    'upgrade_interest', count(*) filter (where not b.is_demo and s.upgrade_interest_at is not null),
    'demos_active', count(*) filter (where b.is_demo),
    'by_category', (select coalesce(jsonb_object_agg(category, n), '{}') from (
                      select category, count(*) n from public.businesses where not is_demo group by category) x))
  into r
  from public.businesses b join public.subscriptions s on s.business_id = b.id;
  return r || jsonb_build_object(
    'users', (select count(*) from public.profiles p where p.email is not null),
    'consultations_new', (select count(*) from public.consultation_requests where status = 'new'),
    'errors_24h', (select count(*) from public.app_errors where created_at > now() - interval '24 hours'),
    'errors_7d', (select count(*) from public.app_errors where created_at > now() - interval '7 days'),
    'retention_days', private.setting_int('retention_days_after_expiry', 180));
end $$;

create function public.admin_list_businesses() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb; keep integer := private.setting_int('retention_days_after_expiry', 180);
begin
  perform private.assert_platform_admin();
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]') into r from (
    select b.id, b.name, b.category, b.size, b.created_at, b.suspended_at, b.suspended_reason,
           (select p.email from public.business_members m join public.profiles p on p.id = m.user_id
             where m.business_id = b.id and m.role = 'owner' and m.is_active order by m.created_at limit 1) as owner_email,
           s.plan, s.status, s.trial_started_at, s.trial_ends_at, s.max_users, s.max_transactions, s.transactions_used,
           s.upgrade_interest_at, private.seat_usage(b.id) as users_used, private.access_state(b.id) as access_state,
           st.enabled_modules,
           (private.access_state(b.id) = 'expired' and s.trial_ends_at < now() - make_interval(days => keep)) as past_retention
    from public.businesses b join public.subscriptions s on s.business_id = b.id join public.business_settings st on st.business_id = b.id
    where not b.is_demo) x;
  return r;
end $$;

create function public.admin_extend_trial(p_business_id uuid, p_days integer, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_platform_admin();
  if p_days is null or p_days < 1 or p_days > 90 then raise exception 'Extend by 1 to 90 days.' using errcode = '22023'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Give a reason.' using errcode = '22023'; end if;
  update public.subscriptions
     set trial_ends_at = greatest(trial_ends_at, now()) + make_interval(days => p_days),
         status = case when status = 'cancelled' then 'trialing' else status end
   where business_id = p_business_id and plan = 'trial';
  if not found then raise exception 'Not a trial business.' using errcode = 'P0002'; end if;
  perform private.audit(p_business_id, 'admin.trial_extended', 'subscriptions', p_business_id::text,
    jsonb_build_object('days', p_days, 'reason', left(btrim(p_reason), 500)));
end $$;

create function public.admin_set_suspension(p_business_id uuid, p_suspend boolean, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_platform_admin();
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Give a reason.' using errcode = '22023'; end if;
  update public.businesses
     set suspended_at = case when p_suspend then now() end,
         suspended_reason = case when p_suspend then left(btrim(p_reason), 500) end
   where id = p_business_id and not is_demo;
  if not found then raise exception 'Business not found.' using errcode = 'P0002'; end if;
  perform private.audit(p_business_id, case when p_suspend then 'admin.suspended' else 'admin.unsuspended' end, 'businesses',
    p_business_id::text, jsonb_build_object('reason', left(btrim(p_reason), 500)));
end $$;

-- Plan, limits and feature (module) availability. plan = 'standard' makes the account active (no trial expiry).
create function public.admin_set_plan(p_business_id uuid, p_plan text, p_max_users integer, p_max_transactions integer,
                                      p_enabled_modules text[], p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_platform_admin();
  if p_plan not in ('trial', 'standard') then raise exception 'Unknown plan.' using errcode = '22023'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Give a reason.' using errcode = '22023'; end if;
  update public.subscriptions
     set plan = p_plan, status = (case when p_plan = 'standard' then 'active' else 'trialing' end)::public.subscription_status,
         max_users = p_max_users, max_transactions = p_max_transactions
   where business_id = p_business_id;
  if not found then raise exception 'Business not found.' using errcode = 'P0002'; end if;
  if p_enabled_modules is not null then
    update public.business_settings set enabled_modules = array(select distinct unnest(array['dashboard'] || p_enabled_modules))
     where business_id = p_business_id;
  end if;
  perform private.audit(p_business_id, 'admin.plan_changed', 'subscriptions', p_business_id::text,
    jsonb_build_object('plan', p_plan, 'max_users', p_max_users, 'max_transactions', p_max_transactions,
                       'modules', p_enabled_modules, 'reason', left(btrim(p_reason), 500)));
end $$;

create function public.admin_list_consultations() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform private.assert_platform_admin();
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]') into r from (
    select c.id, c.created_at, c.status, c.message, c.preferred_contact, b.name as business_name, b.category,
           p.full_name as requested_by, p.email as requested_by_email, b.contact_number as business_contact_number
    from public.consultation_requests c left join public.businesses b on b.id = c.business_id left join public.profiles p on p.id = c.user_id
    order by c.created_at desc limit 500) x;
  return r;
end $$;

create function public.admin_update_consultation(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare bid uuid;
begin
  perform private.assert_platform_admin();
  if p_status not in ('new', 'contacted', 'closed') then raise exception 'Unknown status.' using errcode = '22023'; end if;
  update public.consultation_requests set status = p_status where id = p_id returning business_id into bid;
  if not found then raise exception 'Request not found.' using errcode = 'P0002'; end if;
  perform private.audit(bid, 'admin.consultation_' || p_status, 'consultation_requests', p_id::text, '{}');
end $$;

-- Platform settings an admin may change (trial defaults, retention, contact text). Audited.
create function public.admin_set_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_platform_admin();
  if p_key not in ('trial_days', 'trial_max_users', 'trial_max_transactions', 'retention_days_after_expiry', 'contact') then
    raise exception 'Unknown setting.' using errcode = '22023';
  end if;
  if p_key <> 'contact' and (jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric < 1 or (p_value #>> '{}')::numeric > 3650) then
    raise exception 'Enter a number between 1 and 3650.' using errcode = '22023';
  end if;
  update public.platform_settings set value = p_value, updated_at = now(), updated_by = (select auth.uid()) where key = p_key;
  perform private.audit(null, 'admin.setting_changed', 'platform_settings', p_key, jsonb_build_object('value', p_value));
end $$;

-- Contact details shown to trial users (no other platform setting is exposed to them).
create function public.platform_contact() returns jsonb
language sql stable security definer set search_path = '' as $$
  select value from public.platform_settings where key = 'contact'
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.request_consultation(uuid, text, text), public.grant_support_access(uuid, text, integer, text),
  public.revoke_support_access(uuid), public.support_open(uuid), public.my_businesses(), public.start_demo(),
  public.admin_overview(), public.admin_list_businesses(), public.admin_extend_trial(uuid, integer, text),
  public.admin_set_suspension(uuid, boolean, text), public.admin_set_plan(uuid, text, integer, integer, text[], text),
  public.admin_list_consultations(), public.admin_update_consultation(uuid, text), public.admin_set_setting(text, jsonb),
  public.platform_contact()
to authenticated;
