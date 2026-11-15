import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.119.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const out = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

async function sha(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return out({ error: 'POST required' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = req.headers.get('Authorization');
  if (!url || !anon || !serviceRole) return out({ error: 'Server configuration error' }, 500);
  if (!authorization) return out({ error: 'Sign in first' }, 401);

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  const user = authData.user;
  if (authError || !user) return out({ error: 'Invalid session' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return out({ error: 'Invalid request body' }, 400);
  }

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const roles = ['caregiver', 'family', 'care_recipient'];
  if (
    typeof body.profile_id !== 'string' ||
    !uuidPattern.test(body.profile_id) ||
    typeof body.role !== 'string' ||
    !roles.includes(body.role)
  ) {
    return out({ error: 'Invalid invitation details' }, 400);
  }

  let invitedEmail: string | null = null;
  if (body.email !== undefined && body.email !== null && body.email !== '') {
    if (typeof body.email !== 'string') return out({ error: 'Invalid email address' }, 400);
    invitedEmail = body.email.trim().toLowerCase();
    if (invitedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitedEmail)) {
      return out({ error: 'Invalid email address' }, 400);
    }
  }

  const { data: member, error: memberError } = await userClient
    .from('care_members')
    .select('role')
    .eq('profile_id', body.profile_id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (memberError || !member || !['owner', 'care_recipient', 'caregiver'].includes(member.role)) {
    return out({ error: 'You cannot invite members to this care profile' }, 403);
  }

  const admin = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: rateLimitError } = await admin
    .from('care_invites')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', user.id)
    .gte('created_at', windowStart);
  if (rateLimitError) return out({ error: 'Could not verify invitation limit' }, 500);
  if ((count || 0) >= 10) return out({ error: 'Invitation limit reached. Try again later.' }, 429);

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const code =
    'EVER-' +
    [...bytes]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  const { error: insertError } = await admin.from('care_invites').insert({
    profile_id: body.profile_id,
    code_hash: await sha(code),
    invited_email: invitedEmail,
    role: body.role,
    expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    created_by: user.id,
  });
  if (insertError) return out({ error: 'Could not create invitation' }, 500);
  return out({ ok: true, code, expires_in_hours: 48 });
});
