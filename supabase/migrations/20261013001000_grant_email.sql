-- Owners can't read platform admin profiles (by design), so keep the support person's email on the grant itself.
alter table public.support_access_grants add column admin_email text check (char_length(admin_email) <= 254);

create or replace function public.grant_support_access(p_business_id uuid, p_admin_email text, p_hours integer, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare aid uuid; em text := lower(btrim(p_admin_email)); gid uuid;
begin
  perform private.assert_perm(p_business_id, 'settings.manage');
  if p_hours is null or p_hours < 1 or p_hours > 168 then raise exception 'Access can last 1 to 168 hours (7 days).' using errcode = '22023'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Give a reason.' using errcode = '22023'; end if;
  select a.user_id into aid from public.platform_admins a join public.profiles p on p.id = a.user_id where p.email = em;
  if aid is null then raise exception 'That email is not a platform support account.' using errcode = 'P0002'; end if;
  insert into public.support_access_grants (business_id, admin_user_id, admin_email, granted_by, reason, expires_at)
  values (p_business_id, aid, em, (select auth.uid()), left(btrim(p_reason), 500), now() + make_interval(hours => p_hours))
  returning id into gid;
  return gid;
end $$;
