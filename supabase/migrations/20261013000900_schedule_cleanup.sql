-- Hourly demo cleanup. pg_cron exists on Supabase; on plain Postgres (local tests) this is skipped.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('cleanup-demos', '17 * * * *', 'select private.cleanup_demos()');
  else
    raise notice 'pg_cron not available; demo cleanup not scheduled';
  end if;
end $$;
