# Quality assurance and accessibility

## Automated quality gates

Run the full local quality suite from the repository root:

```bash
npm ci
npm run check
```

The gates include:

| Gate                  | Command                            | Purpose                                                                 |
| --------------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| Formatting            | `npm run format:check`             | Consistent, reviewable source formatting                                |
| Static analysis       | `npm run lint`                     | ESLint, React Hooks and JSX accessibility rules                         |
| Unit tests            | `npm test`                         | Date/time-zone conversion, dose schedule generation and safe formatting |
| Production build      | `npm run build`                    | Vite production compilation                                             |
| Browser accessibility | `npm run test:a11y`                | axe-core WCAG 2.1 A/AA, WCAG 2.1 AA and best-practice scans             |
| Dependency audit      | `npm audit --audit-level=moderate` | Known dependency vulnerabilities                                        |

GitHub Actions runs the same gates on pushes and pull requests to `main`. The Playwright browser tests use a mocked Supabase session, REST responses and Edge Function responses; they do not access or modify live care data. Interaction checks exercise owner-bound profile creation, joining a care circle with a correctly formatted 128-bit invitation code, marking a dose taken with authenticated recorder and timestamp, medication creation with a 14-day schedule, appointment creation with the authenticated creator, vital-log creation with the authenticated recorder, invitation creation with email binding, saving reminder preferences, keyboard dialog focus and mobile navigation. The suite also fails on uncaught browser errors or unexpected third-party requests. The onboarding browser test verifies that the authenticated user ID is bound as `owner_id` against mocked API responses. Separately, `supabase/tests/profile_onboarding_live.sql` was run against the connected production database in a transaction as the authenticated role: profile INSERT succeeded, the owner could read the inserted row (count 1), and the transaction rolled back. `supabase/tests/scheduler_live.sql` exercises daily and weekly schedules in two different timezones and rolls back its temporary rows.

## Data-fetch efficiency

The initial workspace load fetches its seven required datasets concurrently. The active-member query also supplies the signed-in member role, avoiding a duplicate membership lookup. Realtime changes are debounced per dataset and refresh only the affected data: appointments, members/role, vitals, doses, or medications plus their generated doses. This avoids re-fetching the entire workspace after a single row changes. Dose events are additionally filtered against the active profile's medication IDs before a refresh is scheduled.

## Accessibility implementation

Everkind targets WCAG 2.1 AA. Automated checks cover the sign-in and sign-up screens, first-run onboarding, authenticated dashboard, all five workspace views, medication and appointment forms, invitation dialog, reminder preferences, safety dialog and responsive layouts at 320px, 390px and 768px (narrow mobile, mobile and tablet).

Implemented measures include:

- Semantic main, navigation, header, article, section and footer landmarks.
- A keyboard-visible skip link and clear focus indicators.
- Explicit form labels and input names.
- Accessible names for icon-only controls and meaningful dose actions.
- Keyboard-operable navigation and native form controls.
- Dialog semantics, focus entry, focus containment, Escape dismissal and focus restoration.
- Screen-reader announcements for loading, status and toast updates.
- Programmatic medication-adherence meter values.
- Higher-contrast secondary text, readable placeholders and larger touch targets.
- Reduced-motion and forced-colors support.
- No horizontal overflow at 320px, 390px or 768px; fixed mobile navigation, 44px touch targets and mobile sign-out are also verified.

## Test results recorded during development

The latest local automated run (15 November 2026, after the realtime refresh optimization) recorded:

- Unit tests: 8 passed, 0 failed.
- axe-core: 0 violations in all 19 audited states, including 320px, 390px and 768px layouts.
- Mobile viewport: 0px horizontal overflow.
- ESLint: passed with no warnings or errors.
- Production build: passed.

These results describe the exact automated test scope. axe-core cannot prove complete WCAG conformance and does not replace assistive-technology testing.

## Manual release checklist

Before a real-world deployment, manually verify with a keyboard and screen reader:

1. Complete sign-in, account creation and onboarding without a mouse.
2. Navigate each workspace view using Tab, Shift+Tab, Enter and Space.
3. Open every dialog, confirm focus enters it, cycle focus, dismiss with Escape and confirm focus returns to its trigger.
4. Complete medication, appointment and invitation forms with a screen reader.
5. Confirm dynamic dose status, validation messages and success/error announcements are understandable.
6. Test at 200% zoom and with operating-system high-contrast/forced-colors settings.
7. Test with NVDA + Firefox/Chrome and VoiceOver + Safari where available.
8. Verify large text, target sizes and touch operation on a physical mobile device.

## Clinical and privacy boundary

This is a hackathon prototype, not a certified medical device or clinical record system. Do not use it to make medication decisions or for emergency care. Before real patient use, complete a privacy impact assessment, applicable legal review, threat model, penetration test, backup/restore drill and independent clinical usability review.

## External platform security control

The Supabase Security Advisor currently reports one platform-level warning: leaked-password protection is disabled. Supabase documents that control as available on Pro and above ([password security documentation](https://supabase.com/docs/guides/auth/password-security)). The connected organization is on the Free plan, so the toggle cannot be enabled without a paid plan change. The signup form now requires 12+ characters with uppercase, lowercase, a number and a symbol, but this client-side rule is not a substitute for server-side breached-password screening. No plan upgrade or recurring charge was initiated. Database RLS, anonymous-role restrictions, service-only secret validation and the expanded live SQL smoke test are passing.
