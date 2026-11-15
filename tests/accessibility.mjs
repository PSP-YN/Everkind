import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { localDateTime, today } from '../src/utils.js';

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
    await page.route(supabaseUrl + '/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      let data = [];
      const method = route.request().method();
      if (path.endsWith('/auth/v1/user')) data = user;
      else if (path.endsWith('/rest/v1/care_profiles')) data = profiles;
      else if (path.endsWith('/rest/v1/care_members')) {
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
      } else if (path.endsWith('/rest/v1/medications')) data = [medication];
      else if (path.endsWith('/rest/v1/appointments')) data = [appointment];
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
    return { context, page };
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
  await onboarding.context.close();

  const app = await appPage();
  const page = app.page;
  await page.waitForSelector('.shell');
  await audit(page, 'authenticated dashboard with live records');
  await page.getByRole('button', { name: /Mark taken: Sample Medication/ }).click();
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

  await page
    .getByRole('button', { name: /Add appointment/ })
    .first()
    .click();
  await audit(page, 'add appointment dialog');
  await page.getByRole('button', { name: 'Close dialog' }).click();

  await page
    .getByRole('button', { name: /Invite (a )?member/ })
    .first()
    .click();
  await audit(page, 'invite dialog');
  await page.getByRole('button', { name: 'Close dialog' }).click();

  await page.getByRole('button', { name: 'Reminder settings', exact: true }).click();
  await audit(page, 'reminder preferences dialog');
  await page.getByRole('button', { name: 'Close dialog' }).click();

  await page.getByRole('button', { name: 'Safety & privacy' }).click();
  await audit(page, 'safety and privacy dialog');
  await app.context.close();

  const mobile = await appPage({ viewport: { width: 390, height: 844 } });
  const overflow = await mobile.page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 0) throw new Error('Mobile horizontal overflow: ' + overflow + 'px');
  await audit(mobile.page, 'mobile dashboard');
  await mobile.context.close();

  console.log('Accessibility suite passed: all audited states have zero axe violations.');
} finally {
  if (browser) await browser.close();
  preview.kill('SIGTERM');
}
