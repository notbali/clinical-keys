/**
 * Runs the Supabase adapter against a real (local) Supabase stack. Skipped unless these are set:
 *   SB_URL, SB_ANON, SB_SERVICE   (from `npx supabase status`; the local dev keys, never real ones)
 * Needs `npx supabase start` and `npx supabase functions serve` running.
 */
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSupabaseApi } from './supabaseApi';

const url = process.env.SB_URL;
const anon = process.env.SB_ANON;
const service = process.env.SB_SERVICE;
const enabled = !!(url && anon && service);

const fresh = () => createSupabaseApi(createClient(url!, anon!, { auth: { persistSession: false, autoRefreshToken: false } }));
const rand = Math.random().toString(36).slice(2, 8);

describe.skipIf(!enabled)('supabase adapter against a local stack', () => {
  const admin = enabled ? createClient(url!, service!, { auth: { persistSession: false } }) : (null as never);
  const email = `it-${rand}@test.invalid`;
  const password = `pw-${rand}-${rand}`;
  let instructorId = '';
  const instructor = enabled ? fresh() : (null as never);
  const student = enabled ? fresh() : (null as never);
  let username = '';
  let studentId = '';
  let classId = '';

  beforeAll(async () => {
    const u = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (u.error) throw u.error;
    instructorId = u.data.user.id;
    const r = await admin.from('instructors').insert({ id: instructorId, name: 'Integration Instructor' });
    if (r.error) throw r.error;
  });

  afterAll(async () => {
    if (!enabled) return;
    const students = await admin.from('students').select('auth_user_id').eq('owner_id', instructorId);
    await admin.from('students').delete().eq('owner_id', instructorId);
    for (const s of students.data ?? []) if (s.auth_user_id) await admin.auth.admin.deleteUser(s.auth_user_id);
    await admin.auth.admin.deleteUser(instructorId); // cascades to classes, settings, audit
  });

  it('rejects a student account at the instructor door and a wrong password', async () => {
    expect((await instructor.signInInstructor(email, 'wrong-password')).ok).toBe(false);
    expect((await instructor.signInInstructor(email, password)).ok).toBe(true);
    expect(await instructor.getSession()).toMatchObject({ role: 'instructor', name: 'Integration Instructor' });
  });

  it('creates a class and enrolls students with unique usernames', async () => {
    const c = await instructor.createClass(`Group ${rand}`);
    classId = c.id;
    const made = await instructor.enroll(classId, [
      { firstName: 'Maya', lastName: `Zq${rand}`, track: 'ma', startDate: '2026-11-09' },
      { firstName: 'Maya', lastName: `Zq${rand}`, track: 'ma', startDate: '2026-11-09' },
    ]);
    expect(made.map((m) => m.username)).toEqual([`zq${rand}maya`, `zq${rand}maya2`]);
    username = made[0].username;
    studentId = made[0].id;
    const list = await instructor.listStudents();
    expect(list.filter((s) => s.lastName === `Zq${rand}`)).toHaveLength(2);
    expect(list.find((s) => s.id === studentId)?.enrollment?.startDate).toBe('2026-11-09');
  });

  it('saves settings that the student can later read', async () => {
    const s = await instructor.getSettings();
    await instructor.saveSettings({ ...s, targets: { ...s.targets, ma: { wpm: 41, accuracy: 96 } }, blackboardUrl: 'https://example.test/bb' });
    expect((await instructor.getSettings()).targets.ma.wpm).toBe(41);
  });

  it('signs a student in with a username only, after a preview', async () => {
    expect(await student.lookupStudent('nobodyherexyz')).toBeNull();
    expect(await student.lookupStudent(` Zq${rand} Maya `)).toEqual({ firstName: 'Maya', lastInitial: 'Z', track: 'ma' });
    expect((await student.signInStudent('nobodyherexyz')).ok).toBe(false);
    expect((await student.signInStudent(username)).ok).toBe(true);
    expect(await student.getSession()).toMatchObject({ role: 'student', studentId });
    const me = await student.getMe();
    expect(me.username).toBe(username);
    expect(me.enrollment?.startDate).toBe('2026-11-09');
    expect((await student.getSettings()).targets.ma.wpm).toBe(41);
  });

  it('lets a student save runs only as themselves and read only their own data', async () => {
    const a = await student.saveAttempt({ kind: 'sprint', track: 'ma', passage: 0, wpm: 30, accuracy: 97.5, errorsLeft: 0, seconds: 60, completed: true, clean: true, revealed: false });
    expect(a.studentId).toBe(studentId);
    expect((await student.listAttempts()).map((x) => x.id)).toEqual([a.id]);
    expect(await student.listClasses()).toEqual([]);
    expect((await student.listStudents()).map((s) => s.id)).toEqual([studentId]);
    await expect(student.setOverride(studentId, 100, 'let me in')).rejects.toThrow();
    await expect(student.addNote(studentId, 'hi')).rejects.toThrow();
    await expect(student.createClass('hacked')).rejects.toThrow();
  });

  it('shows the instructor the student’s run, overrides, notes and the change log', async () => {
    expect((await instructor.listAttempts(studentId)).length).toBe(1);
    await expect(instructor.setOverride(studentId, 80, '  ')).rejects.toThrow();
    await instructor.setOverride(studentId, 80, 'Missed two days for a medical appointment');
    expect((await instructor.listOverrides()).find((o) => o.studentId === studentId)?.value).toBe(80);
    expect((await student.listOverrides())[0].value).toBe(80);
    await instructor.addNote(studentId, 'Doing well');
    expect((await instructor.listNotes(studentId)).map((n) => n.text)).toEqual(['Doing well']);
    expect(await student.listNotes(studentId)).toEqual([]);
    expect((await instructor.listAudit()).some((e) => e.action === 'grade.override')).toBe(true);
    await instructor.clearOverride(studentId);
    expect(await instructor.listOverrides()).toEqual([]);
  });

  it('blocks sign-in for an archived class and allows it again after restore', async () => {
    await instructor.archiveClass(classId);
    const locked = fresh();
    expect(await locked.lookupStudent(username)).toBeNull();
    expect((await locked.signInStudent(username)).ok).toBe(false);
    await instructor.restoreClass(classId);
    expect((await fresh().signInStudent(username)).ok).toBe(true);
  });

  it('deletes a class together with its students and their runs', async () => {
    await instructor.deleteClass(classId);
    expect((await instructor.listClasses()).some((c) => c.id === classId)).toBe(false);
    const { data } = await admin.from('students').select('id').eq('owner_id', instructorId);
    expect(data).toEqual([]);
    const att = await admin.from('attempts').select('id').eq('student_id', studentId);
    expect(att.data).toEqual([]);
  });
});
