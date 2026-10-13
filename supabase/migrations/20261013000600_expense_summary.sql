-- Expense totals by category for a date range (active expenses only). Runs as the caller, so RLS applies.
create function public.expense_summary(p_business_id uuid, p_from date, p_to date)
returns table (category_id uuid, category_name text, total_centavos bigint, expense_count integer)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.name, coalesce(sum(e.amount_centavos), 0)::bigint, count(e.id)::integer
  from public.expense_categories c
  join public.expenses e on e.category_id = c.id and e.business_id = c.business_id
  where c.business_id = p_business_id and e.status = 'active' and e.expense_date between p_from and p_to
  group by c.id, c.name
  order by 3 desc
$$;
revoke execute on function public.expense_summary(uuid, date, date) from public, anon;
grant execute on function public.expense_summary(uuid, date, date) to authenticated;
