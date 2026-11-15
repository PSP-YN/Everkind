-- Harden care-circle membership, dose recording and automated scheduling.
create index if not exists care_profiles_owner_id_idx on public.care_profiles(owner_id);
create index if not exists care_members_user_idx on public.care_members(user_id,profile_id) where status='active';
create index if not exists care_invites_profile_id_idx on public.care_invites(profile_id);
create index if not exists care_invites_created_by_idx on public.care_invites(created_by);
create index if not exists medications_created_by_idx on public.medications(created_by);
create index if not exists medication_doses_recorded_by_idx on public.medication_doses(recorded_by);
create index if not exists appointments_profile_id_idx on public.appointments(profile_id);
create index if not exists appointments_created_by_idx on public.appointments(created_by);
create index if not exists audit_events_actor_id_idx on public.audit_events(actor_id);
create index if not exists audit_events_profile_created_idx on public.audit_events(profile_id,created_at desc);

create or replace function private.guard_profile_owner()
returns trigger language plpgsql set search_path=''
as $$ begin
  if new.owner_id <> old.owner_id then
    raise exception 'Care profile ownership cannot be changed';
  end if;
  return new;
end; $$;
drop trigger if exists care_profile_owner_immutable on public.care_profiles;
create trigger care_profile_owner_immutable before update of owner_id on public.care_profiles
for each row execute function private.guard_profile_owner();

drop policy if exists "managers add members" on public.care_members;
drop policy if exists "managers update membership" on public.care_members;
drop policy if exists "no direct invite access" on public.care_invites;
create policy "no direct invite access" on public.care_invites for all to anon,authenticated using(false) with check(false);

drop policy if exists "members record doses" on public.medication_doses;
drop policy if exists "members update own dose records" on public.medication_doses;
create policy "members record dose outcomes" on public.medication_doses
for insert to authenticated with check (
  recorded_by=(select auth.uid()) and exists (
    select 1 from public.medications m
    where m.id=medication_id and private.is_care_member(m.profile_id)
  )
);
create policy "care managers schedule pending doses" on public.medication_doses
for insert to authenticated with check (
  status='pending' and recorded_by is null and exists (
    select 1 from public.medications m
    where m.id=medication_id and private.can_manage_care(m.profile_id)
  )
);
drop policy if exists "members read notification deliveries" on public.notification_deliveries;
drop policy if exists "members read audit trail" on public.audit_events;
create policy "members read notification deliveries" on public.notification_deliveries
for select to authenticated using(private.is_care_member(profile_id));
create policy "members read audit trail" on public.audit_events
for select to authenticated using(private.is_care_member(profile_id));

create or replace function private.generate_future_doses()
returns integer language plpgsql security definer set search_path=''
as $$
declare
  med record;
  day_value date;
  dose_time text;
  inserted_count integer := 0;
  inserted_rows integer;
begin
  for med in
    select m.id,m.starts_on,m.ends_on,m.schedule,m.active,p.timezone
    from public.medications m
    join public.care_profiles p on p.id=m.profile_id
    where m.active=true and (m.ends_on is null or m.ends_on>=current_date)
  loop
    for day_value in
      select generate_series(
        greatest(med.starts_on,current_date),
        least(coalesce(med.ends_on,current_date+14),current_date+14),
        interval '1 day'
      )::date
    loop
      if coalesce(med.schedule->>'frequency','Daily')='Weekly'
        and mod(day_value-med.starts_on,7)<>0 then continue; end if;
      for dose_time in
        select jsonb_array_elements_text(coalesce(med.schedule->'times','[]'::jsonb))
      loop
        insert into public.medication_doses(medication_id,due_at,status)
        values(med.id,((day_value::text||' '||dose_time)::timestamp at time zone coalesce(med.timezone,'Asia/Kolkata')),'pending')
        on conflict(medication_id,due_at) do nothing;
        get diagnostics inserted_rows = row_count;
        inserted_count := inserted_count + inserted_rows;
      end loop;
    end loop;
  end loop;
  return inserted_count;
end;
$$;
revoke all on function private.generate_future_doses() from public,anon,authenticated;
