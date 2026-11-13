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

  it('saves, reads and resets a class day plan, and keeps students from changing it', async () => {
    expect(await instructor.getClassPlan(classId)).toEqual({ days: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }); // none saved: the default
    await instructor.setClassPlan(classId, { days: [1, 2, 4, 3, 5, 6, 7, 8, 9] }); // Day 10 skipped, 3 and 4 swapped
    expect(await instructor.getClassPlan(classId)).toEqual({ days: [1, 2, 4, 3, 5, 6, 7, 8, 9] });
    expect(await student.getClassPlan(classId)).toEqual({ days: [1, 2, 4, 3, 5, 6, 7, 8, 9] }); // a student reads their own class's plan
    await expect(student.setClassPlan(classId, { days: [1] })).rejects.toThrow();
    await expect(instructor.setClassPlan(classId, { days: [1, 1] })).rejects.toThrow(); // repeated day
    await expect(instructor.setClassPlan(classId, { days: [] })).rejects.toThrow();
    await expect(instructor.setClassPlan(classId, { days: [1, 11] })).rejects.toThrow(); // no such day
    expect(await instructor.getClassPlan(classId)).toEqual({ days: [1, 2, 4, 3, 5, 6, 7, 8, 9] }); // bad saves changed nothing
    expect((await instructor.listAudit()).some((e) => e.action === 'class.plan')).toBe(true);
    await instructor.setClassPlan(classId, { days: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }); // saving the default clears the plan
    expect((await admin.from('class_plans').select('class_id').eq('class_id', classId)).data).toEqual([]);
    expect(await instructor.getClassPlan(classId)).toEqual({ days: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] });
    await instructor.setClassPlan(classId, { days: [2, 1, 3] }); // leave one saved, so deleting the class has to remove it
  });

  it('runs a class challenge round: open it, join it, one result each, only a first name and initial, then end it', async () => {
    const passages = { ma: { drillId: 'ma-gen-vitals', seed: 7, chartDate: '2026-11-12' } };
    await expect(student.createChallenge(classId, passages)).rejects.toThrow(); // only an instructor opens a round
    const first = await instructor.createChallenge(classId, passages);
    expect(first).toMatchObject({ classId, status: 'open', passages });
    expect((await student.getActiveChallenge())?.id).toBe(first.id); // the student's own class's open round
    expect((await instructor.getActiveChallenge(classId))?.id).toBe(first.id);

    const result = await student.submitChallengeResult(first.id, { wpm: 42, accuracy: 98, errorsLeft: 0, seconds: 61, revealed: false });
    expect(result).toMatchObject({ challengeId: first.id, studentId, track: 'ma', clean: true, displayName: 'Maya Z.' });
    await expect(student.submitChallengeResult(first.id, { wpm: 99, accuracy: 100, errorsLeft: 0, seconds: 30, revealed: false })).rejects.toThrow(); // one try only
    const shown = await instructor.listChallengeResults(first.id);
    expect(shown.map((r) => r.displayName)).toEqual(['Maya Z.']);
    expect(JSON.stringify(shown)).not.toContain(`Zq${rand}`); // the projector never gets the full last name
    expect((await student.listChallengeResults(first.id)).map((r) => r.id)).toEqual([result.id]);

    const second = await instructor.createChallenge(classId, passages); // a new round ends the old one
    expect((await instructor.getChallenge(first.id))?.status).toBe('ended');
    expect((await student.getActiveChallenge())?.id).toBe(second.id);
    await expect(student.endChallenge(second.id)).rejects.toThrow(); // students cannot end a round...
    expect((await instructor.getChallenge(second.id))?.status).toBe('open'); // ...and it really stayed open
    await instructor.endChallenge(second.id);
    expect((await instructor.getChallenge(second.id))?.status).toBe('ended');
    await expect(instructor.endChallenge(second.id)).resolves.toBeUndefined(); // ending it again does nothing
    await expect(student.submitChallengeResult(second.id, { wpm: 40, accuracy: 97, errorsLeft: 0, seconds: 60, revealed: false })).rejects.toThrow(); // a closed round takes no results
    expect(await student.getActiveChallenge()).toBeNull();
    await instructor.createChallenge(classId, passages); // leave one open, so deleting the class has to remove it
  });

  it('deletes a class together with its students and their runs', async () => {
    await instructor.deleteClass(classId);
    expect((await admin.from('class_plans').select('class_id').eq('class_id', classId)).data).toEqual([]);
    expect((await admin.from('challenges').select('id').eq('class_id', classId)).data).toEqual([]);
    expect((await instructor.listClasses()).some((c) => c.id === classId)).toBe(false);
    const { data } = await admin.from('students').select('id').eq('owner_id', instructorId);
    expect(data).toEqual([]);
    const att = await admin.from('attempts').select('id').eq('student_id', studentId);
    expect(att.data).toEqual([]);
  });
});
