-- =====================================================================================================
-- Phase 3: reports, audited CSV export, settings validation, numbering safety.
-- =====================================================================================================

-- Settings may only reference modules / KPIs the app knows.
alter table public.business_settings
  add constraint business_settings_modules_known check (enabled_modules <@ array['dashboard', 'sales', 'orders', 'customers', 'expenses', 'employees', 'reports']),
  add constraint business_settings_kpis_known check (dashboard_kpis <@ array['total_sales', 'collected', 'receivables', 'expenses', 'net_cash', 'open_orders', 'completed_orders', 'active_customers']);

-- If an owner changes the prefix back to an old one, skip numbers that already exist instead of failing.
create or replace function private.next_number(bid uuid, kind text) returns text
language plpgsql security definer set search_path = '' as $$
declare n bigint; prefix text; candidate text;
begin
  loop
    if kind = 'order' then
      update public.business_settings set next_order_no = next_order_no + 1 where business_id = bid
      returning next_order_no - 1, order_prefix into n, prefix;
      candidate := prefix || '-' || lpad(n::text, 6, '0');
      exit when not exists (select 1 from public.orders where business_id = bid and order_number = candidate);
    else
      update public.business_settings set next_sale_no = next_sale_no + 1 where business_id = bid
      returning next_sale_no - 1, sale_prefix into n, prefix;
      candidate := prefix || '-' || lpad(n::text, 6, '0');
      exit when not exists (select 1 from public.sales where business_id = bid and sale_number = candidate);
    end if;
  end loop;
  return candidate;
end $$;

-- ---------------------------------------------------------------------------------------------------
-- Reports. Every report needs reports.view plus the permission for the data it shows.
-- Returns {"rows": [...], "truncated": bool}; at most 5000 rows.
-- ---------------------------------------------------------------------------------------------------
create function public.report_data(p_business_id uuid, p_report text, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  tz text := private.business_tz(p_business_id);
  lim constant integer := 5000;
  need text;
  rows jsonb;
begin
  need := case p_report
    when 'sales_summary' then 'sales.view' when 'collections' then 'sales.view' when 'receivables' then 'sales.view'
    when 'customer_history' then 'sales.view' when 'expenses' then 'expenses.view'
    when 'orders_by_status' then 'orders.view' when 'employee_assignments' then 'orders.view' end;
  if need is null then raise exception 'Unknown report.' using errcode = '22023'; end if;
  if not ((private.has_perm(p_business_id, 'reports.view') and private.has_perm(p_business_id, need))
          or private.has_support_access(p_business_id)) then
    raise exception 'You do not have permission to view this report.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Choose a date range of up to one year.' using errcode = '22023';
  end if;

  if p_report = 'sales_summary' then
    select coalesce(jsonb_agg(r order by r.date), '[]') into rows from (
      select sale_date as date, count(*) as sales, sum(subtotal_centavos) as gross_centavos, sum(discount_centavos) as discount_centavos,
             sum(total_centavos) as total_centavos, sum(paid_centavos) as paid_centavos, sum(total_centavos - paid_centavos) as balance_centavos
      from public.sales where business_id = p_business_id and status = 'active' and sale_date between p_from and p_to
      group by sale_date limit lim + 1) r;

  elsif p_report = 'collections' then
    select coalesce(jsonb_agg(r order by r.paid_at), '[]') into rows from (
      select p.paid_at, (p.paid_at at time zone tz)::date as date, p.kind, p.method, p.amount_centavos, p.reference_no,
             s.sale_number, c.name as customer
      from public.payments p join public.sales s on s.id = p.sale_id left join public.customers c on c.id = s.customer_id
      where p.business_id = p_business_id and p.status = 'active' and (p.paid_at at time zone tz)::date between p_from and p_to
      order by p.paid_at limit lim + 1) r;

  elsif p_report = 'receivables' then
    select coalesce(jsonb_agg(r order by r.sale_date), '[]') into rows from (
      select s.sale_number, s.sale_date, c.name as customer, c.contact_number, s.total_centavos, s.paid_centavos,
             s.total_centavos - s.paid_centavos as balance_centavos, (p_to - s.sale_date) as age_days
      from public.sales s left join public.customers c on c.id = s.customer_id
      where s.business_id = p_business_id and s.status = 'active' and s.total_centavos > s.paid_centavos and s.sale_date <= p_to
      order by s.sale_date limit lim + 1) r;

  elsif p_report = 'customer_history' then
    select coalesce(jsonb_agg(r order by r.total_centavos desc), '[]') into rows from (
      select c.name as customer, c.contact_number, count(s.id) as sales, sum(s.total_centavos) as total_centavos,
             sum(s.paid_centavos) as paid_centavos, sum(s.total_centavos - s.paid_centavos) as balance_centavos, max(s.sale_date) as last_sale
      from public.sales s join public.customers c on c.id = s.customer_id
      where s.business_id = p_business_id and s.status = 'active' and s.sale_date between p_from and p_to
      group by c.id, c.name, c.contact_number limit lim + 1) r;

  elsif p_report = 'expenses' then
    select coalesce(jsonb_agg(r order by r.date), '[]') into rows from (
      select e.expense_date as date, ec.name as category, e.vendor, e.description, e.payment_method as method, e.amount_centavos
      from public.expenses e join public.expense_categories ec on ec.id = e.category_id
      where e.business_id = p_business_id and e.status = 'active' and e.expense_date between p_from and p_to
      order by e.expense_date limit lim + 1) r;

  elsif p_report = 'orders_by_status' then
    select coalesce(jsonb_agg(r order by r.order_date), '[]') into rows from (
      select o.order_number, o.order_date, o.status, o.priority, c.name as customer, e.full_name as assigned_to, o.due_date, o.total_centavos
      from public.orders o left join public.customers c on c.id = o.customer_id left join public.employees e on e.id = o.assigned_employee_id
      where o.business_id = p_business_id and o.order_date between p_from and p_to
      order by o.order_date limit lim + 1) r;

  elsif p_report = 'employee_assignments' then
    select coalesce(jsonb_agg(r order by r.assigned desc), '[]') into rows from (
      select coalesce(e.full_name, 'Unassigned') as employee, count(*) as assigned,
             count(*) filter (where o.status not in ('completed', 'cancelled')) as open,
             count(*) filter (where o.status = 'completed') as completed,
             count(*) filter (where o.status = 'cancelled') as cancelled,
             count(*) filter (where o.status not in ('completed', 'cancelled') and o.due_date < private.business_today(p_business_id)) as overdue
      from public.orders o left join public.employees e on e.id = o.assigned_employee_id
      where o.business_id = p_business_id and o.order_date between p_from and p_to
      group by e.id, e.full_name limit lim + 1) r;
  end if;

  return jsonb_build_object('rows', case when jsonb_array_length(rows) > lim then rows - lim else rows end,
                            'truncated', jsonb_array_length(rows) > lim);
end $$;

-- Recorded before the browser builds the CSV; refused without reports.export.
create function public.log_export(p_business_id uuid, p_report text, p_from date, p_to date, p_row_count integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_perm(p_business_id, 'reports.export');
  perform private.check_rate_limit('export:' || (select auth.uid()), 60, interval '1 hour');
  perform private.audit(p_business_id, 'report.exported', 'report', left(p_report, 60),
    jsonb_build_object('from', p_from, 'to', p_to, 'rows', p_row_count));
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.report_data(uuid, text, date, date), public.log_export(uuid, text, date, date, integer) to authenticated;
