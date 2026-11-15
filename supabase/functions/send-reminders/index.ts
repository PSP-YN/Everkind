import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
const out = (x: unknown, s = 200) =>
  new Response(JSON.stringify(x), { status: s, headers: { 'Content-Type': 'application/json' } });
Deno.serve(async (req) => {
  if (req.method !== 'POST') return out({ error: 'POST required' }, 405);
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: valid, error: authError } = await db.rpc('validate_reminder_secret', {
    p_secret: req.headers.get('x-cron-secret') || '',
  });
  if (authError || valid !== true) return out({ error: 'Unauthorized' }, 401);
  const resend = Deno.env.get('RESEND_API_KEY'),
    from = Deno.env.get('REMINDER_FROM_EMAIL');
  if (!resend || !from) return out({ error: 'Email provider not configured' }, 503);
  const now = new Date(),
    counts = { sent: 0, skipped: 0, failed: 0 };
  const { data: doses, error: doseError } = await db
    .from('medication_doses')
    .select(
      'id,due_at,medications!inner(id,name,dose,profile_id,care_profiles!inner(display_name,timezone))',
    )
    .eq('status', 'pending')
    .lte('due_at', new Date(now.getTime() + 24 * 3600000).toISOString())
    .limit(300);
  if (doseError) return out({ error: 'Could not read dose schedule' }, 500);
  const { data: appts, error: apptError } = await db
    .from('appointments')
    .select('id,clinician_name,starts_at,profile_id,care_profiles!inner(display_name,timezone)')
    .eq('status', 'scheduled')
    .gte('starts_at', now.toISOString())
    .lte('starts_at', new Date(now.getTime() + 24 * 3600000).toISOString())
    .limit(200);
  if (apptError) return out({ error: 'Could not read appointments' }, 500);
  const events: any[] = [];
  for (const d of doses || []) {
    const m: any = d.medications,
      p = m.care_profiles,
      { data: prefs } = await db
        .from('notification_preferences')
        .select('email_enabled,missed_dose_delay_minutes,dose_lead_minutes')
        .eq('profile_id', m.profile_id)
        .maybeSingle();
    if (prefs?.email_enabled === false) continue;
    const due = new Date(d.due_at),
      delay = (prefs?.missed_dose_delay_minutes || 30) * 60000,
      lead = (prefs?.dose_lead_minutes || 15) * 60000;
    if (due < now && now.getTime() - due.getTime() < delay) continue;
    if (due > now && due.getTime() - now.getTime() > lead) continue;
    events.push({
      key: (due < now ? 'missed' : 'dose') + ':' + d.id,
      profile_id: m.profile_id,
      title: due < now ? 'Medication dose may have been missed' : 'Medication dose coming up',
      body:
        p.display_name +
        ' · ' +
        m.name +
        ' (' +
        m.dose +
        ') · ' +
        due.toLocaleString('en-IN', { timeZone: p.timezone || 'Asia/Kolkata' }),
    });
  }
  for (const a of appts || []) {
    const p: any = a.care_profiles,
      { data: prefs } = await db
        .from('notification_preferences')
        .select('email_enabled,appointment_lead_hours')
        .eq('profile_id', a.profile_id)
        .maybeSingle();
    if (prefs?.email_enabled === false) continue;
    const start = new Date(a.starts_at),
      lead = (prefs?.appointment_lead_hours || 24) * 3600000;
    if (start.getTime() - now.getTime() > lead) continue;
    events.push({
      key: 'appointment:' + a.id,
      profile_id: a.profile_id,
      title: 'Upcoming healthcare appointment',
      body:
        p.display_name +
        ' · ' +
        a.clinician_name +
        ' · ' +
        start.toLocaleString('en-IN', { timeZone: p.timezone || 'Asia/Kolkata' }),
    });
  }
  for (const e of events) {
    const { data: members } = await db
      .from('care_members')
      .select('user_id')
      .eq('profile_id', e.profile_id)
      .eq('status', 'active');
    for (const member of members || []) {
      const { data: u } = await db.auth.admin.getUserById(member.user_id),
        email = u.user?.email;
      if (!email) continue;
      const eventKey = e.key + ':' + member.user_id;
      const { data: existing } = await db
        .from('notification_deliveries')
        .select('id,status')
        .eq('event_key', eventKey)
        .maybeSingle();
      if (existing?.status === 'sent') {
        counts.skipped++;
        continue;
      }
      let deliveryId = existing?.id;
      if (existing) {
        await db
          .from('notification_deliveries')
          .update({ status: 'queued', error_message: null })
          .eq('id', existing.id);
      } else {
        const { data: delivery } = await db
          .from('notification_deliveries')
          .insert({
            profile_id: e.profile_id,
            event_key: eventKey,
            recipient_email: email,
            notification_type: e.title,
            status: 'queued',
          })
          .select('id')
          .maybeSingle();
        deliveryId = delivery?.id;
      }
      if (!deliveryId) {
        counts.skipped++;
        continue;
      }
      try {
        const resp = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + resend, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from,
              to: [email],
              subject: e.title,
              text:
                e.body +
                '\n\nPlease check the care workspace and confirm the status. Everkind is not medical advice.',
            }),
          }),
          payload = await resp.json();
        if (!resp.ok) throw new Error(payload.message || 'Email provider error');
        await db
          .from('notification_deliveries')
          .update({
            status: 'sent',
            provider_id: payload.id,
            sent_at: new Date().toISOString(),
            error_message: null,
          })
          .eq('id', deliveryId);
        counts.sent++;
      } catch (err) {
        await db
          .from('notification_deliveries')
          .update({ status: 'failed', error_message: String(err).slice(0, 400) })
          .eq('id', deliveryId);
        counts.failed++;
      }
    }
  }
  return out({ ok: true, events: events.length, ...counts });
});
