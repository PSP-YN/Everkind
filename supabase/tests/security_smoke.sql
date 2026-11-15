-- Everkind database/security smoke test. Run against a disposable/test project or SQL editor.
do $$
declare
  required_tables text[] := array[
    'care_profiles','care_members','care_invites','medications','medication_doses',
    'appointments','notification_preferences','notification_deliveries','audit_events'
  ];
  t text;
  count_tables integer;
begin
  select count(*) into count_tables
  from information_schema.tables
  where table_schema='public' and table_name=any(required_tables);
  if count_tables <> cardinality(required_tables) then
    raise exception 'Expected % public tables; found %', cardinality(required_tables), count_tables;
  end if;

  foreach t in array required_tables loop
    if not coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=t),false) then
      raise exception 'RLS is not enabled on public.%', t;
    end if;
    if not exists(select 1 from pg_policies where schemaname='public' and tablename=t) then
      raise exception 'No RLS policy exists on public.%', t;
    end if;
  end loop;

  if has_table_privilege('authenticated','public.care_members','INSERT')
     or has_table_privilege('authenticated','public.care_members','UPDATE') then
    raise exception 'Authenticated users must not write care_members directly';
  end if;
  if has_table_privilege('anon','public.medications','SELECT') then
    raise exception 'Anonymous users must not read medication data';
  end if;
  if has_column_privilege('authenticated','public.medication_doses','medication_id','UPDATE')
     or has_column_privilege('authenticated','public.medication_doses','due_at','UPDATE') then
    raise exception 'Clients must not alter dose identity or scheduled time';
  end if;
  if not has_column_privilege('authenticated','public.medication_doses','status','UPDATE') then
    raise exception 'Authorized members must be able to record dose outcomes';
  end if;
  if has_function_privilege('anon','public.validate_reminder_secret(text)','EXECUTE')
     or has_function_privilege('authenticated','public.validate_reminder_secret(text)','EXECUTE') then
    raise exception 'Reminder secret validator must not be callable by client roles';
  end if;
  if not has_function_privilege('service_role','public.validate_reminder_secret(text)','EXECUTE') then
    raise exception 'Service role must be able to validate scheduled reminder requests';
  end if;
  if not exists(select 1 from cron.job where jobname='everkind-generate-future-doses' and active) then
    raise exception 'Daily dose generation cron job is not active';
  end if;
  if public.validate_reminder_secret('invalid-test-value') then
    raise exception 'Reminder secret validator accepted an invalid secret';
  end if;
  raise notice 'Everkind smoke tests passed';
end $$;
