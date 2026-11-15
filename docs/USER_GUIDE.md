# Everkind user guide

Everkind helps an older adult and their chosen care circle coordinate a medication routine and appointments. It is a coordination tool, not a prescriber or emergency service.

## 1. Create an account or sign in

1. Open the [Everkind web app](https://ever-kind-care.vercel.app).
2. Create an account with an email address and a password of at least 12 characters containing uppercase and lowercase letters, a number and a symbol.
3. If email confirmation is enabled, open the confirmation email before signing in.
4. Sign in with the same email and password.

The password rule is enforced by the signup form. It does not provide breached-password screening; see [Security](SECURITY.md).

## 2. Create a care profile

1. On first sign-in, choose **Create care profile**.
2. Enter the care recipient's preferred display name.
3. Submit once and wait for the profile to appear.

The signed-in account becomes the immutable profile owner. A database trigger creates the owner membership and default notification preferences. The profile owner can read the inserted profile immediately; the production RLS path is covered by a rollback-only live database test.

If profile creation fails, do not repeatedly submit. Check that the account is signed in, reload once, and retry. If the error mentions row-level security, verify that the latest Supabase migrations have been applied; see [Troubleshooting](#7-troubleshooting).

## 3. Join an existing care circle

1. Ask an existing care-circle manager for a one-time invitation code.
2. Enter the code under **OR JOIN AN EXISTING CIRCLE**.
3. Submit it while signed in to the account that should join.
4. If the invitation is email-bound, the signed-in email must match the invited email.

Invitation codes are single-use and expire after 48 hours. A code cannot be reused after successful redemption or revocation.

## 4. Manage medications

1. Open **Medications** and choose **Add medication**.
2. Enter the medicine name, dosage exactly as prescribed, instructions, start/end dates, frequency and scheduled local times.
3. Save the medication. The app creates a rolling 14-day dose schedule.
4. Review the dashboard and medication list for upcoming doses.

Daily schedules create one dose per configured time for each day in the rolling window. Weekly schedules create doses on the configured weekly cadence. The backend calculates due instants using the care profile's IANA timezone. Dose generation is idempotent: a unique medication/time constraint prevents duplicates.

**Recording an outcome:** record a dose as taken only after it has actually been taken. If it was skipped or missed, record the correct outcome. Do not use the app to decide whether to take, skip, delay or change a medicine. Follow the clinician's instructions.

## 5. Manage appointments

Open **Appointments**, add the clinician, specialty, date/time, location and useful visit notes, then save. Check the displayed timezone and date before confirming. Update or cancel appointments when plans change.

## 6. Invite and manage members

Open **Care circle** and create an invitation. Select the access role and, where appropriate, bind it to the intended email address. Share the one-time code privately; do not post it publicly.

- **Owner:** owns the care profile and has management access.
- **Care recipient:** can participate in care management.
- **Caregiver:** can manage care-plan information.
- **Family:** has read access and can record a dose outcome.

Managers can revoke a member's access. Revocation is enforced by database membership checks and takes effect on subsequent requests. Do not share an account password; each person should use their own account and invitation.

## 7. Troubleshooting

### "new row violates row-level security policy" while creating a care profile

The profile insert policy requires `owner_id = auth.uid()`. The app supplies the authenticated user's ID, and the profile-owner trigger creates the owner membership. The profile SELECT policy also explicitly permits its owner to read the new row during the insert-returning operation.

If this error returns:

1. Sign out and sign back in.
2. Confirm the latest migrations are applied, including `20261115091903_owner_can_read_own_care_profile`.
3. Check Supabase Auth and Postgres logs for the failing request.
4. Never disable RLS or grant anonymous table access as a workaround.

### Invitation code is rejected

Check for typos, expiry (48 hours), prior redemption, revocation and email binding. Ask the manager to create a new code. The code is case-insensitive only if the Edge Function normalizes the submitted value; otherwise copy the generated value exactly.

### No email reminders arrive

Email delivery is currently not configured in the free deployment. A Resend API key and verified sender are required before reminder delivery can be enabled. In-app schedules and dose records remain available; do not assume an email was sent.

### Dates or dose times look wrong

Check the care profile's timezone. Everkind currently defaults new profiles to `Asia/Kolkata`. The dose scheduler uses each profile's local calendar date and timezone when calculating UTC instants.

### A screen appears stale

Refresh the page. Realtime updates are best-effort; the database remains the source of truth. Verify the saved record before relying on a displayed status.

## 8. Safety and privacy

Use fictional or test data in this hackathon deployment. Do not enter real patient details, diagnoses, prescriptions, contact information or other sensitive health information until legal, privacy, clinical and security reviews are complete. Do not rely on Everkind for emergency response, clinical decisions or medication advice.
