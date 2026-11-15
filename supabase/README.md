# Supabase backend — Everkind

Project ref: `jjhnfvrcsolgnchnguyu`

## Database migrations

The migration files are ordered to match the migrations already applied to the live project:

1. `20261115065215_initial_everkind_care_schema.sql` — core tables, helper functions, triggers, RLS and base indexes.
2. `20261115065424_dose_scheduler_realtime_and_security_hardening.sql` — immutable profile ownership, safer membership and dose policies, rolling dose generator and supporting indexes.
3. `20261115065453_enable_cron_net_and_schedule_doses.sql` — pg_cron/pg_net and the daily dose-generation job.
4. `20261115065556_dose_outcome_permissions_and_secret_validation.sql` — column-limited dose outcome writes and server-only reminder-secret validation.
5. `20261115070052_revoke_anonymous_data_api_access.sql` — explicit anonymous-role revocation and least-privilege grants.
6. `20261115090047_prune_unused_indexes.sql` — removes secondary indexes initially identified as unused.
7. `20261115090112_restore_foreign_key_indexes.sql` — restores foreign-key indexes for referential performance.
8. `20261115091903_owner_can_read_own_care_profile.sql` — permits a profile owner to read their newly inserted profile during PostgREST INSERT ... RETURNING.
9. `20261115095445_profile_timezone_dose_window.sql` — computes the scheduler window from each profile's local calendar date instead of the database UTC date.
10. `20261115095630_exact_fourteen_local_days.sql` — bounds the rolling window to exactly 14 local calendar dates, including today.
11. `20261115100859_add_vital_logs_with_member_rls.sql` — adds append-only blood pressure, heart rate, temperature, weight and blood glucose observations with recorder attribution, member-scoped RLS and audit events.
12. `20261115101215_revoke_anonymous_vital_log_access.sql` — removes anonymous grants and explicitly limits authenticated clients to reading and appending vital logs.
13. `20261115101357_enable_realtime_for_vital_logs.sql` — adds vital observations to the Supabase Realtime publication.

All ten application tables have RLS enabled. Vital logs are append-only and anonymous grants are explicitly revoked. Membership writes and invitation redemption are performed by authenticated Edge Functions using the service role; ordinary browser clients cannot write membership rows directly.

## Edge Functions

- `create-invite` (JWT required): manager-only invitation creation; 128-bit random code, SHA-256 hash at rest, strict email validation, optional email binding, 48-hour expiry and a 10-per-hour per-account creation limit.
- `redeem-invite` (JWT required): validates the 128-bit code, expiry and optional email binding; atomically claims it once and restores the claim if membership creation fails.
- `revoke-member` (JWT required): manager-only membership revocation with atomic active-state checks; owner and self-removal are blocked.
- `send-reminders` (JWT disabled): validates a Vault-backed cron secret through a server-only RPC; batches preference/member/delivery reads and sends dose/appointment reminders through Resend.

## Scheduling and secrets

- `everkind-generate-future-doses` runs daily at 00:05 UTC and maintains a rolling 14-day dose window.
- `everkind_project_url`, `everkind_publishable_key` and `everkind_reminder_cron_secret` are stored in Supabase Vault.
- `public.validate_reminder_secret(text)` is executable only by `service_role`; the Edge Function validates the cron header without exposing the secret to the browser.
- Reminder delivery is intentionally inactive until `RESEND_API_KEY` and `REMINDER_FROM_EMAIL` are configured as Edge Function secrets and the sender is verified with Resend. Do not schedule the delivery job before then.

## Frontend configuration

The Vercel app uses Supabase Auth and the Data API with only the publishable key. The service-role key, Resend key and cron secret must never be exposed to browser variables.

Set these local variables in `.env.local`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (the Supabase publishable key; public by design and constrained by RLS)

## Verification

Run `tests/security_smoke.sql` against the project SQL editor or a linked test database. It checks schema presence, RLS, least-privilege grants, server-only membership writes, dose column permissions, append-only vital-log access and recorder binding, cron setup, reminder-secret validation and the local-time 14-day scheduler definition. Run `tests/profile_onboarding_live.sql` and `tests/scheduler_live.sql` for rollback-only live integration checks. They temporarily create rows inside a transaction and roll everything back; run them in a test project where possible.

The live database passes the expanded smoke test. The profile onboarding RLS test succeeded as the authenticated role and returned one visible inserted row before rollback. The live scheduler integration test returned 14 daily doses, 2 weekly doses and zero incorrectly timed doses across Asia/Kolkata and America/Los_Angeles; all temporary rows were rolled back. The remaining Supabase security-advisor notice is platform-level leaked-password protection: Supabase documents this feature as available on Pro and above, while this project is on the Free plan. No RLS, exposed-table or function-permission findings were reported. The browser signup form enforces 12+ characters with mixed case, a digit and a symbol; breached-password screening remains a Pro-tier Auth control. The performance advisor currently reports unused-index notices because the project has little production data; foreign-key indexes are retained deliberately rather than removed just to silence that informational notice.

## Frontend performance and quality checks

Workspace data requests are issued concurrently, including the medication-dose query filtered through its related medication profile. Realtime dose events are ignored unless their medication belongs to the active profile; relevant event bursts are debounced before reloading. Profile-local dates are used when generating schedules so early-morning UTC date boundaries do not shift the care day. The reminder worker fetches dose and appointment candidates concurrently, batches notification preferences and active memberships, caches unique member-email lookups, and batches delivery-row reconciliation. The database dose generator uses each profile's IANA timezone and an inclusive 14-local-day window.

Run `npm run check` from the repository root for formatting, lint, unit tests, production build, axe-core accessibility checks and dependency audit. The browser suite uses mocked Supabase responses. See [../docs/QUALITY_ASSURANCE.md](../docs/QUALITY_ASSURANCE.md).

## Safety boundary

Everkind organizes care; it is not medical advice, an emergency service or a certified clinical system. Users must enter medication names, doses and schedules exactly as directed by a licensed clinician. Do not enter real patient information until privacy, legal, operational and security reviews are complete.
