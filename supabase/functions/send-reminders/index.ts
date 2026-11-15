import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.119.0';

type ReminderEvent = {
  key: string;
  profile_id: string;
  title: string;
  body: string;
};

const out = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const chunks = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return out({ error: 'POST required' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRole) return out({ error: 'Server configuration error' }, 500);

  const db = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: valid, error: authError } = await db.rpc('validate_reminder_secret', {
    p_secret: req.headers.get('x-cron-secret') || '',
  });
  if (authError || valid !== true) return out({ error: 'Unauthorized' }, 401);

  const resend = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('REMINDER_FROM_EMAIL');
  if (!resend || !from) return out({ error: 'Email provider not configured' }, 503);

  const now = new Date();
  const counts = { sent: 0, skipped: 0, failed: 0 };
  const [doseResult, appointmentResult] = await Promise.all([
    db
      .from('medication_doses')
      .select(
        'id,due_at,medications!inner(id,name,dose,profile_id,care_profiles!inner(display_name,timezone))',
      )
      .eq('status', 'pending')
      .lte('due_at', new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString())
      .order('due_at')
      .limit(300),
    db
      .from('appointments')
      .select('id,clinician_name,starts_at,profile_id,care_profiles!inner(display_name,timezone)')
      .eq('status', 'scheduled')
      .gte('starts_at', now.toISOString())
      .lte('starts_at', new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString())
      .order('starts_at')
      .limit(200),
  ]);
  if (doseResult.error) return out({ error: 'Could not read dose schedule' }, 500);
  if (appointmentResult.error) return out({ error: 'Could not read appointments' }, 500);

  const doses = doseResult.data || [];
  const appointments = appointmentResult.data || [];
  const profileIds = [
    ...new Set([
      ...doses.map((dose: any) => dose.medications.profile_id),
      ...appointments.map((appointment: any) => appointment.profile_id),
    ]),
  ];
  if (!profileIds.length) return out({ ok: true, events: 0, ...counts });

  const [preferenceResult, memberResult] = await Promise.all([
    db
      .from('notification_preferences')
      .select(
        'profile_id,email_enabled,dose_lead_minutes,appointment_lead_hours,missed_dose_delay_minutes',
      )
      .in('profile_id', profileIds),
    db
      .from('care_members')
      .select('profile_id,user_id')
      .in('profile_id', profileIds)
      .eq('status', 'active'),
  ]);
  if (preferenceResult.error) return out({ error: 'Could not read reminder preferences' }, 500);
  if (memberResult.error) return out({ error: 'Could not read care recipients' }, 500);

  const preferences = new Map(
    (preferenceResult.data || []).map((preference: any) => [preference.profile_id, preference]),
  );
  const membersByProfile = new Map<string, string[]>();
  for (const member of memberResult.data || []) {
    const ids = membersByProfile.get(member.profile_id) || [];
    ids.push(member.user_id);
    membersByProfile.set(member.profile_id, ids);
  }

  const events: ReminderEvent[] = [];
  for (const dose of doses) {
    const medication: any = dose.medications;
    const careProfile: any = medication.care_profiles;
    const preference: any = preferences.get(medication.profile_id);
    if (preference?.email_enabled === false) continue;

    const due = new Date(dose.due_at);
    const missedDelay = (preference?.missed_dose_delay_minutes ?? 30) * 60 * 1000;
    const leadTime = (preference?.dose_lead_minutes ?? 15) * 60 * 1000;
    if (due < now && now.getTime() - due.getTime() < missedDelay) continue;
    if (due > now && due.getTime() - now.getTime() > leadTime) continue;

    events.push({
      key: (due < now ? 'missed' : 'dose') + ':' + dose.id,
      profile_id: medication.profile_id,
      title: due < now ? 'Medication dose may have been missed' : 'Medication dose coming up',
      body:
        careProfile.display_name +
        ' · ' +
        medication.name +
        ' (' +
        medication.dose +
        ') · ' +
        due.toLocaleString('en-IN', {
          timeZone: careProfile.timezone || 'Asia/Kolkata',
        }),
    });
  }

  for (const appointment of appointments) {
    const careProfile: any = appointment.care_profiles;
    const preference: any = preferences.get(appointment.profile_id);
    if (preference?.email_enabled === false) continue;

    const startsAt = new Date(appointment.starts_at);
    const leadTime = (preference?.appointment_lead_hours ?? 24) * 60 * 60 * 1000;
    if (startsAt.getTime() - now.getTime() > leadTime) continue;

    events.push({
      key: 'appointment:' + appointment.id,
      profile_id: appointment.profile_id,
      title: 'Upcoming healthcare appointment',
      body:
        careProfile.display_name +
        ' · ' +
        appointment.clinician_name +
        ' · ' +
        startsAt.toLocaleString('en-IN', {
          timeZone: careProfile.timezone || 'Asia/Kolkata',
        }),
    });
  }

  const recipientPairs = events.flatMap((event) =>
    (membersByProfile.get(event.profile_id) || []).map((userId) => ({
      event,
      userId,
      eventKey: event.key + ':' + userId,
    })),
  );
  if (!recipientPairs.length) return out({ ok: true, events: events.length, ...counts });

  const userIds = [...new Set(recipientPairs.map((recipient) => recipient.userId))];
  const emailByUserId = new Map<string, string>();
  for (const batch of chunks(userIds, 10)) {
    const users = await Promise.all(
      batch.map(async (userId) => {
        const { data, error } = await db.auth.admin.getUserById(userId);
        return { userId, email: error ? undefined : data.user?.email };
      }),
    );
    for (const result of users) {
      if (result.email) emailByUserId.set(result.userId, result.email);
    }
  }

  const eligibleRecipients = recipientPairs.flatMap((recipient) => {
    const email = emailByUserId.get(recipient.userId);
    return email ? [{ ...recipient, email }] : [];
  });
  counts.skipped += recipientPairs.length - eligibleRecipients.length;
  if (!eligibleRecipients.length) return out({ ok: true, events: events.length, ...counts });

  const eventKeys = eligibleRecipients.map((recipient) => recipient.eventKey);
  for (const batch of chunks(eventKeys, 100)) {
    const rows = eligibleRecipients
      .filter((recipient) => batch.includes(recipient.eventKey))
      .map((recipient) => ({
        profile_id: recipient.event.profile_id,
        event_key: recipient.eventKey,
        recipient_email: recipient.email,
        notification_type: recipient.event.title,
        status: 'queued',
      }));
    const { error } = await db
      .from('notification_deliveries')
      .upsert(rows, { onConflict: 'event_key', ignoreDuplicates: true });
    if (error) counts.failed += rows.length;
  }

  const deliveryByEventKey = new Map<string, { id: string; status: string }>();
  for (const batch of chunks(eventKeys, 100)) {
    const { data, error } = await db
      .from('notification_deliveries')
      .select('id,event_key,status')
      .in('event_key', batch);
    if (error) {
      counts.failed += batch.length;
      continue;
    }
    for (const delivery of data || []) {
      deliveryByEventKey.set(delivery.event_key, { id: delivery.id, status: delivery.status });
    }
  }

  const retryIds = [...deliveryByEventKey.values()]
    .filter((delivery) => delivery.status !== 'sent')
    .map((delivery) => delivery.id);
  for (const batch of chunks(retryIds, 100)) {
    const { error } = await db
      .from('notification_deliveries')
      .update({ status: 'queued', error_message: null })
      .in('id', batch);
    if (error) counts.failed += batch.length;
  }

  for (const recipient of eligibleRecipients) {
    const delivery = deliveryByEventKey.get(recipient.eventKey);
    if (!delivery) {
      counts.skipped++;
      continue;
    }
    if (delivery.status === 'sent') {
      counts.skipped++;
      continue;
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + resend,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [recipient.email],
          subject: recipient.event.title,
          text:
            recipient.event.body +
            '\n\nPlease check the care workspace and confirm the status. Everkind is not medical advice.',
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Email provider error');

      const { error: updateError } = await db
        .from('notification_deliveries')
        .update({
          status: 'sent',
          provider_id: payload.id,
          sent_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', delivery.id);
      if (updateError) throw new Error('Could not persist delivery status');
      counts.sent++;
    } catch (error) {
      await db
        .from('notification_deliveries')
        .update({ status: 'failed', error_message: String(error).slice(0, 400) })
        .eq('id', delivery.id);
      counts.failed++;
    }
  }

  return out({ ok: true, events: events.length, recipients: eligibleRecipients.length, ...counts });
});
