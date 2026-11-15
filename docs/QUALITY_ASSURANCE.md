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

GitHub Actions runs the same gates on pushes and pull requests to `main`. The accessibility browser tests use a mocked Supabase session and mocked REST responses; they do not access or modify live care data.

## Accessibility implementation

Everkind targets WCAG 2.1 AA. Automated checks cover the sign-in and sign-up screens, first-run onboarding, authenticated dashboard, all four workspace views, medication and appointment forms, invitation dialog, reminder preferences, safety dialog and a 390px mobile viewport.

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
- No horizontal overflow at the tested 390px mobile viewport.

## Test results recorded during development

The latest local automated run recorded:

- Unit tests: 7 passed, 0 failed.
- axe-core: 0 violations in each audited state.
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
