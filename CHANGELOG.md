# Changelog

## 1.1.0 — 2026-11-15

### User experience and accessibility

- Reworked the dashboard around the next care action and clearer dose status.
- Improved mobile navigation, small-screen layout, safe-area spacing and touch targets.
- Increased text readability, contrast and form/dialog clarity.
- Improved keyboard focus handling, screen-reader labels and status announcements.
- Removed the remote font dependency and rely on system font stacks.

### Reliability and scheduling

- Fixed owner visibility for the newly inserted care profile under RLS.
- Added an explicit live rollback-only onboarding RLS test.
- Corrected dose generation to use each profile's local calendar date.
- Corrected the rolling scheduler to generate exactly 14 local calendar dates.
- Added live rollback-only scheduler tests for daily/weekly schedules and multiple timezones.
- Strengthened browser regression coverage for joining a care circle and the invitation code format.

### Engineering and documentation

- Added user, architecture, security and deployment documentation.
- Updated QA and Supabase migration documentation.
- Added scheduler invariants to the database security smoke test.
- Updated the CI/browser quality suite and test coverage documentation.
