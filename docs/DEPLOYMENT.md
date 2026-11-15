# Deployment and operations

## Current deployment

- Frontend: [https://ever-kind-care.vercel.app](https://ever-kind-care.vercel.app)
- Repository: [PSP-YN/Everkind](https://github.com/PSP-YN/Everkind)
- Backend: Supabase project configured in the maintainer's environment.
- Email reminders: not active; Resend credentials and a verified sender are not configured.
- Cloud Run: Docker image is prepared and locally health-tested, but no Cloud Run service is provisioned.

## Local development

Requirements: Node.js 20+ (CI uses Node.js 22), npm and Git.

```bash
git clone https://github.com/PSP-YN/Everkind.git
cd Everkind
npm ci
cp .env.example .env.local
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`, then:

```bash
npm run dev
```

Do not commit `.env.local`. The example file contains placeholders only.

## Quality gate

```bash
npm run check
```

This runs formatting, ESLint, unit tests, production build, Playwright/axe-core tests and npm audit. The browser tests mock Supabase responses and do not mutate live care data.

## Supabase database

The migration directory is the source-controlled schema history. Before deploying a new release:

1. Back up the database according to the environment's backup capability.
2. Review every new migration.
3. Apply migrations to a disposable/staging project first.
4. Apply them to production using the Supabase migration workflow.
5. Verify the remote migration history matches the repository.
6. Run `supabase/tests/security_smoke.sql`.
7. Check Supabase security, performance and health advisors.

Do not use `db reset` against the production project. Do not edit an already-applied migration; add a new forward-only migration.

## Edge Functions

Deploy the functions from `supabase/functions/`:

- `create-invite`
- `redeem-invite`
- `revoke-member`
- `send-reminders`

The first three require JWT verification. `send-reminders` has JWT verification disabled and validates its scheduler secret server-side. Keep the deployed function version aligned with source. Review logs after deployment.

## Vercel

Connect the public GitHub repository to Vercel and configure:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Use the publishable/anon key only. Do not configure service-role or server secrets as frontend variables. Build command is `npm run build`; output directory is `dist`.

The GitHub Actions workflow runs quality gates on pushes and pull requests to `main`. Confirm the workflow run is green before promoting a deployment.

## Optional Docker / Cloud Run

Build using public browser configuration only:

```bash
set -a
. ./.env.local
set +a
docker build \
  --build-arg VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
  --build-arg SUPABASE_BROWSER_CONFIG="$VITE_SUPABASE_ANON_KEY" \
  -t everkind:latest .
docker run --rm -p 8080:8080 everkind:latest
curl -fsS http://localhost:8080/healthz
```

To deploy to Cloud Run, a GCP project, billing configuration, Artifact Registry and authenticated `gcloud` CLI are required. Example:

```bash
gcloud run deploy everkind \
  --image asia-south1-docker.pkg.dev/PROJECT_ID/everkind/everkind:latest \
  --region asia-south1 \
  --allow-unauthenticated \
  --port 8080
```

Cloud Run is not currently deployed. Do not present the Docker health test as a live Cloud Run deployment.

## Email reminder activation

Email reminders are disabled until all of these are complete:

1. Create/configure a Resend account.
2. Verify a sender domain/address.
3. Set `RESEND_API_KEY` and `REMINDER_FROM_EMAIL` as Edge Function secrets.
4. Configure the scheduler secret in Supabase Vault.
5. Verify the Edge Function using a controlled test recipient.
6. Only then enable the reminder delivery cron job.

This may require a paid email provider plan or domain. The current app remains free-tier and does not claim that email reminders are working.

## Rollback and recovery

- Frontend: roll back to the previous successful Vercel deployment.
- Database: prefer a forward corrective migration; restore from backup only under an approved recovery plan.
- Edge Functions: redeploy the last known-good source version.
- Secrets: rotate compromised values; never restore them from source control.
- Dose generation is idempotent and can safely be rerun; inspect the generated rows before changing schedule logic.
