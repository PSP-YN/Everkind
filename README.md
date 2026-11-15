# Everkind — Care, connected.

An accessibility-first elderly-care coordination prototype for medication routines, appointments and family collaboration.

## Demo capabilities
- Responsive care dashboard and adherence overview.
- Medication creation, schedules and dose logging.
- Appointment creation and visit overview.
- Care-circle view and illustrative invitation flow.
- Browser-local persistence for prototype data.

## Important limitation
This build is a demo. Records are stored in the visitor's browser (localStorage), so they do not synchronize between devices or users. The invitation code is illustrative, not an authentication credential. Email reminder controls are UI-only; no emails are sent. Do not enter real patient data.

## Production hardening
Before handling real health information, connect verified authentication, server-side invitation redemption, role-based authorization and row-level security, managed secrets, audit trails, scheduled idempotent reminder jobs, delivery logs/retries, consent and revocation workflows, clinical safety review, accessibility testing with older adults, and applicable privacy/legal review.

## Run
npm install
npm run dev
npm run build

## Stack
React, Vite, Lucide icons and CSS. Backend integration is not represented as live until configured and security-tested.