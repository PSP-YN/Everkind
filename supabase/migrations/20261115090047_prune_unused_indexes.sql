-- Remove secondary indexes that no application query or policy currently uses.
-- Keep profile/time and membership indexes that support the active query paths.
drop index if exists public.appointments_created_by_idx;
drop index if exists public.audit_events_actor_id_idx;
drop index if exists public.care_invites_profile_id_idx;
drop index if exists public.care_profiles_owner_id_idx;
drop index if exists public.medication_doses_recorded_by_idx;
drop index if exists public.medications_created_by_idx;
drop index if exists public.notification_profile_idx;
