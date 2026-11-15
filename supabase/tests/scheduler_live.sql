-- Run in the Supabase SQL editor against a test project.
-- Creates temporary test records, exercises the real scheduler and rolls back.
-- The scheduler also fills missing windows for other active medicines in this
-- transaction; all of those changes are rolled back at the end.
begin;

create temporary table everkind_scheduler_test_results (daily_doses integer, weekly_doses integer, wrong_local_times integer) on commit drop;

do $$
declare
  v_owner uuid;
  v_profile uuid;
  v_med uuid;
  v_weekly_profile uuid;
  v_weekly_med uuid;
  v_daily_count integer;
  v_weekly_count integer;
  v_bad_times integer;
begin
  select id into v_owner from auth.users order by created_at desc limit 1;
  if v_owner is null then
    raise exception 'Create a test Auth user before running this test';
  end if;

  insert into public.care_profiles(owner_id,display_name,timezone)
  values(v_owner,'Everkind scheduler QA rollback','Asia/Kolkata')
  returning id into v_profile;
  insert into public.medications(profile_id,name,dose,schedule,starts_on,created_by)
  values(v_profile,'QA daily medicine','1 tablet',
    jsonb_build_object('frequency','Daily','times',jsonb_build_array('09:00')),
    (now() at time zone 'Asia/Kolkata')::date,v_owner)
  returning id into v_med;

  insert into public.care_profiles(owner_id,display_name,timezone)
  values(v_owner,'Everkind weekly QA rollback','America/Los_Angeles')
  returning id into v_weekly_profile;
  insert into public.medications(profile_id,name,dose,schedule,starts_on,created_by)
  values(v_weekly_profile,'QA weekly medicine','1 tablet',
    jsonb_build_object('frequency','Weekly','times',jsonb_build_array('09:00')),
    (now() at time zone 'America/Los_Angeles')::date,v_owner)
  returning id into v_weekly_med;

  perform private.generate_future_doses();

  select count(*) into v_daily_count
  from public.medication_doses where medication_id=v_med;
  select count(*) into v_weekly_count
  from public.medication_doses where medication_id=v_weekly_med;
  select count(*) into v_bad_times
  from public.medication_doses d
  join public.medications m on m.id=d.medication_id
  join public.care_profiles p on p.id=m.profile_id
  where d.medication_id in (v_med,v_weekly_med)
    and to_char(d.due_at at time zone p.timezone,'HH24:MI') <> '09:00';

  if v_daily_count <> 14 then
    raise exception 'Expected exactly 14 daily doses, found %',v_daily_count;
  end if;
  if v_weekly_count <> 2 then
    raise exception 'Expected 2 weekly doses in 14 local days, found %',v_weekly_count;
  end if;
  if v_bad_times <> 0 then
    raise exception 'Found % doses outside the configured profile-local time',v_bad_times;
  end if;

  insert into pg_temp.everkind_scheduler_test_results values(v_daily_count,v_weekly_count,v_bad_times);
end $$;

select * from pg_temp.everkind_scheduler_test_results;

rollback;
