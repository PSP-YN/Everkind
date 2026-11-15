# Security model and operational controls

## Security objectives

1. A user can access only care profiles where they have active membership, subject to the role-specific operations below.
2. The browser never receives a service-role key, reminder secret or email-provider key.
3. Invitation codes are short-lived, single-use and stored as hashes.
4. Medication dose outcomes are attributable to an authenticated user.
5. Anonymous requests cannot read or mutate care records.

## Authentication

Supabase Auth manages email/password authentication and JWT issuance. Signup currently requires at least 12 characters with uppercase, lowercase, numeric and symbol characters. This is a client-side password-strength rule. It does **not** detect breached passwords and must not be represented as equivalent to breached-password screening.

The Supabase Security Advisor currently reports leaked-password protection disabled. Supabase documents the control as available on Pro and above. The connected project remains on the Free plan; no paid upgrade has been made. This is a known residual platform control, not a claim that the application has zero security findings.

Users must use individual accounts. Never share passwords or invitation codes publicly. If a password has been exposed, change it and revoke sessions as appropriate.

## Authorization and RLS

All nine public application tables have RLS enabled. Policies use the authenticated user identity and private membership helper functions. The helper functions use a fixed empty search path and are not executable by anonymous users.

| Resource                 | Read                                     | Create/update/delete                                                                                         |
| ------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Care profiles            | Active members and the owner             | Authenticated user can create only a profile owned by themselves; managers can update allowed profile fields |
| Care members             | Active members and the member themselves | No direct client writes; Edge Functions manage memberships                                                   |
| Care invites             | No direct client access                  | Edge Functions only                                                                                          |
| Medications              | Active members                           | Care managers create/update/delete                                                                           |
| Medication doses         | Active members                           | Authorized members record outcomes; managers schedule pending doses; protected identity/time columns         |
| Appointments             | Active members                           | Care managers create/update/delete                                                                           |
| Notification preferences | Active members                           | Care managers update                                                                                         |
| Notification deliveries  | Active members                           | Server-side worker only                                                                                      |
| Audit events             | Active members                           | Server-side triggers only                                                                                    |

The profile owner SELECT policy allows `owner_id = auth.uid()` in addition to active membership. This is required for the profile insert-returning flow, because the owner-membership trigger and the returned row are evaluated in the same database request.

## Invitation security

- 128-bit cryptographically random invitation code.
- SHA-256 hash stored in the database; plaintext code is returned once.
- 48-hour expiry.
- Atomic single-use redemption.
- Optional email binding.
- Creation rate limit: 10 invitations per account per hour.
- Authenticated JWT required for create, redeem and revoke operations.
- Revocation blocks owner removal and self-removal.
- Membership records cannot be written directly by browser clients.

Treat invitation codes as credentials until redeemed or expired.

## Secrets and deployment

Only `VITE_SUPABASE_URL` and the Supabase publishable/anon key are browser configuration. These are public by design and are safe only because RLS is correctly enforced.

Never put any of the following in `VITE_*` variables, committed files, screenshots or client logs:

- Supabase service-role/secret key.
- Resend API key.
- Reminder cron secret.
- Database password.

The reminder Edge Function has JWT verification disabled because it is invoked by a scheduler, but it validates a Vault-backed secret through a service-role-only database function. The secret is not exposed to the browser.

## Data minimization and privacy

The current deployment is a hackathon prototype. Use synthetic demo data. Do not enter real health data, patient identities, medication records, clinical notes or personal contact information until a privacy impact assessment, applicable legal review, data retention policy, backup/restore plan and independent security review have been completed.

## Verified controls

The latest live checks recorded:

- RLS enabled on all nine public tables.
- Anonymous table access revoked.
- Private helper functions not executable by anon.
- Client membership writes blocked.
- Invitation table access restricted to server functions.
- Dose identity/time columns protected.
- Authenticated dose outcome writes bind the recorder.
- Reminder-secret validator restricted to service role.
- Dose generation cron job active.
- Rollback-only live test: authenticated profile insert returned a row and the owner could read it under RLS; transaction rolled back.
- Supabase health advisor: no findings.

The Security Advisor still reports leaked-password protection disabled. Do not describe the project as having no security warnings.

## Incident response

If an account or secret may be compromised:

1. Change the affected account password and revoke active sessions.
2. Rotate the relevant server-side secret in Supabase Edge Function secrets/Vault.
3. Review Auth, Postgres and Edge Function logs for the affected period.
4. Revoke suspicious care-circle memberships and outstanding invitations.
5. Preserve audit evidence and document the incident.
6. Do not paste credentials, tokens or patient data into issue trackers or public repositories.
