-- Schedule idempotent rolling dose generation; no user data is sent externally.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname='everkind-generate-future-doses';
select cron.schedule('everkind-generate-future-doses','5 0 * * *','select private.generate_future_doses();');
