-- =====================================================================================================
-- Row Level Security and privileges.
-- Model: deny by default. Reads are scoped to businesses where the caller holds the needed permission.
-- Simple writes (customers, employees, catalogue, expenses, categories) are allowed through RLS with
-- explicit column grants; everything multi-step or financial goes through SECURITY DEFINER RPCs.
-- =====================================================================================================

-- Business ids where the caller holds `perm` (evaluated once per statement through an InitPlan).
create function private.businesses_with(perm text) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.business_id from public.business_members m
  where m.user_id = (select auth.uid()) and m.is_active
    and perm = any (private.role_permissions(m.role) || m.extra_permissions)
$$;

-- Same, plus businesses whose owner granted the caller (a platform admin) temporary read-only support access.
create function private.readable_businesses(perm text) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select private.businesses_with(perm)
  union
  select g.business_id from public.support_access_grants g
  join public.platform_admins a on a.user_id = g.admin_user_id
  where g.admin_user_id = (select auth.uid()) and g.revoked_at is null and g.expires_at > now()
$$;

create function private.my_businesses() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.business_id from public.business_members m where m.user_id = (select auth.uid()) and m.is_active
$$;

-- Only the helpers that RLS policies evaluate as the calling user are executable by API roles.
grant execute on function private.businesses_with(text), private.readable_businesses(text), private.my_businesses(),
  private.is_platform_admin(), private.role_permissions(public.member_role), private.all_permissions()
  to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- Start from zero privileges for API roles, then grant precisely.
-- ---------------------------------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- profiles: your own row, plus names of people you share a business with
grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or private.is_platform_admin()
  or exists (select 1 from public.business_members m
             where m.user_id = profiles.id and m.business_id in (select private.my_businesses()))
);
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- platform tables
grant select on public.platform_admins to authenticated;
create policy platform_admins_select on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()) or private.is_platform_admin());
grant select on public.platform_settings to authenticated;
create policy platform_settings_select on public.platform_settings for select to authenticated using (private.is_platform_admin());

-- businesses
grant select on public.businesses to authenticated;
grant update (name, category, address, contact_email, contact_number, size, employee_count, timezone) on public.businesses to authenticated;
create policy businesses_select on public.businesses for select to authenticated
  using (id in (select private.my_businesses()) or id in (select private.readable_businesses('customers.view')) or private.is_platform_admin());
create policy businesses_update on public.businesses for update to authenticated
  using (id in (select private.businesses_with('settings.manage')))
  with check (id in (select private.businesses_with('settings.manage')));

-- membership, settings, subscription: visible to members; changed only through RPCs (settings partly direct)
grant select on public.business_members, public.business_settings, public.subscriptions to authenticated;
create policy business_members_select on public.business_members for select to authenticated
  using (business_id in (select private.my_businesses()));
create policy business_settings_select on public.business_settings for select to authenticated
  using (business_id in (select private.my_businesses()) or business_id in (select private.readable_businesses('customers.view')));
grant update (enabled_modules, dashboard_kpis, order_prefix, sale_prefix, max_discount_pct) on public.business_settings to authenticated;
create policy business_settings_update on public.business_settings for update to authenticated
  using (business_id in (select private.businesses_with('settings.manage')))
  with check (business_id in (select private.businesses_with('settings.manage')));
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (business_id in (select private.my_businesses()) or private.is_platform_admin());

grant select on public.business_invitations to authenticated;
create policy business_invitations_select on public.business_invitations for select to authenticated
  using (business_id in (select private.businesses_with('team.manage')));

-- audit log: owners see their business; platform admins see platform-level and admin/support events only
grant select on public.audit_logs to authenticated;
create policy audit_logs_select on public.audit_logs for select to authenticated using (
  business_id in (select private.businesses_with('settings.manage'))
  or (private.is_platform_admin() and (business_id is null or action like 'admin.%' or action like 'support.%'))
);

grant select on public.support_access_grants to authenticated;
create policy support_access_grants_select on public.support_access_grants for select to authenticated
  using (business_id in (select private.businesses_with('settings.manage')) or admin_user_id = (select auth.uid()));

grant select on public.consultation_requests to authenticated;
create policy consultation_requests_select on public.consultation_requests for select to authenticated
  using (business_id in (select private.businesses_with('settings.manage')) or private.is_platform_admin());

grant select on public.app_errors to authenticated;
create policy app_errors_select on public.app_errors for select to authenticated using (private.is_platform_admin());

-- ---------------------------------------------------------------------------------------------------
-- Operational tables
-- ---------------------------------------------------------------------------------------------------
-- customers: read with customers.view, write with customers.manage; no deletes (mark inactive)
grant select on public.customers to authenticated;
grant insert (id, business_id, name, contact_number, email, address, notes, status) on public.customers to authenticated;
grant update (name, contact_number, email, address, notes, status) on public.customers to authenticated;
create policy customers_select on public.customers for select to authenticated
  using (business_id in (select private.readable_businesses('customers.view')));
create policy customers_insert on public.customers for insert to authenticated
  with check (business_id in (select private.businesses_with('customers.manage')));
create policy customers_update on public.customers for update to authenticated
  using (business_id in (select private.businesses_with('customers.manage')))
  with check (business_id in (select private.businesses_with('customers.manage')));

-- employees: directory visible to all members (needed to assign work); managed with team.manage
grant select on public.employees to authenticated;
grant insert (id, business_id, full_name, email, phone, job_title, department, employment_status, hired_on, notes) on public.employees to authenticated;
grant update (full_name, email, phone, job_title, department, employment_status, hired_on, notes) on public.employees to authenticated;
create policy employees_select on public.employees for select to authenticated
  using (business_id in (select private.my_businesses()) or business_id in (select private.readable_businesses('customers.view')));
create policy employees_insert on public.employees for insert to authenticated
  with check (business_id in (select private.businesses_with('team.manage')));
create policy employees_update on public.employees for update to authenticated
  using (business_id in (select private.businesses_with('team.manage')))
  with check (business_id in (select private.businesses_with('team.manage')));

-- catalogue: visible to members, managed with sales.manage
grant select on public.catalog_items to authenticated;
grant insert (id, business_id, kind, name, sku, unit_price_centavos, is_active) on public.catalog_items to authenticated;
grant update (kind, name, sku, unit_price_centavos, is_active) on public.catalog_items to authenticated;
create policy catalog_items_select on public.catalog_items for select to authenticated
  using (business_id in (select private.my_businesses()) or business_id in (select private.readable_businesses('customers.view')));
create policy catalog_items_insert on public.catalog_items for insert to authenticated
  with check (business_id in (select private.businesses_with('sales.manage')));
create policy catalog_items_update on public.catalog_items for update to authenticated
  using (business_id in (select private.businesses_with('sales.manage')))
  with check (business_id in (select private.businesses_with('sales.manage')));

-- orders: read-only through the API; written by save_order / change_order_status / add_order_note
grant select on public.orders, public.order_items, public.order_activity to authenticated;
create policy orders_select on public.orders for select to authenticated
  using (business_id in (select private.readable_businesses('orders.view')));
create policy order_items_select on public.order_items for select to authenticated
  using (business_id in (select private.readable_businesses('orders.view')));
create policy order_activity_select on public.order_activity for select to authenticated
  using (business_id in (select private.readable_businesses('orders.view')));

-- sales & payments: read-only through the API; written by create_sale / record_payment / void_* RPCs
grant select on public.sales, public.sale_items, public.payments to authenticated;
create policy sales_select on public.sales for select to authenticated
  using (business_id in (select private.readable_businesses('sales.view')));
create policy sale_items_select on public.sale_items for select to authenticated
  using (business_id in (select private.readable_businesses('sales.view')));
create policy payments_select on public.payments for select to authenticated
  using (business_id in (select private.readable_businesses('sales.view')));

-- expense categories: visible to members; managed with expenses.manage
grant select on public.expense_categories to authenticated;
grant insert (id, business_id, name, is_active, sort_order) on public.expense_categories to authenticated;
grant update (name, is_active, sort_order) on public.expense_categories to authenticated;
create policy expense_categories_select on public.expense_categories for select to authenticated
  using (business_id in (select private.my_businesses()) or business_id in (select private.readable_businesses('expenses.view')));
create policy expense_categories_insert on public.expense_categories for insert to authenticated
  with check (business_id in (select private.businesses_with('expenses.manage')));
create policy expense_categories_update on public.expense_categories for update to authenticated
  using (business_id in (select private.businesses_with('expenses.manage')))
  with check (business_id in (select private.businesses_with('expenses.manage')));

-- expenses: read with expenses.view; insert/edit with expenses.manage; voiding via void_expense()
grant select on public.expenses to authenticated;
grant insert (id, business_id, expense_date, category_id, amount_centavos, description, payment_method, vendor, receipt_path) on public.expenses to authenticated;
grant update (expense_date, category_id, amount_centavos, description, payment_method, vendor, receipt_path) on public.expenses to authenticated;
create policy expenses_select on public.expenses for select to authenticated
  using (business_id in (select private.readable_businesses('expenses.view')));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (business_id in (select private.businesses_with('expenses.manage')));
create policy expenses_update on public.expenses for update to authenticated
  using (business_id in (select private.businesses_with('expenses.manage')))
  with check (business_id in (select private.businesses_with('expenses.manage')));
