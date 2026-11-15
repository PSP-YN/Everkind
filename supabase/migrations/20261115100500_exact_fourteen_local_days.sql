-- The rolling schedule is exactly 14 local calendar dates, including today.
-- Keep this correction separate from the already-applied timezone migration.
create or replace function private.generate_future_doses()
returns integer language plpgsql security definer set search_path=''
as $$
declare
  med record;
  local_today date;
  day_value date;
  dose_time text;
  inserted_count integer := 0;
  inserted_rows integer;
begin
  for med in
    select m.id,m.starts_on,m.ends_on,m.schedule,m.active,p.timezone
    from public.medications m
    join public.care_profiles p on p.id=m.profile_id
    where m.active=true
  loop
    local_today := (now() at time zone coalesce(med.timezone,'Asia/Kolkata'))::date;
    if med.ends_on is not null and med.ends_on < local_today then
      continue;
    end if;

    for day_value in
      select generate_series(
        greatest(med.starts_on,local_today),
        least(coalesce(med.ends_on,local_today+13),local_today+13),
        interval '1 day'
      )::date
    loop
      if coalesce(med.schedule->>'frequency','Daily')='Weekly'
        and mod(day_value-med.starts_on,7)<>0 then
        continue;
      end if;

      for dose_time in
        select jsonb_array_elements_text(coalesce(med.schedule->'times','[]'::jsonb))
      loop
        insert into public.medication_doses(medication_id,due_at,status)
        values(
          med.id,
          ((day_value::text||' '||dose_time)::timestamp at time zone coalesce(med.timezone,'Asia/Kolkata')),
          'pending'
        )
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
