-- Keep foreign-key indexes for efficient parent deletes/updates and referential checks.
create index if not exists appointments_created_by_idx on public.appointments(created_by);
create index if not exists audit_events_actor_id_idx on public.audit_events(actor_id);
create index if not exists care_invites_profile_id_idx on public.care_invites(profile_id);
create index if not exists care_profiles_owner_id_idx on public.care_profiles(owner_id);
create index if not exists medication_doses_recorded_by_idx on public.medication_doses(recorded_by);
create index if not exists medications_created_by_idx on public.medications(created_by);
create index if not exists notification_profile_idx on public.notification_deliveries(profile_id,created_at desc);
