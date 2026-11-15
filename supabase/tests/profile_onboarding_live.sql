-- Run in the Supabase SQL editor against a test project.
-- Uses the most recently created Auth user only for a transient test row.
-- The transaction is rolled back; no care profile or membership is retained.
begin;

select set_config(
  'request.jwt.claim.sub',
  (select id::text from auth.users order by created_at desc limit 1),
  true
);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

insert into public.care_profiles(owner_id,display_name,timezone)
values(auth.uid(),'Everkind RLS onboarding verification','Asia/Kolkata')
returning id,owner_id;

-- Must return 1: the authenticated owner can read the row returned by INSERT.
select count(*) as owner_can_read_inserted_profile
from public.care_profiles
where display_name='Everkind RLS onboarding verification'
  and owner_id=auth.uid();

rollback;
