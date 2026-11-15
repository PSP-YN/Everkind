import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const out = (x: unknown, s = 200) =>
  new Response(JSON.stringify(x), {
    status: s,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
async function sha(v: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
  return [...new Uint8Array(b)].map((n) => n.toString(16).padStart(2, '0')).join('');
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return out({ error: 'POST required' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!,
    anon = Deno.env.get('SUPABASE_ANON_KEY')!,
    key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    auth = req.headers.get('Authorization');
  if (!auth) return out({ error: 'Sign in first' }, 401);
  const client = createClient(url, anon, { global: { headers: { Authorization: auth } } }),
    {
      data: { user },
    } = await client.auth.getUser();
  if (!user) return out({ error: 'Invalid session' }, 401);
  let body: any;
  try {
    body = await req.json();
  } catch {
    return out({ error: 'Invalid request' }, 400);
  }
  if (
    typeof body.profile_id !== 'string' ||
    !['caregiver', 'family', 'care_recipient'].includes(body.role)
  )
    return out({ error: 'Invalid invitation details' }, 400);
  const { data: member } = await client
    .from('care_members')
    .select('role')
    .eq('profile_id', body.profile_id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (!member || !['owner', 'care_recipient', 'caregiver'].includes(member.role))
    return out({ error: 'You cannot invite members to this care profile' }, 403);
  const bytes = crypto.getRandomValues(new Uint8Array(8)),
    code =
      'EVER-' +
      [...bytes]
        .map((n) => n.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase(),
    admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await admin.from('care_invites').insert({
    profile_id: body.profile_id,
    code_hash: await sha(code),
    invited_email: typeof body.email === 'string' ? body.email.toLowerCase() : null,
    role: body.role,
    expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    created_by: user.id,
  });
  if (error) return out({ error: 'Could not create invitation' }, 500);
  return out({ ok: true, code, expires_in_hours: 48 });
});
