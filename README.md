# Everkind — Care, connected.

An accessibility-first elderly-care coordination prototype for medication routines, appointments and family collaboration.

## Working preview
- Responsive family-care dashboard and adherence overview.
- Medication creation, schedules and dose logging.
- Appointment creation and visit overview.
- Care-circle view and invitation UI.
- Browser-local persistence for the live preview.
- Safety copy distinguishing care organization from medical advice.

## Backend foundation
The repository also includes a Supabase schema with row-level security, membership roles, hashed one-time invitations, dose records, appointment records, notification preferences, delivery records and audit events. Edge Functions implement invitation creation/redemption and a Resend-backed reminder worker. Setup instructions are in supabase/README.md.

**The backend is not yet connected to the live preview.** The current Vercel deployment stores records in the visitor's browser (localStorage), so users do not share or synchronize records. The invitation code shown in the UI is illustrative and is not an authentication credential. Email reminders are not being sent. Do not enter real patient data.

## Production activation
A dedicated Supabase project, migration deployment, function secrets, Resend sender verification, scheduled invocation and end-to-end authorization/email tests are still required. The frontend also needs Supabase Auth and database integration before the shared-care workflow can be considered live.

## Run locally
npm install
npm run dev
npm run build

## Stack
React, Vite, Lucide icons, CSS, Supabase (backend foundation).
