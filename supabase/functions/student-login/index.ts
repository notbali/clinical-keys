// Student sign-in for a passwordless, username-only classroom.
//
// POST { username }                 -> { tokenHash }   (the browser then calls auth.verifyOtp to get a session)
// POST { username, preview: true }  -> { firstName, lastInitial, track }   (for the "Is this you?" step)
//
// Runs with the service role. The browser never reads the students table before it has a session.
// Unknown, archived and rate-limited usernames all look the same to the caller, so usernames cannot be probed.
import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*';
const WINDOW_MINUTES = 10;
// A whole classroom can share one school IP, so the limit per address is generous.
const MAX_FAILURES_PER_CLIENT = 40;

const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Same rule as normalizeUsername in src/lib/username.ts.
const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const NOT_FOUND = { error: "We can't find that username. Check the spelling, or ask your instructor." };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: { username?: unknown; preview?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'Send JSON.' }, 400); }
  const username = typeof body.username === 'string' ? normalize(body.username).slice(0, 64) : '';
  if (!username) return json(NOT_FOUND, 404);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const client = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();

  // Rate limit failed guesses per client address.
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { count } = await admin.from('login_attempts').select('id', { count: 'exact', head: true })
    .eq('client', client).eq('ok', false).gte('created_at', since);
  if ((count ?? 0) >= MAX_FAILURES_PER_CLIENT) return json({ error: 'Too many tries. Wait a few minutes, then try again.' }, 429);

  const { data: student } = await admin.from('students')
    .select('id, first_name, last_name, track, auth_user_id').eq('username', username).eq('status', 'active').maybeSingle();
  if (!student) {
    await admin.from('login_attempts').insert({ client, username, ok: false });
    return json(NOT_FOUND, 404);
  }

  if (body.preview === true) {
    return json({ firstName: student.first_name, lastInitial: String(student.last_name).slice(0, 1).toUpperCase(), track: student.track });
  }

  // Make sure the student has an auth user to hold their session.
  const email = `${student.id}@students.invalid`;
  if (!student.auth_user_id) {
    const created = await admin.auth.admin.createUser({ email, email_confirm: true, password: crypto.randomUUID() + crypto.randomUUID() });
    if (created.error || !created.data.user) return json({ error: 'Could not start your session. Tell your instructor.' }, 500);
    const { error } = await admin.from('students').update({ auth_user_id: created.data.user.id }).eq('id', student.id).is('auth_user_id', null);
    if (error) return json({ error: 'Could not start your session. Tell your instructor.' }, 500);
  }

  // A one-time token the browser exchanges for a session with auth.verifyOtp({ token_hash, type: 'magiclink' }).
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error || !link.data.properties?.hashed_token) return json({ error: 'Could not start your session. Tell your instructor.' }, 500);

  await admin.from('login_attempts').insert({ client, username, ok: true });
  return json({ tokenHash: link.data.properties.hashed_token });
});
