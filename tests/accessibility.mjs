import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { addCalendarDays, localDateTime, today } from '../src/utils.js';

const envFile = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '';
const fileEnv = Object.fromEntries(
  envFile
    .split(/\r?\n/)
    .filter((line) => line.includes('='))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, '')];
    }),
);
const config = { ...fileEnv, ...process.env };
const supabaseUrl = config.VITE_SUPABASE_URL || 'https://accessibility-test.supabase.co';
const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const profile = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  owner_id: userId,
  display_name: 'Accessibility Test Profile',
  timezone: 'Asia/Kolkata',
  created_at: new Date().toISOString(),
};
const medication = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  profile_id: profile.id,
  name: 'Sample Medication',
  dose: '1 tablet',
  instructions: 'As prescribed',
  schedule: { frequency: 'Daily', times: ['08:00'] },
  active: true,
  created_by: userId,
  created_at: new Date().toISOString(),
};
const appointment = {
  id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  profile_id: profile.id,
  clinician_name: 'Dr. Test',
  specialty: 'General practice',
  starts_at: new Date(Date.now() + 86_400_000).toISOString(),
  location: 'Clinic',
  notes: 'Bring current medication list',
  status: 'scheduled',
  created_by: userId,
};
const member = {
  id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  user_id: '99999999-9999-4999-8999-999999999999',
  role: 'family',
  status: 'active',
  created_at: new Date().toISOString(),
};
const activity = {
  id: '77777777-7777-4777-8777-777777777777',
  profile_id: profile.id,
  action: 'medication_created',
  entity_type: 'medication',
  created_at: new Date().toISOString(),
};
const user = {
  id: userId,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'accessibility@example.com',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  created_at: new Date().toISOString(),
};
const now = Math.floor(Date.now() / 1000);
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const accessToken =
  encode({ alg: 'HS256', typ: 'JWT' }) +
  '.' +
  encode({
    aud: 'authenticated',
    exp: now + 3600,
    iat: now,
    iss: supabaseUrl + '/auth/v1',
    sub: userId,
    role: 'authenticated',
    email: user.email,
    app_metadata: user.app_metadata,
    user_metadata: {},
  }) +
  '.test-signature';
const session = {
  access_token: accessToken,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: now + 3600,
  refresh_token: 'mock-refresh-token',
  user,
};

const preview = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '4173',
    '--strictPort',
  ],
  { stdio: 'ignore' },
);
let browser;
const runtimeErrors = [];
const unexpectedRequests = [];
try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch('http://127.0.0.1:4173');
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Retry until the local preview is accepting connections. */
    }
    await delay(250);
  }
  if (!ready) throw new Error('Vite preview did not become ready on port 4173');

  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    (fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);
  browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox'],
  });

  async function appPage({
    authenticated = true,
    profiles = [profile],
    viewport = { width: 1365, height: 900 },
  } = {}) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('request', (request) => {
      const hostname = new URL(request.url()).hostname;
      if (!['127.0.0.1', 'localhost', new URL(supabaseUrl).hostname].includes(hostname)) {
        unexpectedRequests.push(request.url());
      }
    });
    if (authenticated) {
      await page.addInitScript(
        ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
        {
          key: 'sb-' + projectRef + '-auth-token',
          value: session,
        },
      );
    }
    let doseStatus = 'pending';
    let currentProfiles = profiles;
    let currentMedications = [medication];
    let createdMedicationPayload = null;
    let createdDoseRows = [];
    let createdAppointment = null;
    let createdInvitePayload = null;
    await page.route(supabaseUrl + '/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      let data = [];
      const method = route.request().method();
      if (path.endsWith('/auth/v1/user')) data = user;
      else if (path.endsWith('/rest/v1/care_profiles') && method === 'POST') {
        const payload = JSON.parse(route.request().postData() || '{}');
        if (payload.owner_id !== userId) {
          await route.fulfill({
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'RLS owner check failed' }),
          });
          return;
        }
        const created = {
          ...profile,
          display_name: payload.display_name,
          timezone: payload.timezone,
        };
        currentProfiles = [created];
        await route.fulfill({
          status: 201,
          contentType: 'application/vnd.pgrst.object+json',
          body: JSON.stringify(created),
        });
        return;
      } else if (path.endsWith('/rest/v1/care_profiles')) data = currentProfiles;
      else if (path.endsWith('/rest/v1/medications') && method === 'POST') {
        createdMedicationPayload = JSON.parse(route.request().postData() || '{}');
        const created = {
          ...medication,
          ...createdMedicationPayload,
          id: '12121212-1212-4121-8121-121212121212',
        };
        currentMedications = [...currentMedications, created];
        await route.fulfill({
          status: 201,
          contentType: 'application/vnd.pgrst.object+json',
          body: JSON.stringify(created),
        });
        return;
      } else if (path.endsWith('/rest/v1/medication_doses') && method === 'POST') {
        const rows = JSON.parse(route.request().postData() || '[]');
        createdDoseRows = rows.map((row, index) => ({
          ...row,
          id: '13131313-1313-4131-8131-' + String(index + 1).padStart(12, '0'),
          medications: currentMedications[currentMedications.length - 1],
        }));
        await route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
        return;
      } else if (path.endsWith('/rest/v1/appointments') && method === 'POST') {
        const payload = JSON.parse(route.request().postData() || '{}');
        createdAppointment = {
          ...payload,
          id: '14141414-1414-4141-8141-141414141414',
          status: 'scheduled',
        };
        await route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
        return;
      } else if (path.endsWith('/functions/v1/create-invite') && method === 'POST') {
        createdInvitePayload = JSON.parse(route.request().postData() || '{}');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'EVER-TEST-ONE',
            expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          }),
        });
        return;
      } else if (path.endsWith('/rest/v1/notification_preferences') && method === 'PATCH') {
        await route.fulfill({ status: 204, body: '' });
        return;
      } else if (path.endsWith('/rest/v1/care_members')) {
        const params = new URL(route.request().url()).searchParams;
        const owner = {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          user_id: userId,
          role: 'owner',
          status: 'active',
          created_at: new Date().toISOString(),
        };
        data = params.has('user_id') ? [owner] : [owner, member];
      } else if (path.endsWith('/rest/v1/notification_preferences')) {
        data = [
          {
            profile_id: profile.id,
            email_enabled: false,
            dose_lead_minutes: 15,
            appointment_lead_hours: 24,
            missed_dose_delay_minutes: 60,
          },
        ];
      } else if (path.endsWith('/rest/v1/medications')) data = currentMedications;
      else if (path.endsWith('/rest/v1/appointments'))
        data = createdAppointment ? [appointment, createdAppointment] : [appointment];
      else if (path.endsWith('/rest/v1/audit_events')) data = [activity];
      else if (path.endsWith('/rest/v1/medication_doses') && method === 'PATCH') {
        doseStatus = 'taken';
        await route.fulfill({ status: 204, body: '' });
        return;
      } else if (path.endsWith('/rest/v1/medication_doses')) {
        data = [
          {
            id: '88888888-8888-4888-8888-888888888888',
            medication_id: medication.id,
            due_at: localDateTime(today('Asia/Kolkata'), '08:00', 'Asia/Kolkata'),
            status: doseStatus,
            recorded_by: doseStatus === 'taken' ? userId : null,
            medications: medication,
          },
          ...createdDoseRows.map((row) => ({
            ...row,
            status: row.status || 'pending',
            recorded_by: null,
          })),
        ];
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-0/0' },
        body: JSON.stringify(data),
      });
    });
    await page.route('**/realtime/**', (route) => route.abort());
    await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
    return {
      context,
      page,
      get createdMedicationPayload() {
        return createdMedicationPayload;
      },
      get createdDoseRows() {
        return createdDoseRows;
      },
      get createdAppointment() {
        return createdAppointment;
      },
      get createdInvitePayload() {
        return createdInvitePayload;
      },
    };
  }

  async function audit(page, label) {
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
      .analyze();
    if (result.violations.length) {
      const details = result.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        nodes: violation.nodes.map((node) => ({
          target: node.target,
          failure: node.failureSummary,
        })),
      }));
      throw new Error(label + ' accessibility violations: ' + JSON.stringify(details, null, 2));
    }
    console.log('PASS axe WCAG 2.1 AA:', label);
  }

  const auth = await appPage({ authenticated: false });
  await audit(auth.page, 'sign-in');
  await auth.page.getByRole('button', { name: /New to Everkind/ }).click();
  const signupPassword = auth.page.getByLabel('Password');
  await signupPassword.fill('weak-password');
  const weakPasswordValidity = await signupPassword.evaluate((element) => ({
    valid: element.validity.valid,
    patternMismatch: element.validity.patternMismatch,
  }));
  if (weakPasswordValidity.valid || !weakPasswordValidity.patternMismatch) {
    throw new Error('Signup password policy did not reject a weak password');
  }
  await signupPassword.fill('GoodPass123!');
  if (!(await signupPassword.evaluate((element) => element.validity.valid))) {
    throw new Error('Signup password policy rejected a valid strong password');
  }
  await audit(auth.page, 'sign-up');
  await auth.context.close();

  const onboarding = await appPage({ profiles: [] });
  await onboarding.page.waitForSelector('.onboarding');
  await audit(onboarding.page, 'first-run onboarding');
  await onboarding.page.getByLabel("Care recipient's name").fill('Test Care Recipient');
  await onboarding.page.getByRole('button', { name: /Create care profile/ }).click();
  await onboarding.page.waitForSelector('.shell');
  await onboarding.page.getByText('Test Care Recipient', { exact: true }).waitFor();
  console.log('PASS onboarding creates and reads back an owner-bound care profile');
  await onboarding.context.close();

  const app = await appPage();
  const page = app.page;
  await page.waitForSelector('.shell');
  await audit(page, 'authenticated dashboard with live records');
  await page.screenshot({ path: '/tmp/everkind-desktop-review.png', fullPage: true });
  await page
    .getByRole('button', { name: /Mark taken: Sample Medication/ })
    .first()
    .click();
  await page.getByText('Taken', { exact: true }).waitFor();
  await audit(page, 'dose recorded state');

  for (const [label, name] of [
    ['medications', /^Medications/],
    ['appointments', 'Appointments'],
    ['care circle', 'Care circle'],
    ['overview', 'Overview'],
  ]) {
    await page.getByRole('button', { name }).click();
    await audit(page, label + ' view');
  }

  const medicationTrigger = page.getByRole('button', { name: /Add medication/ }).first();
  await medicationTrigger.click();
  await page.getByRole('dialog').waitFor();
  if (
    !(await page
      .locator('.modal input')
      .first()
      .evaluate((element) => element === document.activeElement))
  ) {
    throw new Error('Dialog did not move keyboard focus into its first field');
  }
  await page.keyboard.press('Shift+Tab');
  if (
    (await page.evaluate(() => document.activeElement.getAttribute('aria-label'))) !==
    'Close dialog'
  ) {
    throw new Error('Dialog focus did not move to its first control');
  }
  await page.keyboard.press('Shift+Tab');
  await audit(page, 'add medication dialog');
  await page.keyboard.press('Escape');
  await page.locator('[role="dialog"]').waitFor({ state: 'detached' });
  if (!(await medicationTrigger.evaluate((element) => element === document.activeElement))) {
    throw new Error('Dialog did not restore focus to its opening control');
  }

  await medicationTrigger.click();
  const medicationDialog = page.getByRole('dialog');
  await medicationDialog.getByLabel('Medication name').fill('Vitamin D');
  await medicationDialog.getByLabel('Dosage').fill('1 tablet');
  await medicationDialog.getByLabel('First dose time').fill('09:00');
  await medicationDialog.getByLabel('Frequency').selectOption('Daily');
  await medicationDialog.getByRole('button', { name: /Save medication/ }).click();
  await page.locator('[role="dialog"]').waitFor({ state: 'detached' });
  await page.locator('.medinfo b').filter({ hasText: 'Vitamin D' }).first().waitFor();
  if (
    app.createdMedicationPayload?.name !== 'Vitamin D' ||
    app.createdMedicationPayload?.created_by !== userId ||
    app.createdDoseRows.length !== 14 ||
    app.createdDoseRows.some((row) => row.medication_id !== '12121212-1212-4121-8121-121212121212')
  ) {
    throw new Error(
      'Medication creation did not persist the expected owner-bound 14-day dose schedule',
    );
  }
  console.log('PASS medication creation persists an owner-bound medicine and 14-day dose schedule');

  await page
    .getByRole('button', { name: /Add appointment/ })
    .first()
    .click();
  await audit(page, 'add appointment dialog');
  const appointmentDialog = page.getByRole('dialog');
  await appointmentDialog.getByLabel("Doctor's name").fill('Dr. Demo');
  await appointmentDialog.getByLabel('Specialty').fill('Geriatrics');
  await appointmentDialog.getByLabel('Date').fill(addCalendarDays(today('Asia/Kolkata'), 1));
  await appointmentDialog.getByLabel('Time').fill('11:30');
  await appointmentDialog.getByLabel('Location').fill('Demo clinic');
  await appointmentDialog.getByLabel('Notes').fill('Bring current medication list');
  await appointmentDialog.getByRole('button', { name: /Save appointment/ }).click();
  await page.locator('[role="dialog"]').waitFor({ state: 'detached' });
  await page.getByText('Dr. Demo', { exact: true }).waitFor();
  if (
    app.createdAppointment?.created_by !== userId ||
    app.createdAppointment?.clinician_name !== 'Dr. Demo'
  ) {
    throw new Error('Appointment creation did not persist the authenticated creator');
  }
  console.log('PASS appointment creation persists the authenticated creator and visit details');

  await page
    .getByRole('button', { name: /Invite (a )?member/ })
    .first()
    .click();
  await audit(page, 'invite dialog');
  const inviteDialog = page.getByRole('dialog');
  await inviteDialog.getByLabel('Email address (optional)').fill('family@example.com');
  await inviteDialog.getByLabel('Access role').selectOption('family');
  await inviteDialog.getByRole('button', { name: /Generate one-time invitation/ }).click();
  await inviteDialog.getByText('EVER-TEST-ONE', { exact: true }).waitFor();
  if (
    app.createdInvitePayload?.profile_id !== profile.id ||
    app.createdInvitePayload?.email !== 'family@example.com'
  ) {
    throw new Error('Invitation creation did not send the selected care profile and email binding');
  }
  console.log('PASS invitation creation sends the selected profile and email binding');
  await page.getByRole('button', { name: 'Close dialog' }).click();

  await page.getByRole('button', { name: 'Reminder settings', exact: true }).click();
  await audit(page, 'reminder preferences dialog');
  await page.getByRole('button', { name: 'Close dialog' }).click();

  await page.getByRole('button', { name: 'Safety & privacy' }).click();
  await audit(page, 'safety and privacy dialog');
  await app.context.close();

  const mobile = await appPage({ viewport: { width: 390, height: 844 } });
  await audit(mobile.page, 'mobile dashboard at 390px');
  await mobile.page.screenshot({ path: '/tmp/everkind-mobile-review.png', fullPage: true });
  if (!(await mobile.page.getByRole('button', { name: 'Sign out' }).isVisible())) {
    throw new Error('Mobile sign-out action is not reachable');
  }
  const mobileNavigation = mobile.page.getByRole('navigation', { name: 'Primary navigation' });
  for (const label of ['Overview', 'Medications', 'Appointments', 'Care circle']) {
    if (!(await mobileNavigation.getByRole('button', { name: new RegExp(label) }).isVisible())) {
      throw new Error('Mobile primary navigation is missing ' + label);
    }
  }
  const bottomNav = await mobile.page.locator('.side').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return (
      Math.abs(window.innerHeight - rect.bottom) < 2 &&
      getComputedStyle(element).position === 'fixed'
    );
  });
  if (!bottomNav) throw new Error('Mobile primary navigation is not fixed to the bottom edge');
  const undersizedTargets = await mobile.page.locator('button:visible').evaluateAll((elements) =>
    elements
      .filter((element) => element.getBoundingClientRect().height < 44)
      .map((element) => ({
        text: element.innerText,
        ariaLabel: element.getAttribute('aria-label'),
        height: element.getBoundingClientRect().height,
      })),
  );
  if (undersizedTargets.length)
    throw new Error('Mobile touch targets below 44px: ' + JSON.stringify(undersizedTargets));
  await mobile.page.setViewportSize({ width: 320, height: 740 });
  const narrowOverflow = await mobile.page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (narrowOverflow > 0)
    throw new Error('320px mobile horizontal overflow: ' + narrowOverflow + 'px');
  await audit(mobile.page, 'narrow mobile dashboard at 320px');
  await mobile.page.setViewportSize({ width: 768, height: 900 });
  const tabletOverflow = await mobile.page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (tabletOverflow > 0) throw new Error('Tablet horizontal overflow: ' + tabletOverflow + 'px');
  await audit(mobile.page, 'tablet dashboard at 768px');
  await mobile.context.close();

  if (runtimeErrors.length) {
    throw new Error('Uncaught browser runtime errors: ' + runtimeErrors.join(' | '));
  }
  if (unexpectedRequests.length) {
    throw new Error('Unexpected third-party network requests: ' + unexpectedRequests.join(' | '));
  }
  console.log('PASS no uncaught browser runtime errors');
  console.log('PASS no third-party network requests');
  console.log(
    'Accessibility and interaction suite passed: all audited states have zero axe violations across desktop, tablet and mobile.',
  );
} finally {
  if (browser) await browser.close();
  preview.kill('SIGTERM');
}
