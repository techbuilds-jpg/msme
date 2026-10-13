-- =====================================================================================================
-- Foundation: profiles, platform admins, businesses (tenants), membership, settings, trial subscription,
-- invitations, audit log, rate limiting and the permission helpers every RLS policy relies on.
-- Conventions: money = bigint centavos; every tenant row carries business_id; helpers live in `private`
-- (not exposed through the API) and are SECURITY DEFINER with an empty search_path.
-- =====================================================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- New functions are not executable by anon/public unless granted explicitly.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema private revoke execute on functions from public;

-- ---------------------------------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'manager', 'employee');
create type public.business_category as enum ('service', 'retail', 'agency', 'general');
create type public.business_size as enum ('micro', 'small', 'medium');
create type public.subscription_status as enum ('trialing', 'active', 'suspended', 'cancelled');

-- ---------------------------------------------------------------------------------------------------
-- Generic triggers
-- ---------------------------------------------------------------------------------------------------
create function private.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- A row can never be moved to another business.
create function private.lock_business_id() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.business_id is distinct from old.business_id then
    raise exception 'business_id cannot be changed' using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text not null default '' check (char_length(full_name) <= 120),
  phone text check (char_length(phone) <= 30),
  trial_used_at timestamptz,               -- set when the user starts their one trial business
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles for each row execute function private.touch_updated_at();

create function private.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

create function private.handle_user_email_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = lower(new.email) where id = new.id;
  return new;
end $$;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email) execute function private.handle_user_email_change();

-- ---------------------------------------------------------------------------------------------------
-- Platform administration
-- ---------------------------------------------------------------------------------------------------
create table public.platform_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

create table public.platform_settings (
  key text primary key check (key ~ '^[a-z_]{2,60}$'),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
insert into public.platform_settings (key, value) values
  ('trial_days', '14'),
  ('trial_max_users', '3'),
  ('trial_max_transactions', '100'),
  ('retention_days_after_expiry', '180'),
  ('contact', '{"email": null, "message": "Contact us to continue with an implementation or subscription."}');

-- ---------------------------------------------------------------------------------------------------
-- Businesses (tenants)
-- ---------------------------------------------------------------------------------------------------
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  category public.business_category not null default 'general',
  address text check (char_length(address) <= 300),
  contact_email text not null check (char_length(contact_email) <= 254 and contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  contact_number text check (char_length(contact_number) <= 30),
  size public.business_size not null default 'micro',
  employee_count integer not null default 1 check (employee_count between 0 and 100000),
  currency char(3) not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Asia/Manila' check (char_length(timezone) <= 64),
  is_demo boolean not null default false,
  suspended_at timestamptz,
  suspended_reason text check (char_length(suspended_reason) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index businesses_created_at_idx on public.businesses (created_at);
create trigger businesses_touch before update on public.businesses for each row execute function private.touch_updated_at();

-- Every permission key the application knows. Role defaults are in private.role_permissions().
create function private.all_permissions() returns text[] language sql immutable set search_path = '' as $$
  select array[
    'customers.view', 'customers.manage',
    'orders.view', 'orders.manage',
    'sales.view', 'sales.manage', 'sales.discount', 'payments.manage',
    'expenses.view', 'expenses.manage',
    'reports.view', 'reports.export',
    'team.manage', 'settings.manage'
  ]::text[]
$$;

create table public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null,
  extra_permissions text[] not null default '{}' check (extra_permissions <@ private.all_permissions()),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id),
  unique (business_id, id)
);
create index business_members_user_idx on public.business_members (user_id) where is_active;
create trigger business_members_touch before update on public.business_members for each row execute function private.touch_updated_at();
create trigger business_members_lock before update on public.business_members for each row execute function private.lock_business_id();

create table public.business_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  enabled_modules text[] not null default array['dashboard', 'sales', 'orders', 'customers', 'expenses', 'employees', 'reports'],
  dashboard_kpis text[] not null default array['total_sales', 'collected', 'receivables', 'expenses', 'net_cash', 'open_orders', 'completed_orders', 'active_customers'],
  order_prefix text not null default 'ORD' check (order_prefix ~ '^[A-Z0-9]{1,8}$'),
  sale_prefix text not null default 'SAL' check (sale_prefix ~ '^[A-Z0-9]{1,8}$'),
  next_order_no bigint not null default 1 check (next_order_no > 0),
  next_sale_no bigint not null default 1 check (next_sale_no > 0),
  max_discount_pct numeric(5, 2) not null default 100 check (max_discount_pct between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger business_settings_touch before update on public.business_settings for each row execute function private.touch_updated_at();

create table public.subscriptions (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  plan text not null default 'trial' check (plan in ('trial', 'standard', 'demo')),
  status public.subscription_status not null default 'trialing',
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default now() + interval '14 days',
  max_users integer check (max_users > 0),               -- null = unlimited
  max_transactions integer check (max_transactions > 0), -- null = unlimited (orders + sales)
  transactions_used integer not null default 0 check (transactions_used >= 0),
  upgrade_interest_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (trial_ends_at >= trial_started_at)
);
create index subscriptions_trial_ends_idx on public.subscriptions (trial_ends_at);
create trigger subscriptions_touch before update on public.subscriptions for each row execute function private.touch_updated_at();

create table public.business_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.member_role not null check (role <> 'owner'),
  token_hash text not null unique,                       -- sha256 of the token; the token itself is never stored
  invited_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index business_invitations_pending_uq on public.business_invitations (business_id, email)
  where accepted_at is null and revoked_at is null;
create index business_invitations_business_idx on public.business_invitations (business_id);

-- ---------------------------------------------------------------------------------------------------
-- Audit log, support access, consultation requests, client error reports, rate limits
-- ---------------------------------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  business_id uuid references public.businesses (id) on delete cascade,  -- null = platform-level event
  actor_id uuid,                                                         -- kept even if the user is deleted
  action text not null check (char_length(action) <= 80),
  entity_type text check (char_length(entity_type) <= 60),
  entity_id text check (char_length(entity_id) <= 80),
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_business_idx on public.audit_logs (business_id, created_at desc);
create index audit_logs_platform_idx on public.audit_logs (created_at desc) where business_id is null;

create table public.support_access_grants (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  admin_user_id uuid not null references public.platform_admins (user_id) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  reason text not null check (char_length(reason) between 3 and 500),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at and expires_at <= created_at + interval '7 days')
);
create index support_access_grants_lookup_idx on public.support_access_grants (admin_user_id, business_id);

create table public.consultation_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  message text check (char_length(message) <= 2000),
  preferred_contact text check (char_length(preferred_contact) <= 200),
  status text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index consultation_requests_created_idx on public.consultation_requests (created_at desc);
create trigger consultation_requests_touch before update on public.consultation_requests for each row execute function private.touch_updated_at();

create table public.app_errors (
  id bigint generated always as identity primary key,
  user_id uuid,
  business_id uuid,
  message text not null check (char_length(message) <= 1000),
  context jsonb not null default '{}',
  url text check (char_length(url) <= 500),
  created_at timestamptz not null default now()
);
create index app_errors_created_idx on public.app_errors (created_at desc);

create table private.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

-- ---------------------------------------------------------------------------------------------------
-- Permission helpers (used by RLS and RPCs)
-- ---------------------------------------------------------------------------------------------------
create function private.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()))
$$;

create function private.role_permissions(r public.member_role) returns text[]
language sql immutable set search_path = '' as $$
  select case r
    when 'owner' then private.all_permissions()
    when 'manager' then array[
      'customers.view', 'customers.manage', 'orders.view', 'orders.manage',
      'sales.view', 'sales.manage', 'sales.discount', 'payments.manage',
      'expenses.view', 'expenses.manage', 'reports.view', 'reports.export', 'team.manage']::text[]
    else array['customers.view', 'customers.manage', 'orders.view', 'orders.manage']::text[]
  end
$$;

-- Active membership of the current user in a business that is not a suspended tenant.
create function private.member_role(bid uuid) returns public.member_role
language sql stable security definer set search_path = '' as $$
  select m.role from public.business_members m
  where m.business_id = bid and m.user_id = (select auth.uid()) and m.is_active
$$;

create function private.is_member(bid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = bid and m.user_id = (select auth.uid()) and m.is_active)
$$;

create function private.permissions(bid uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select array(select distinct unnest(private.role_permissions(m.role) || m.extra_permissions))
    from public.business_members m
    where m.business_id = bid and m.user_id = (select auth.uid()) and m.is_active), '{}')
$$;

create function private.has_perm(bid uuid, perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select perm = any (private.permissions(bid))
$$;

-- Read-only support access an owner granted to a platform admin.
create function private.has_support_access(bid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.support_access_grants g
    join public.platform_admins a on a.user_id = g.admin_user_id
    where g.business_id = bid and g.admin_user_id = (select auth.uid())
      and g.revoked_at is null and g.expires_at > now())
$$;

create function private.can_read(bid uuid, perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_perm(bid, perm) or private.has_support_access(bid)
$$;

create function private.assert_perm(bid uuid, perm text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_perm(bid, perm) then
    raise exception 'You do not have permission to do this (%).', perm using errcode = '42501';
  end if;
end $$;

-- 'trialing' | 'active' | 'expired' | 'suspended'. Expiry is computed, so no scheduled job is needed.
create function private.access_state(bid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when b.suspended_at is not null or s.status = 'suspended' then 'suspended'
    when s.status = 'cancelled' then 'expired'
    when s.status = 'active' then 'active'
    when s.trial_ends_at > now() then 'trialing'
    else 'expired'
  end
  from public.businesses b join public.subscriptions s on s.business_id = b.id
  where b.id = bid
$$;

-- Raised for any write to operational data of an expired or suspended business.
create function private.assert_writable(bid uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare st text := private.access_state(bid);
begin
  if st = 'expired' then
    raise exception 'Your trial has ended. Existing records are read-only; contact us to continue.' using errcode = 'TR001';
  elsif st = 'suspended' then
    raise exception 'This business account is suspended.' using errcode = 'TR004';
  elsif st is null then
    raise exception 'Unknown business.' using errcode = '42501';
  end if;
end $$;

-- Fixed-window rate limiter. Raises RL001 when the limit is exceeded.
create function private.check_rate_limit(bucket text, max_hits integer, win interval) returns void
language plpgsql security definer set search_path = '' as $$
declare
  ws timestamptz := to_timestamp(floor(extract(epoch from now()) / extract(epoch from win)) * extract(epoch from win));
  n integer;
begin
  insert into private.rate_limits as r (key, window_start, hits) values (bucket, ws, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into n;
  if n > max_hits then
    raise exception 'Too many requests. Please wait a moment and try again.' using errcode = 'RL001';
  end if;
  -- opportunistic cleanup of old windows
  if random() < 0.01 then delete from private.rate_limits where window_start < now() - interval '2 days'; end if;
end $$;

create function private.audit(bid uuid, act text, etype text, eid text, det jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs (business_id, actor_id, action, entity_type, entity_id, details)
  values (bid, (select auth.uid()), act, etype, eid, coalesce(det, '{}'))
$$;

-- Row-change audit trigger for sensitive tables. Records changed columns only; secrets are stripped.
create function private.audit_row() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  -- counters change on every order/sale and are not worth auditing
  noise text[] := array['token_hash', 'updated_at', 'transactions_used', 'next_order_no', 'next_sale_no'];
  o jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - noise end;
  n jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - noise end;
  changed jsonb;
  bid uuid;
  rid text;
begin
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

create trigger audit_businesses after update or delete on public.businesses for each row execute function private.audit_row();
create trigger audit_business_members after insert or update or delete on public.business_members for each row execute function private.audit_row();
create trigger audit_business_settings after update on public.business_settings for each row execute function private.audit_row();
create trigger audit_subscriptions after update on public.subscriptions for each row execute function private.audit_row();
create trigger audit_business_invitations after insert or update on public.business_invitations for each row execute function private.audit_row();
create trigger audit_support_access_grants after insert or update on public.support_access_grants for each row execute function private.audit_row();
create trigger audit_platform_admins after insert or delete on public.platform_admins for each row execute function private.audit_row();
