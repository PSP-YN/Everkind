create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create type public.care_role as enum ('owner','care_recipient','caregiver','family');
create type public.dose_status as enum ('pending','taken','skipped','missed');

create table public.care_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  display_name text not null check (length(trim(display_name)) between 1 and 100),
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.care_members (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.care_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.care_role not null,
  status text not null default 'active' check (status in ('active','revoked')),
  created_at timestamptz not null default now(),
  unique(profile_id,user_id)
);
create table public.care_invites (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.care_profiles(id) on delete cascade,
  code_hash text not null unique,
  invited_email text,
  role public.care_role not null check (role in ('caregiver','family','care_recipient')),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.medications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.care_profiles(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  dose text not null check (length(trim(dose)) between 1 and 80),
  instructions text,
  schedule jsonb not null default '{}'::jsonb,
  starts_on date not null default current_date,
  ends_on date,
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create table public.medication_doses (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications(id) on delete cascade,
  due_at timestamptz not null,
  status public.dose_status not null default 'pending',
  taken_at timestamptz,
  recorded_by uuid references auth.users(id),
  note text,
  created_at timestamptz not null default now(),
  unique(medication_id,due_at)
);
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.care_profiles(id) on delete cascade,
  clinician_name text not null,
  specialty text,
  starts_at timestamptz not null,
  location text,
  notes text,
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.notification_preferences (
  profile_id uuid primary key references public.care_profiles(id) on delete cascade,
  email_enabled boolean not null default true,
  dose_lead_minutes integer not null default 15 check (dose_lead_minutes between 0 and 1440),
  appointment_lead_hours integer not null default 24 check (appointment_lead_hours between 1 and 720),
  missed_dose_delay_minutes integer not null default 30 check (missed_dose_delay_minutes between 5 and 1440),
  updated_at timestamptz not null default now()
);
create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.care_profiles(id) on delete cascade,
  event_key text not null unique,
  recipient_email text not null,
  notification_type text not null,
  status text not null default 'queued' check (status in ('queued','sent','failed')),
  provider_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.audit_events (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.care_profiles(id) on delete cascade,
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  created_at timestamptz not null default now()
);

create or replace function private.is_care_member(p_profile uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select auth.uid() is not null and exists (
  select 1 from public.care_members m
  where m.profile_id=p_profile and m.user_id=(select auth.uid()) and m.status='active'
); $$;
create or replace function private.can_manage_care(p_profile uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select auth.uid() is not null and exists (
  select 1 from public.care_members m
  where m.profile_id=p_profile and m.user_id=(select auth.uid())
  and m.status='active' and m.role in ('owner','care_recipient','caregiver')
); $$;
revoke all on function private.is_care_member(uuid) from public, anon;
revoke all on function private.can_manage_care(uuid) from public, anon;
grant execute on function private.is_care_member(uuid), private.can_manage_care(uuid) to authenticated;

create or replace function private.add_profile_owner()
returns trigger language plpgsql security definer set search_path=''
as $$ begin
  insert into public.care_members(profile_id,user_id,role) values(new.id,new.owner_id,'owner');
  insert into public.notification_preferences(profile_id) values(new.id);
  return new;
end; $$;
create trigger care_profile_owner after insert on public.care_profiles
for each row execute function private.add_profile_owner();

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path=''
as $$ begin new.updated_at=now(); return new; end; $$;
create trigger care_profiles_updated before update on public.care_profiles for each row execute function private.set_updated_at();
create trigger medications_updated before update on public.medications for each row execute function private.set_updated_at();
create trigger appointments_updated before update on public.appointments for each row execute function private.set_updated_at();

alter table public.care_profiles enable row level security;
alter table public.care_members enable row level security;
alter table public.care_invites enable row level security;
alter table public.medications enable row level security;
alter table public.medication_doses enable row level security;
alter table public.appointments enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.audit_events enable row level security;

create policy "members read care profiles" on public.care_profiles for select to authenticated using(private.is_care_member(id));
create policy "users create own profile" on public.care_profiles for insert to authenticated with check(owner_id=(select auth.uid()));
create policy "managers update care profile" on public.care_profiles for update to authenticated using(private.can_manage_care(id)) with check(private.can_manage_care(id));

create policy "members read membership" on public.care_members for select to authenticated using(private.is_care_member(profile_id) or user_id=(select auth.uid()));
create policy "managers add members" on public.care_members for insert to authenticated with check(private.can_manage_care(profile_id));
create policy "managers update membership" on public.care_members for update to authenticated using(private.can_manage_care(profile_id)) with check(private.can_manage_care(profile_id));

create policy "members read medications" on public.medications for select to authenticated using(private.is_care_member(profile_id));
create policy "managers create medications" on public.medications for insert to authenticated with check(private.can_manage_care(profile_id) and created_by=(select auth.uid()));
create policy "managers update medications" on public.medications for update to authenticated using(private.can_manage_care(profile_id)) with check(private.can_manage_care(profile_id));
create policy "managers delete medications" on public.medications for delete to authenticated using(private.can_manage_care(profile_id));

create policy "members read doses" on public.medication_doses for select to authenticated using(exists(select 1 from public.medications x where x.id=medication_id and private.is_care_member(x.profile_id)));
create policy "members record doses" on public.medication_doses for insert to authenticated with check(recorded_by=(select auth.uid()) and exists(select 1 from public.medications x where x.id=medication_id and private.is_care_member(x.profile_id)));
create policy "members update own dose records" on public.medication_doses for update to authenticated using(recorded_by=(select auth.uid()) or exists(select 1 from public.medications x where x.id=medication_id and private.can_manage_care(x.profile_id))) with check(recorded_by=(select auth.uid()) or exists(select 1 from public.medications x where x.id=medication_id and private.can_manage_care(x.profile_id)));

create policy "members read appointments" on public.appointments for select to authenticated using(private.is_care_member(profile_id));
create policy "managers create appointments" on public.appointments for insert to authenticated with check(private.can_manage_care(profile_id) and created_by=(select auth.uid()));
create policy "managers update appointments" on public.appointments for update to authenticated using(private.can_manage_care(profile_id)) with check(private.can_manage_care(profile_id));
create policy "managers delete appointments" on public.appointments for delete to authenticated using(private.can_manage_care(profile_id));

create policy "members read notification preferences" on public.notification_preferences for select to authenticated using(private.is_care_member(profile_id));
create policy "managers update notification preferences" on public.notification_preferences for update to authenticated using(private.can_manage_care(profile_id)) with check(private.can_manage_care(profile_id));
create policy "members read notification deliveries" on public.notification_deliveries for select to authenticated using(private.is_care_member(profile_id));
create policy "members read audit trail" on public.audit_events for select to authenticated using(private.is_care_member(profile_id));

grant select,insert,update on public.care_profiles,public.care_members,public.medications,public.medication_doses,public.appointments,public.notification_preferences to authenticated;
grant delete on public.medications,public.appointments to authenticated;
grant select on public.notification_deliveries,public.audit_events to authenticated;
revoke all on public.care_invites from anon,authenticated;
revoke all on public.notification_deliveries from anon,authenticated;
revoke insert,update,delete on public.audit_events from anon,authenticated;

create index care_members_user_idx on public.care_members(user_id,profile_id) where status='active';
create index medications_profile_idx on public.medications(profile_id,active);
create index doses_due_idx on public.medication_doses(due_at,status);
create index appointments_starts_idx on public.appointments(starts_at,status);
create index notification_profile_idx on public.notification_deliveries(profile_id,created_at desc);

create or replace function private.write_audit_event()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_profile uuid; v_id uuid; v_action text;
begin
  if tg_op='DELETE' then v_id=old.id; else v_id=new.id; end if;
  if tg_table_name='medication_doses' then
    select profile_id into v_profile from public.medications where id=case when tg_op='DELETE' then old.medication_id else new.medication_id end;
  else
    if tg_op='DELETE' then v_profile=old.profile_id; else v_profile=new.profile_id; end if;
  end if;
  v_action=lower(tg_op)||'_'||tg_table_name;
  insert into public.audit_events(profile_id,actor_id,action,entity_type,entity_id)
  values(v_profile,auth.uid(),v_action,tg_table_name,v_id);
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;
revoke all on function private.write_audit_event() from public,anon,authenticated;
create trigger audit_medications after insert or update or delete on public.medications for each row execute function private.write_audit_event();
create trigger audit_doses after insert or update or delete on public.medication_doses for each row execute function private.write_audit_event();
create trigger audit_appointments after insert or update or delete on public.appointments for each row execute function private.write_audit_event();
create trigger audit_members after insert or update or delete on public.care_members for each row execute function private.write_audit_event();
