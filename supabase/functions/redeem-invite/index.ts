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
  const normalized = value.trim().toUpperCase();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
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
  if (typeof body.code !== 'string') return out({ error: 'Invalid invitation code' }, 400);

  const code = body.code.trim().toUpperCase();
  if (!/^EVER-(?:[0-9A-F]{16}|[0-9A-F]{32})$/.test(code)) {
    return out({ error: 'Invalid invitation code' }, 400);
  }

  const admin = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: found, error: lookupError } = await admin
    .from('care_invites')
    .select('id,profile_id,role,invited_email')
    .eq('code_hash', await sha(code))
    .is('redeemed_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (lookupError || !found) {
    return out({ error: 'Invitation is invalid, expired or already used' }, 404);
  }

  if (found.invited_email && found.invited_email.toLowerCase() !== user.email?.toLowerCase()) {
    return out({ error: 'This invitation belongs to another email address' }, 403);
  }

  const redeemedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await admin
    .from('care_invites')
    .update({ redeemed_at: redeemedAt })
    .eq('id', found.id)
    .is('redeemed_at', null)
    .select('id')
    .maybeSingle();
  if (claimError) return out({ error: 'Could not claim invitation' }, 500);
  if (!claimed) return out({ error: 'Invitation was already redeemed' }, 409);

  const { error: insertError } = await admin
    .from('care_members')
    .upsert(
      { profile_id: found.profile_id, user_id: user.id, role: found.role, status: 'active' },
      { onConflict: 'profile_id,user_id' },
    );
  if (insertError) {
    await admin
      .from('care_invites')
      .update({ redeemed_at: null })
      .eq('id', found.id)
      .eq('redeemed_at', redeemedAt);
    return out(
      { error: 'Could not create care membership; the invitation remains available' },
      500,
    );
  }

  return out({ ok: true, profile_id: found.profile_id, role: found.role });
});
