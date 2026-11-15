-- Clients may record outcomes but cannot rewrite dose identity or due time.
revoke all on public.medication_doses from anon,authenticated;
grant select,insert on public.medication_doses to authenticated;
grant update(status,taken_at,recorded_by,note) on public.medication_doses to authenticated;

create or replace function public.validate_reminder_secret(p_secret text)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from vault.decrypted_secrets
    where name='everkind_reminder_cron_secret' and decrypted_secret=p_secret
  );
$$;
revoke all on function public.validate_reminder_secret(text) from public,anon,authenticated;
grant execute on function public.validate_reminder_secret(text) to service_role;
