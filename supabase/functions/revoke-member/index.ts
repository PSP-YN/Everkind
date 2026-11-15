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
  if (typeof body.member_id !== 'string' || !uuidPattern.test(body.member_id)) {
    return out({ error: 'Invalid member id' }, 400);
  }

  const { data: target, error: targetError } = await userClient
    .from('care_members')
    .select('id,profile_id,user_id,role,status')
    .eq('id', body.member_id)
    .maybeSingle();
  if (targetError || !target) return out({ error: 'Member not found' }, 404);
  if (target.status !== 'active') return out({ error: 'Member access is already inactive' }, 409);

  const { data: caller, error: callerError } = await userClient
    .from('care_members')
    .select('role')
    .eq('profile_id', target.profile_id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (callerError || !caller || !['owner', 'care_recipient', 'caregiver'].includes(caller.role)) {
    return out({ error: 'You cannot manage this care circle' }, 403);
  }
  if (target.role === 'owner') return out({ error: 'The profile owner cannot be removed' }, 409);
  if (target.user_id === user.id) {
    return out({ error: 'Use account settings to leave this care circle' }, 409);
  }

  const admin = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: revoked, error: revokeError } = await admin
    .from('care_members')
    .update({ status: 'revoked' })
    .eq('id', target.id)
    .eq('status', 'active')
    .select('id')
    .maybeSingle();
  if (revokeError) return out({ error: 'Could not revoke access' }, 500);
  if (!revoked) return out({ error: 'Member access changed before revocation completed' }, 409);
  return out({ ok: true });
});
