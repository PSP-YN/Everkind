-- A newly created care profile must be readable by its owner immediately.
-- The insert trigger also creates the owner membership, but INSERT ... RETURNING
-- evaluates SELECT visibility as part of the same request. Allowing the owner
-- to read their own row avoids a first-run RLS dead end while preserving
-- member-only access for everyone else.
drop policy if exists "members read care profiles" on public.care_profiles;

create policy "owners and members read care profiles"
on public.care_profiles
for select
to authenticated
using (
  owner_id = (select auth.uid())
  or private.is_care_member(id)
);
