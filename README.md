# Everkind — Care, connected

**Challenge vertical:** Elderly Care & Medication Management Platform (PromptWars × Catalyst).

Everkind is an accessibility-first, collaborative care workspace for older adults and the people they choose to involve. It centralizes medication schedules, dose-adherence records, doctor appointments, care-circle membership and reminders while keeping the care recipient at the centre of decisions.

## What works

- Email/password registration and sign-in through Supabase Auth.
- Care profile creation and invitation-code joining.
- Shared cloud records for medications, dose schedules, adherence and appointments.
- Role-aware access: owner, care recipient, caregiver and family.
- One-use invitation codes, hashed at rest, optionally email-bound and expiring after 48 hours.
- Care-circle access revocation through an authenticated server function.
- Row Level Security on all application tables.
- Realtime subscriptions for shared care updates.
- Audit trail for medication, dose, appointment and membership changes.
- Per-profile reminder preferences and a rolling two-week dose generator.
- Responsive UI with keyboard-friendly native form controls and clear safety language.

## How the solution works

1. A user creates an account and verifies their email through Supabase Auth.
2. They create a care profile or redeem an invitation from an existing care circle.
3. The profile owner, care recipient or an authorized caregiver can add medication schedules and appointments.
4. A rolling dose window creates pending dose records. Authorized members record dose outcomes; the database records who and when.
5. RLS checks membership and role on every client database request. Membership writes and invitation validation stay server-side.
6. Realtime subscriptions refresh the shared workspace when authorized records change.
7. A scheduled Edge Function checks dose and appointment windows and sends email notifications through Resend when provider credentials are configured.

## Architecture

- **Frontend:** React 18, Vite 6, Lucide.
- **Identity and data:** Supabase Auth, PostgreSQL 17, PostgREST, RLS.
- **Server-side workflows:** Supabase Edge Functions (Deno).
- **Scheduling:** pg_cron; asynchronous HTTP through pg_net; secret storage in Supabase Vault.
- **Email:** Resend (requires a user-provided API key and a verified sender).
- **Hosting:** Vercel production deployment; Docker image is also prepared for Cloud Run.

## Live demo

https://catalyst-one-xi.vercel.app

## Run locally

Requirements: Node.js 20+, npm.

```bash
npm ci
cp .env.example .env.local
# Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local
npm run dev
```

Production build and dependency audit:

```bash
npm run build
npm audit
```

## Docker / Google Cloud Run

The repository includes a multi-stage Dockerfile and an Nginx configuration with SPA fallback and a `/healthz` endpoint. The container listens on Cloud Run's `PORT` (default 8080).

Build locally (the Supabase URL and publishable key are public frontend configuration; never pass a service-role key):

```bash
set -a
. ./.env.local
set +a
docker build \
  --build-arg VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
  --build-arg VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" \
  -t everkind:latest .
docker run --rm -p 8080:8080 everkind:latest
```

To deploy, push the image to an Artifact Registry repository in your GCP project, then run:

```bash
gcloud run deploy everkind \
  --image asia-south1-docker.pkg.dev/PROJECT_ID/everkind/everkind:latest \
  --region asia-south1 \
  --allow-unauthenticated \
  --port 8080
```

A Google Cloud project, billing configuration and authenticated `gcloud` CLI are required to publish a Cloud Run URL. The live public deployment linked above is currently on Vercel.

## Supabase setup

The connected project is documented in [supabase/README.md](supabase/README.md). SQL migrations are in `supabase/migrations/`; Edge Functions are in `supabase/functions/`; database smoke checks are in `supabase/tests/`.

Frontend environment variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (use the Supabase publishable key; it is public by design and relies on RLS)

Never put a Supabase service-role/secret key, Resend API key or reminder cron secret in frontend variables.

## Assumptions and safety boundaries

- The care profile timezone defaults to `Asia/Kolkata`.
- Users enter medication names, doses and schedules exactly as directed by a licensed clinician. Everkind does not prescribe, calculate dosages or recommend medication changes.
- A family member receives read access and may record a dose outcome; caregivers and care recipients can manage care-plan data.
- Invitations are valid for 48 hours and are single-use. If an email is specified, the redeeming account must match it.
- Email reminders are inactive until a Resend API key and verified sender are configured and the scheduled delivery job is enabled.
- The current project is a hackathon prototype, not a certified clinical system. Do not use it for emergency care or enter sensitive real patient information without completing legal, privacy, operational and security reviews.
