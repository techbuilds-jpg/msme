-- =====================================================================================================
-- Tenancy RPCs: business creation (onboarding), business context, invitations, membership management,
-- client error reporting. Each function checks the caller's permissions itself.
-- =====================================================================================================

-- Category templates: recommended modules and the order of dashboard KPIs.
create function private.category_template(cat public.business_category) returns jsonb
language sql immutable set search_path = '' as $$
  select case cat
    when 'service' then jsonb_build_object(
      'modules', array['dashboard', 'orders', 'customers', 'sales', 'expenses', 'employees', 'reports'],
      'kpis', array['open_orders', 'completed_orders', 'collected', 'receivables', 'total_sales', 'expenses', 'net_cash', 'active_customers'])
    when 'retail' then jsonb_build_object(
      'modules', array['dashboard', 'sales', 'customers', 'expenses', 'employees', 'reports', 'orders'],
      'kpis', array['total_sales', 'collected', 'net_cash', 'expenses', 'receivables', 'active_customers', 'open_orders', 'completed_orders'])
    when 'agency' then jsonb_build_object(
      'modules', array['dashboard', 'orders', 'customers', 'sales', 'expenses', 'employees', 'reports'],
      'kpis', array['receivables', 'collected', 'total_sales', 'open_orders', 'completed_orders', 'expenses', 'net_cash', 'active_customers'])
    else jsonb_build_object(
      'modules', array['dashboard', 'sales', 'orders', 'customers', 'expenses', 'employees', 'reports'],
      'kpis', array['total_sales', 'collected', 'receivables', 'expenses', 'net_cash', 'open_orders', 'completed_orders', 'active_customers'])
  end
$$;

create function private.default_expense_categories() returns text[]
language sql immutable set search_path = '' as $$
  select array['Rent', 'Utilities', 'Salaries', 'Supplies', 'Transportation', 'Marketing', 'Software', 'Maintenance', 'Other']
$$;

-- Active members + pending (unexpired) invitations: what counts against max_users.
create function private.seat_usage(bid uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.business_members where business_id = bid and is_active)::integer
       + (select count(*) from public.business_invitations
          where business_id = bid and accepted_at is null and revoked_at is null and expires_at > now())::integer
$$;

create function private.assert_seat_available(bid uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare lim integer;
begin
  select max_users into lim from public.subscriptions where business_id = bid;
  if lim is not null and private.seat_usage(bid) >= lim then
    raise exception 'User limit reached: this plan allows % active users (including pending invitations).', lim using errcode = 'TR003';
  end if;
end $$;

create function private.setting_int(k text, fallback integer) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::integer from public.platform_settings where key = k), fallback)
$$;

-- Internal: creates a tenant with owner membership, settings, subscription, categories and owner employee row.
create function private.create_business_internal(
  owner_id uuid, p_name text, p_category public.business_category, p_address text, p_contact_email text,
  p_contact_number text, p_size public.business_size, p_employee_count integer, p_currency text, p_timezone text,
  p_is_demo boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  bid uuid;
  mid uuid;
  tpl jsonb := private.category_template(p_category);
  prof public.profiles;
  i integer := 0;
  c text;
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'Unknown timezone: %', p_timezone using errcode = '22023';
  end if;
  select * into prof from public.profiles where id = owner_id;

  insert into public.businesses (name, category, address, contact_email, contact_number, size, employee_count, currency, timezone, is_demo, created_by)
  values (btrim(p_name), p_category, nullif(btrim(p_address), ''), lower(btrim(p_contact_email)), nullif(btrim(p_contact_number), ''),
          p_size, p_employee_count, upper(p_currency), p_timezone, p_is_demo, owner_id)
  returning id into bid;

  insert into public.business_members (business_id, user_id, role) values (bid, owner_id, 'owner') returning id into mid;

  insert into public.business_settings (business_id, enabled_modules, dashboard_kpis)
  values (bid, array(select jsonb_array_elements_text(tpl -> 'modules')), array(select jsonb_array_elements_text(tpl -> 'kpis')));

  if p_is_demo then
    insert into public.subscriptions (business_id, plan, status, trial_ends_at, max_users, max_transactions)
    values (bid, 'demo', 'trialing', now() + interval '2 days', 1, null);
  else
    insert into public.subscriptions (business_id, plan, status, trial_ends_at, max_users, max_transactions)
    values (bid, 'trial', 'trialing',
            now() + make_interval(days => private.setting_int('trial_days', 14)),
            private.setting_int('trial_max_users', 3), private.setting_int('trial_max_transactions', 100));
  end if;

  foreach c in array private.default_expense_categories() loop
    i := i + 1;
    insert into public.expense_categories (business_id, name, sort_order) values (bid, c, i);
  end loop;

  insert into public.employees (business_id, member_id, full_name, email, job_title)
  values (bid, mid, coalesce(nullif(prof.full_name, ''), split_part(coalesce(prof.email, 'Owner'), '@', 1)), prof.email, 'Owner');

  perform private.audit(bid, 'business.created', 'businesses', bid::text,
    jsonb_build_object('name', p_name, 'category', p_category, 'demo', p_is_demo));
  return bid;
end $$;

-- Onboarding: a verified user creates their (one) trial business.
create function public.create_business(
  p_name text,
  p_category public.business_category,
  p_contact_email text,
  p_size public.business_size default 'micro',
  p_employee_count integer default 1,
  p_address text default null,
  p_contact_number text default null,
  p_currency text default 'PHP',
  p_timezone text default 'Asia/Manila'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  bid uuid;
  used timestamptz;
begin
  if uid is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not exists (select 1 from auth.users where id = uid and email_confirmed_at is not null and email is not null) then
    raise exception 'Verify your email address before creating a business.' using errcode = '42501';
  end if;
  perform private.check_rate_limit('create_business:' || uid, 5, interval '1 hour');

  select trial_used_at into used from public.profiles where id = uid for update;
  if used is not null and not private.is_platform_admin() then
    raise exception 'Each account can start one free trial business. Contact us to add another business.' using errcode = 'TR005';
  end if;

  bid := private.create_business_internal(uid, p_name, p_category, p_address, p_contact_email, p_contact_number,
                                          p_size, p_employee_count, coalesce(p_currency, 'PHP'), coalesce(p_timezone, 'Asia/Manila'), false);
  update public.profiles set trial_used_at = now() where id = uid;
  return bid;
end $$;

-- Businesses the caller belongs to, for the business switcher.
create function public.my_businesses()
returns table (business_id uuid, name text, category public.business_category, role public.member_role,
               is_demo boolean, access_state text, trial_ends_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.id, b.name, b.category, m.role, b.is_demo, private.access_state(b.id), s.trial_ends_at
  from public.business_members m
  join public.businesses b on b.id = m.business_id
  join public.subscriptions s on s.business_id = b.id
  where m.user_id = (select auth.uid()) and m.is_active
  order by b.is_demo, b.name
$$;

-- Everything the app shell needs about the selected business in one round trip.
create function public.business_context(p_business_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r jsonb;
begin
  if not private.is_member(p_business_id) and not private.has_support_access(p_business_id) then
    raise exception 'You do not have access to this business.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'business', to_jsonb(b) - 'suspended_reason',
    'role', private.member_role(p_business_id),
    'permissions', case when private.is_member(p_business_id) then to_jsonb(private.permissions(p_business_id))
                        else to_jsonb(array['customers.view', 'orders.view', 'sales.view', 'expenses.view', 'reports.view']) end,
    'support_access', not private.is_member(p_business_id),
    'settings', to_jsonb(st) - 'next_order_no' - 'next_sale_no',
    'subscription', jsonb_build_object(
      'plan', s.plan,
      'status', s.status,
      'access_state', private.access_state(p_business_id),
      'trial_started_at', s.trial_started_at,
      'trial_ends_at', s.trial_ends_at,
      'days_left', greatest(0, ceil(extract(epoch from (s.trial_ends_at - now())) / 86400))::integer,
      'max_users', s.max_users,
      'users_used', private.seat_usage(p_business_id),
      'max_transactions', s.max_transactions,
      'transactions_used', s.transactions_used,
      'upgrade_interest_at', s.upgrade_interest_at))
  into r
  from public.businesses b
  join public.business_settings st on st.business_id = b.id
  join public.subscriptions s on s.business_id = b.id
  where b.id = p_business_id;
  return r;
end $$;

-- ---------------------------------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------------------------------
create function public.create_invitation(p_business_id uuid, p_email text, p_role public.member_role default 'employee')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  em text := lower(btrim(p_email));
  token text;
  inv public.business_invitations;
  replaced boolean := false;
begin
  perform private.assert_perm(p_business_id, 'team.manage');
  perform private.assert_writable(p_business_id);
  perform private.check_rate_limit('invite:' || uid, 20, interval '1 hour');
  if p_role = 'owner' then
    raise exception 'Owners cannot be invited directly. Invite as manager, then promote.' using errcode = '42501';
  end if;
  if private.member_role(p_business_id) <> 'owner' and p_role <> 'employee' then
    raise exception 'Managers can only invite employees.' using errcode = '42501';
  end if;
  if exists (select 1 from public.business_members m join public.profiles p on p.id = m.user_id
             where m.business_id = p_business_id and m.is_active and p.email = em) then
    raise exception 'This person is already an active member of the business.' using errcode = '23505';
  end if;

  -- Re-inviting the same email replaces the pending invitation (no extra seat used).
  update public.business_invitations set revoked_at = now()
   where business_id = p_business_id and email = em and accepted_at is null and revoked_at is null
  returning true into replaced;
  if not coalesce(replaced, false) then
    perform private.assert_seat_available(p_business_id);
  end if;

  token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.business_invitations (business_id, email, role, token_hash, invited_by)
  values (p_business_id, em, p_role, encode(sha256(convert_to(token, 'UTF8')), 'hex'), uid)
  returning * into inv;

  return jsonb_build_object('id', inv.id, 'token', token, 'email', inv.email, 'role', inv.role, 'expires_at', inv.expires_at);
end $$;

create function public.revoke_invitation(p_invitation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare bid uuid;
begin
  select business_id into bid from public.business_invitations where id = p_invitation_id;
  if bid is null then raise exception 'Invitation not found.' using errcode = 'P0002'; end if;
  perform private.assert_perm(bid, 'team.manage');
  update public.business_invitations set revoked_at = now()
   where id = p_invitation_id and accepted_at is null and revoked_at is null;
end $$;

-- Lets a signed-in user see what they are accepting before they accept.
create function public.preview_invitation(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  inv public.business_invitations;
  bname text;
begin
  if (select auth.uid()) is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  perform private.check_rate_limit('invite_preview:' || (select auth.uid()), 30, interval '10 minutes');
  select * into inv from public.business_invitations where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  if inv.id is null then raise exception 'This invitation link is not valid.' using errcode = 'P0002'; end if;
  select name into bname from public.businesses where id = inv.business_id;
  return jsonb_build_object(
    'business_name', bname, 'email', inv.email, 'role', inv.role, 'expires_at', inv.expires_at,
    'status', case when inv.accepted_at is not null then 'accepted' when inv.revoked_at is not null then 'revoked'
                   when inv.expires_at <= now() then 'expired' else 'pending' end);
end $$;

create function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  inv public.business_invitations;
  u_email text;
  mid uuid;
  prof public.profiles;
begin
  if uid is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  perform private.check_rate_limit('invite_accept:' || uid, 20, interval '10 minutes');
  select lower(email) into u_email from auth.users where id = uid and email_confirmed_at is not null;
  if u_email is null then raise exception 'Verify your email address first.' using errcode = '42501'; end if;

  select * into inv from public.business_invitations
   where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') for update;
  if inv.id is null or inv.revoked_at is not null then raise exception 'This invitation link is not valid.' using errcode = 'P0002'; end if;
  if inv.accepted_at is not null then raise exception 'This invitation has already been used.' using errcode = 'P0002'; end if;
  if inv.expires_at <= now() then raise exception 'This invitation has expired. Ask for a new one.' using errcode = 'P0002'; end if;
  if inv.email <> u_email then
    raise exception 'This invitation was sent to a different email address. Sign in with that address.' using errcode = '42501';
  end if;
  if private.access_state(inv.business_id) = 'suspended' then
    raise exception 'This business account is suspended.' using errcode = 'TR004';
  end if;

  insert into public.business_members (business_id, user_id, role) values (inv.business_id, uid, inv.role)
  on conflict (business_id, user_id) do update set role = excluded.role, is_active = true, extra_permissions = '{}'
  returning id into mid;

  update public.business_invitations set accepted_at = now(), accepted_by = uid where id = inv.id;

  -- Link an existing directory entry with the same email, or create one.
  if not exists (select 1 from public.employees where business_id = inv.business_id and member_id = mid) then
    update public.employees set member_id = mid
     where id = (select id from public.employees where business_id = inv.business_id and member_id is null and lower(email) = u_email limit 1);
    if not found then
      select * into prof from public.profiles where id = uid;
      insert into public.employees (business_id, member_id, full_name, email)
      values (inv.business_id, mid, coalesce(nullif(prof.full_name, ''), split_part(u_email, '@', 1)), u_email);
    end if;
  end if;
  return inv.business_id;
end $$;

-- ---------------------------------------------------------------------------------------------------
-- Membership management
-- ---------------------------------------------------------------------------------------------------
create function public.update_member(
  p_member_id uuid,
  p_role public.member_role default null,
  p_extra_permissions text[] default null,
  p_is_active boolean default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  m public.business_members;
  caller public.member_role;
  new_role public.member_role;
  new_active boolean;
begin
  select * into m from public.business_members where id = p_member_id for update;
  if m.id is null then raise exception 'Member not found.' using errcode = 'P0002'; end if;
  perform private.assert_perm(m.business_id, 'team.manage');
  caller := private.member_role(m.business_id);
  new_role := coalesce(p_role, m.role);
  new_active := coalesce(p_is_active, m.is_active);

  if m.user_id = uid and (new_role <> m.role or not new_active) then
    raise exception 'You cannot change your own role or deactivate yourself.' using errcode = '42501';
  end if;
  if caller <> 'owner' then
    if m.role <> 'employee' or new_role <> 'employee' then
      raise exception 'Managers can only manage employees.' using errcode = '42501';
    end if;
    if p_extra_permissions is not null then
      raise exception 'Only owners can change permissions.' using errcode = '42501';
    end if;
  end if;
  if new_active and not m.is_active then
    perform private.assert_seat_available(m.business_id);
  end if;
  if m.role = 'owner' and m.is_active and (new_role <> 'owner' or not new_active)
     and not exists (select 1 from public.business_members where business_id = m.business_id and role = 'owner'
                     and is_active and id <> m.id) then
    raise exception 'A business must keep at least one active owner.' using errcode = '42501';
  end if;

  update public.business_members
     set role = new_role,
         is_active = new_active,
         extra_permissions = case when new_role = 'owner' then '{}' else coalesce(p_extra_permissions, extra_permissions) end
   where id = m.id;
end $$;

-- ---------------------------------------------------------------------------------------------------
-- Client error reporting (shown to platform admins as an application health indicator)
-- ---------------------------------------------------------------------------------------------------
create function public.report_client_error(p_message text, p_url text default null, p_context jsonb default '{}', p_business_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_rate_limit('client_error:' || coalesce((select auth.uid())::text, 'anon'), 30, interval '10 minutes');
  insert into public.app_errors (user_id, business_id, message, url, context)
  values ((select auth.uid()),
          case when p_business_id is not null and private.is_member(p_business_id) then p_business_id end,
          left(coalesce(p_message, 'unknown'), 1000), left(p_url, 500),
          case when jsonb_typeof(p_context) = 'object' and pg_column_size(p_context) < 8000 then p_context else '{}' end);
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.create_business(text, public.business_category, text, public.business_size, integer, text, text, text, text),
  public.my_businesses(), public.business_context(uuid),
  public.create_invitation(uuid, text, public.member_role), public.revoke_invitation(uuid),
  public.preview_invitation(text), public.accept_invitation(text),
  public.update_member(uuid, public.member_role, text[], boolean),
  public.report_client_error(text, text, jsonb, uuid)
to authenticated;
