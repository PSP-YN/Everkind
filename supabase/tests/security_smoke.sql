-- Everkind database/security smoke test. Run against a disposable/test project or SQL editor.
do $$
declare
  required_tables text[] := array[
    'care_profiles','care_members','care_invites','medications','medication_doses',
    'appointments','notification_preferences','notification_deliveries','audit_events'
  ];
  t text;
  count_tables integer;
  dose_update_check text;
  profile_read_policy text;
  scheduler_definition text;
begin
  select count(*) into count_tables
  from information_schema.tables
  where table_schema='public' and table_name=any(required_tables);
  if count_tables <> cardinality(required_tables) then
    raise exception 'Expected % public tables; found %', cardinality(required_tables), count_tables;
  end if;

  foreach t in array required_tables loop
    if not coalesce((
      select c.relrowsecurity
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=t
    ),false) then
      raise exception 'RLS is not enabled on public.%', t;
    end if;
    if not exists(select 1 from pg_policies where schemaname='public' and tablename=t) then
      raise exception 'No RLS policy exists on public.%', t;
    end if;
    if has_table_privilege('anon',format('public.%I',t),'SELECT') then
      raise exception 'Anonymous role can read public.%', t;
    end if;
  end loop;

  select qual into profile_read_policy
  from pg_policies
  where schemaname='public' and tablename='care_profiles'
    and policyname='owners and members read care profiles';
  if profile_read_policy is null
     or position('owner_id' in profile_read_policy)=0
     or position('auth.uid' in profile_read_policy)=0
     or position('is_care_member' in profile_read_policy)=0 then
    raise exception 'Care profile SELECT policy must allow owners and active care-circle members';
  end if;

  if has_schema_privilege('anon','private','USAGE') then
    raise exception 'Anonymous role must not use the private schema';
  end if;
  if has_function_privilege('anon','private.is_care_member(uuid)','EXECUTE')
     or has_function_privilege('anon','private.can_manage_care(uuid)','EXECUTE') then
    raise exception 'Anonymous role must not execute membership helper functions';
  end if;
  if not has_function_privilege('authenticated','private.is_care_member(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','private.can_manage_care(uuid)','EXECUTE') then
    raise exception 'Authenticated role needs the private membership helpers used by RLS';
  end if;

  if has_table_privilege('authenticated','public.care_members','INSERT')
     or has_table_privilege('authenticated','public.care_members','UPDATE')
     or has_table_privilege('authenticated','public.care_members','DELETE') then
    raise exception 'Authenticated users must not write care_members directly';
  end if;
  if has_table_privilege('anon','public.care_invites','SELECT')
     or has_table_privilege('authenticated','public.care_invites','SELECT')
     or has_table_privilege('authenticated','public.care_invites','INSERT') then
    raise exception 'Invitation records must only be accessed by trusted server functions';
  end if;
  if has_table_privilege('authenticated','public.notification_deliveries','INSERT')
     or has_table_privilege('authenticated','public.audit_events','INSERT') then
    raise exception 'Clients must not forge notification or audit records';
  end if;

  if has_column_privilege('authenticated','public.medication_doses','medication_id','UPDATE')
     or has_column_privilege('authenticated','public.medication_doses','due_at','UPDATE')
     or has_column_privilege('authenticated','public.medication_doses','created_at','UPDATE') then
    raise exception 'Clients must not alter dose identity, due time or creation time';
  end if;
  if not has_column_privilege('authenticated','public.medication_doses','status','UPDATE') then
    raise exception 'Authorized members must be able to record dose outcomes';
  end if;
  select with_check into dose_update_check
  from pg_policies
  where schemaname='public' and tablename='medication_doses'
    and cmd='UPDATE' and policyname='members record dose outcomes';
  if dose_update_check is null
     or position('recorded_by' in dose_update_check)=0
     or position('auth.uid' in dose_update_check)=0 then
    raise exception 'Dose outcome updates must bind recorded_by to the authenticated user';
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

  select pg_get_functiondef('private.generate_future_doses()'::regprocedure)
  into scheduler_definition;
  if position('now() at time zone' in lower(scheduler_definition))=0
     or position('local_today+13' in lower(scheduler_definition))=0
     or position('current_date' in lower(scheduler_definition))>0 then
    raise exception 'Dose generator must create exactly 14 dates from each profile local day';
  end if;
  if public.validate_reminder_secret('invalid-test-value') then
    raise exception 'Reminder secret validator accepted an invalid secret';
  end if;
  raise notice 'Everkind security smoke tests passed';
end $$;
