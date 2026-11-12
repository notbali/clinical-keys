#!/usr/bin/env node
// Creates an instructor account. Usage (keys come from the environment, never from files in the repo):
//   SB_URL=... SB_SERVICE=... node scripts/create-instructor.mjs you@school.example "A Strong Password" "Your Name"
import { createClient } from '@supabase/supabase-js';

const [email, password, name = 'Instructor'] = process.argv.slice(2);
const { SB_URL, SB_SERVICE } = process.env;
if (!SB_URL || !SB_SERVICE || !email || !password) {
  console.error('Usage: SB_URL=... SB_SERVICE=... node scripts/create-instructor.mjs <email> <password> [name]');
  process.exit(1);
}
const admin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });
const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (user.error) { console.error(user.error.message); process.exit(1); }
const row = await admin.from('instructors').insert({ id: user.data.user.id, name });
if (row.error) { console.error(row.error.message); process.exit(1); }
console.log(`Created instructor ${email}`);
