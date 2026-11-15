# Supabase backend setup

The React application is currently a browser-local demo. The SQL migration and Edge Functions in this folder are a backend implementation foundation; they are not active until a Supabase project is provisioned, configured, deployed and tested.

## Migration
Apply migrations/202611150001_initial_care_schema.sql to a new, dedicated project. It creates care profiles, memberships, hashed invitations, medications, dose logs, appointments, reminder preferences, delivery records and audit events. RLS is enabled on every public table. The private schema contains authorization helpers.

## Edge Functions
- create-invite: requires a signed-in user with owner, care-recipient or caregiver permission; creates a hashed, 48-hour, one-use invitation.
- redeem-invite: requires sign-in; checks the invite hash, expiry, one-use state and optional email binding before adding membership.
- send-reminders: requires x-cron-secret; uses Resend to notify active care-circle members about doses due within their configured lead time, sufficiently overdue pending doses, and upcoming appointments. A unique event key prevents duplicate delivery.

## Required server-side secrets
Set these in Supabase Edge Function secrets, never in Vite client variables:
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- RESEND_API_KEY
- REMINDER_FROM_EMAIL (a sender/domain verified in Resend)
- REMINDER_CRON_SECRET (long random secret)

The send-reminders function is deliberately not JWT-authenticated because it is called by a scheduler; it independently checks REMINDER_CRON_SECRET. Keep the secret private.

## Scheduling
After deploying the functions and setting secrets, configure a Supabase Cron job (for example, every 5 minutes) to POST to /functions/v1/send-reminders with header x-cron-secret set to the stored secret. Do not put the secret in client code or public SQL history. Confirm successful delivery and failed-delivery logging before enabling real notifications.

## Client integration still required
Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY only after provisioning the project, then implement and test sign-in, profile creation, profile switching, realtime/shared reads, CRUD, role-aware controls, invite creation/redemption and notification preference persistence. Never expose the service-role key in the browser.

## Safety
Do not enter real patient data in the current Vercel preview. Validate timezone/DST behavior, email consent, rate limits, audit retention, account recovery, accessibility with older adults, and privacy/legal requirements before production use.
