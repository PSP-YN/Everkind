create table public.vital_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.care_profiles(id) on delete cascade,
  recorded_by uuid not null references auth.users(id),
  metric text not null check (metric in ('blood_pressure','heart_rate','temperature','weight','blood_glucose')),
  value numeric(10,2) not null check (value > 0 and value < 100000),
  secondary_value numeric(10,2) check (secondary_value is null or (secondary_value > 0 and secondary_value < 100000)),
  unit text not null check (length(trim(unit)) between 1 and 20),
  notes text check (notes is null or length(notes) <= 500),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint blood_pressure_requires_diastolic check (metric <> 'blood_pressure' or secondary_value is not null),
  constraint non_bp_has_no_secondary check (metric = 'blood_pressure' or secondary_value is null)
);
create index vital_logs_profile_recorded_idx on public.vital_logs(profile_id, recorded_at desc);
alter table public.vital_logs enable row level security;
create policy "members read vital logs" on public.vital_logs for select to authenticated using (private.is_care_member(profile_id));
create policy "members record vital logs" on public.vital_logs for insert to authenticated with check (
  recorded_by = (select auth.uid()) and private.is_care_member(profile_id)
);
grant select, insert on public.vital_logs to authenticated;
revoke update, delete, truncate, references, trigger on public.vital_logs from anon, authenticated;
create trigger audit_vital_logs after insert on public.vital_logs for each row execute function private.write_audit_event();
