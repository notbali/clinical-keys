import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { todayISO } from '../lib/dates';
import { isDefaultPlan, normalizePlan, skippedDays, validatePlan, type ClassPlan } from '../lib/plan';
import { makeUsername, normalizeUsername, uniqueUsername } from '../lib/username';
import type { Api, EnrollRow, NewAttempt, Result, StudentPreview, StudentRecord } from './api';
import {
  DEFAULT_SETTINGS,
  type Attempt, type AuditEntry, type ClassGroup, type Enrollment, type GradeOverride, type Note, type Session, type Settings, type Student,
} from './types';

/* ---- Row types (snake_case, as the database stores them) and mappers ---- */
interface StudentRow { id: string; username: string; first_name: string; last_name: string; track: 'ma' | 'rx'; external_id: string | null; status: 'active' | 'archived'; created_at: string; archived_at: string | null; enrollments?: EnrollmentRow[] }
interface EnrollmentRow { id: string; student_id: string; class_id: string; start_date: string; exit_date: string | null }
interface ClassRow { id: string; name: string; status: 'active' | 'archived'; created_at: string; archived_at: string | null }
interface AttemptRow { id: string; student_id: string; kind: 'drill' | 'sprint'; track: 'ma' | 'rx'; drill_id: string | null; passage: number; day: number | null; act: number | null; wpm: number; accuracy: number | string; errors_left: number; seconds: number; completed: boolean; clean: boolean; revealed: boolean; created_at: string }

const toStudent = (r: StudentRow): Student => ({
  id: r.id, username: r.username, firstName: r.first_name, lastName: r.last_name, track: r.track,
  externalId: r.external_id ?? undefined, status: r.status, createdAt: r.created_at, archivedAt: r.archived_at ?? undefined,
});
const toEnrollment = (r: EnrollmentRow): Enrollment => ({ id: r.id, studentId: r.student_id, classId: r.class_id, startDate: r.start_date, exitDate: r.exit_date ?? undefined });
const latestEnrollment = (list: EnrollmentRow[] = []): EnrollmentRow | undefined => [...list].sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
const toRecord = (r: StudentRow): StudentRecord => {
  const e = latestEnrollment(r.enrollments);
  return { ...toStudent(r), enrollment: e ? toEnrollment(e) : undefined, classId: e?.class_id };
};
const toClass = (r: ClassRow): ClassGroup => ({ id: r.id, name: r.name, status: r.status, createdAt: r.created_at, archivedAt: r.archived_at ?? undefined });
const toAttempt = (r: AttemptRow): Attempt => ({
  id: r.id, studentId: r.student_id, kind: r.kind, track: r.track, drillId: r.drill_id ?? undefined, passage: r.passage,
  day: r.day ?? undefined, act: r.act ?? undefined, wpm: r.wpm, accuracy: Number(r.accuracy), errorsLeft: r.errors_left, seconds: r.seconds,
  completed: r.completed, clean: r.clean, revealed: r.revealed, createdAt: r.created_at,
});

const PAGE = 1000;

export function createSupabaseApi(arg: { url: string; anonKey: string } | SupabaseClient): Api {
  const db: SupabaseClient = 'auth' in arg
    ? arg
    : createClient(arg.url, arg.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });

  const fail = (what: string, e: { message: string } | null): never => { throw new Error(e ? `${what}: ${e.message}` : what); };

  /** Reads every page of a query (the server caps one response at 1000 rows). */
  async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, what: string): Promise<T[]> {
    const rows: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await build(from, from + PAGE - 1);
      if (error) fail(`Could not load ${what}`, error);
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) return rows;
    }
  }

  const userId = async (): Promise<string> => {
    const { data } = await db.auth.getUser();
    if (!data.user) throw new Error('Please sign in again.');
    return data.user.id;
  };
  const audit = async (action: string, subject: string, detail: string) => {
    await db.from('audit_log').insert({ actor_id: await userId(), action, subject, detail });
  };
  const nameOf = async (id: string): Promise<string> => {
    const { data } = await db.from('students').select('first_name,last_name').eq('id', id).maybeSingle();
    return data ? `${data.first_name} ${data.last_name}` : id;
  };

  const api: Api = {
    mode: 'supabase',

    async getSession(): Promise<Session | null> {
      const { data } = await db.auth.getSession();
      const user = data.session?.user;
      if (!user) return null;
      const inst = await db.from('instructors').select('name').eq('id', user.id).maybeSingle();
      if (inst.data) return { role: 'instructor', name: inst.data.name, email: user.email ?? '' };
      const stu = await db.from('students').select('id').maybeSingle();
      if (stu.data) return { role: 'student', studentId: stu.data.id };
      return null;
    },

    async lookupStudent(username): Promise<StudentPreview | null> {
      const { data, error } = await db.functions.invoke('student-login', { body: { username: normalizeUsername(username), preview: true } });
      if (error || !data || data.error) return null;
      return data as StudentPreview;
    },

    async signInStudent(username): Promise<Result> {
      const { data, error } = await db.functions.invoke('student-login', { body: { username: normalizeUsername(username) } });
      if (error || !data || data.error || !data.tokenHash) return { ok: false, error: data?.error ?? "We can't sign you in right now. Try again, or ask your instructor." };
      const v = await db.auth.verifyOtp({ token_hash: data.tokenHash, type: 'magiclink' });
      if (v.error) return { ok: false, error: "We can't sign you in right now. Try again, or ask your instructor." };
      return { ok: true, value: undefined };
    },

    async signInInstructor(email, password): Promise<Result> {
      const r = await db.auth.signInWithPassword({ email: email.trim(), password });
      if (r.error || !r.data.user) return { ok: false, error: 'That email and password did not work.' };
      const inst = await db.from('instructors').select('id').eq('id', r.data.user.id).maybeSingle();
      if (!inst.data) { await db.auth.signOut(); return { ok: false, error: 'That account is not an instructor account.' }; }
      return { ok: true, value: undefined };
    },

    async signOut() { await db.auth.signOut(); },

    async getSettings(): Promise<Settings> {
      const { data } = await db.auth.getSession();
      if (!data.session) return DEFAULT_SETTINGS;
      const row = await db.from('settings').select('data').maybeSingle();
      return { ...DEFAULT_SETTINGS, ...((row.data?.data as Partial<Settings>) ?? {}) };
    },
    async saveSettings(settings) {
      const owner = await userId();
      const { error } = await db.from('settings').upsert({ owner_id: owner, data: settings });
      if (error) fail('Could not save settings', error);
      await audit('settings', 'program', 'Updated targets, weights or closed days');
    },

    async getMe(): Promise<StudentRecord> {
      const { data, error } = await db.from('students').select('*, enrollments(*)').maybeSingle();
      if (error || !data) fail('Could not load your account', error);
      return toRecord(data as StudentRow);
    },

    async saveAttempt(a: NewAttempt): Promise<Attempt> {
      const { data, error } = await db.from('attempts').insert({
        kind: a.kind, track: a.track, drill_id: a.drillId ?? null, passage: a.passage, day: a.day ?? null, act: a.act ?? null,
        wpm: a.wpm, accuracy: a.accuracy, errors_left: a.errorsLeft, seconds: a.seconds, completed: a.completed, clean: a.clean, revealed: a.revealed,
        // The database overwrites these two for a signed-in student; the columns are required, so send placeholders.
        student_id: '00000000-0000-0000-0000-000000000000',
      }).select().single();
      if (error || !data) fail('Could not save the run', error);
      return toAttempt(data as AttemptRow);
    },

    async listAttempts(studentId) {
      const rows = await all<AttemptRow>((from, to) => {
        let q = db.from('attempts').select('*').order('created_at', { ascending: true }).range(from, to);
        if (studentId) q = q.eq('student_id', studentId);
        return q;
      }, 'runs');
      return rows.map(toAttempt);
    },

    async listOverrides(): Promise<GradeOverride[]> {
      const { data, error } = await db.from('grade_overrides').select('*');
      if (error) fail('Could not load grade overrides', error);
      return (data ?? []).map((o) => ({ studentId: o.student_id, value: o.value, reason: o.reason, by: o.set_by, at: o.set_at }));
    },

    async listClasses() {
      const { data, error } = await db.from('classes').select('*').order('created_at');
      if (error) fail('Could not load classes', error);
      return (data as ClassRow[]).map(toClass);
    },
    async createClass(name) {
      const owner = await userId();
      const { data, error } = await db.from('classes').insert({ owner_id: owner, name: name.trim() }).select().single();
      if (error || !data) fail('Could not create the class', error);
      await audit('class.create', name.trim(), 'Created class');
      return toClass(data as ClassRow);
    },
    async archiveClass(id) {
      const now = new Date().toISOString();
      const c = await db.from('classes').update({ status: 'archived', archived_at: now }).eq('id', id).select('name').single();
      if (c.error) fail('Could not archive the class', c.error);
      const enr = await db.from('enrollments').select('student_id').eq('class_id', id);
      const ids = (enr.data ?? []).map((e) => e.student_id);
      if (ids.length) {
        await db.from('students').update({ status: 'archived', archived_at: now }).in('id', ids).eq('status', 'active');
        await db.from('enrollments').update({ exit_date: todayISO() }).eq('class_id', id).is('exit_date', null);
      }
      await audit('class.archive', c.data?.name ?? id, 'Archived class and its students');
    },
    async restoreClass(id) {
      const c = await db.from('classes').update({ status: 'active', archived_at: null }).eq('id', id).select('name').single();
      if (c.error) fail('Could not restore the class', c.error);
      const enr = await db.from('enrollments').select('student_id').eq('class_id', id);
      const ids = (enr.data ?? []).map((e) => e.student_id);
      if (ids.length) {
        await db.from('students').update({ status: 'active', archived_at: null }).in('id', ids);
        await db.from('enrollments').update({ exit_date: null }).eq('class_id', id);
      }
      await audit('class.restore', c.data?.name ?? id, 'Restored class and its students');
    },
    async deleteClass(id) {
      const c = await db.from('classes').select('name').eq('id', id).maybeSingle();
      const { error } = await db.rpc('delete_class', { class_id: id });
      if (error) fail('Could not delete the class', error);
      await audit('class.delete', c.data?.name ?? id, 'Permanently deleted the class and its students');
    },

    async listStudents() {
      const rows = await all<StudentRow>((from, to) => db.from('students').select('*, enrollments(*)').order('last_name').range(from, to), 'students');
      return rows.map(toRecord);
    },

    async enroll(classId, rows: EnrollRow[]) {
      const owner = await userId();
      // Usernames are unique across the whole system, so check against every existing one.
      const existing = await all<{ username: string }>((from, to) => db.from('students').select('username').range(from, to), 'usernames');
      const taken = new Set(existing.map((e) => e.username));
      const out: StudentRecord[] = [];
      for (const r of rows) {
        let inserted: StudentRow | null = null;
        for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
          const username = uniqueUsername(makeUsername(r.firstName, r.lastName), taken);
          const res = await db.from('students').insert({ owner_id: owner, username, first_name: r.firstName.trim(), last_name: r.lastName.trim(), track: r.track }).select().single();
          if (res.error) {
            if (res.error.code === '23505') { taken.add(username); continue; } // someone else took it a moment ago
            fail(`Could not enroll ${r.firstName} ${r.lastName}`, res.error);
          }
          inserted = res.data as StudentRow;
          taken.add(username);
        }
        if (!inserted) throw new Error(`Could not find a free username for ${r.firstName} ${r.lastName}.`);
        const enr = await db.from('enrollments').insert({ student_id: inserted.id, class_id: classId, start_date: r.startDate }).select().single();
        if (enr.error || !enr.data) {
          await db.from('students').delete().eq('id', inserted.id); // do not leave a student with no enrollment
          fail(`Could not enroll ${r.firstName} ${r.lastName}`, enr.error);
        }
        out.push({ ...toStudent(inserted), enrollment: toEnrollment(enr.data as EnrollmentRow), classId });
        await audit('student.enroll', `${inserted.first_name} ${inserted.last_name}`, `Enrolled as ${inserted.username}`);
      }
      return out;
    },

    async updateStudent(id, patch) {
      const { startDate, classId, ...rest } = patch;
      const cols: Record<string, unknown> = {};
      if (rest.firstName !== undefined) cols.first_name = rest.firstName;
      if (rest.lastName !== undefined) cols.last_name = rest.lastName;
      if (rest.track !== undefined) cols.track = rest.track;
      if ('externalId' in rest) cols.external_id = rest.externalId ?? null;
      if (Object.keys(cols).length) {
        const { error } = await db.from('students').update(cols).eq('id', id);
        if (error) fail('Could not update the student', error);
      }
      if (startDate || classId) {
        const enr = await db.from('enrollments').select('id,start_date').eq('student_id', id).order('start_date', { ascending: false }).limit(1).maybeSingle();
        if (enr.data) {
          const upd: Record<string, unknown> = {};
          if (startDate) upd.start_date = startDate;
          if (classId) upd.class_id = classId;
          const { error } = await db.from('enrollments').update(upd).eq('id', enr.data.id);
          if (error) fail('Could not update the enrollment', error);
        }
      }
      await audit('student.update', await nameOf(id), Object.keys(patch).join(', '));
    },
    async exitStudent(id) {
      const { error } = await db.from('students').update({ status: 'archived', archived_at: new Date().toISOString() }).eq('id', id);
      if (error) fail('Could not exit the student', error);
      await db.from('enrollments').update({ exit_date: todayISO() }).eq('student_id', id).is('exit_date', null);
      await audit('student.exit', await nameOf(id), 'Exited and archived');
    },
    async restoreStudent(id) {
      const { error } = await db.from('students').update({ status: 'active', archived_at: null }).eq('id', id);
      if (error) fail('Could not restore the student', error);
      await db.from('enrollments').update({ exit_date: null }).eq('student_id', id);
      await audit('student.restore', await nameOf(id), 'Restored');
    },

    async listNotes(studentId): Promise<Note[]> {
      const { data, error } = await db.from('notes').select('*').eq('student_id', studentId).order('created_at', { ascending: false });
      if (error) fail('Could not load notes', error);
      return (data ?? []).map((n) => ({ id: n.id, studentId: n.student_id, text: n.body, at: n.created_at, by: 'Instructor' }));
    },
    async addNote(studentId, text): Promise<Note> {
      const author = await userId();
      const { data, error } = await db.from('notes').insert({ student_id: studentId, author_id: author, body: text.trim() }).select().single();
      if (error || !data) fail('Could not save the note', error);
      return { id: data.id, studentId: data.student_id, text: data.body, at: data.created_at, by: 'Instructor' };
    },
    async setOverride(studentId, value, reason) {
      if (!reason.trim()) throw new Error('A reason is required to override a grade.');
      const v = Math.max(0, Math.min(100, Math.round(value)));
      const { error } = await db.from('grade_overrides').upsert({ student_id: studentId, value: v, reason: reason.trim(), set_by: await userId(), set_at: new Date().toISOString() });
      if (error) fail('Could not save the override', error);
      await audit('grade.override', await nameOf(studentId), `Typing grade set to ${v}: ${reason.trim()}`);
    },
    async clearOverride(studentId) {
      const { error } = await db.from('grade_overrides').delete().eq('student_id', studentId);
      if (error) fail('Could not remove the override', error);
      await audit('grade.override.clear', await nameOf(studentId), 'Removed the override');
    },
    async listAudit(): Promise<AuditEntry[]> {
      const { data, error } = await db.from('audit_log').select('*').order('created_at', { ascending: false }).limit(200);
      if (error) fail('Could not load the change log', error);
      return (data ?? []).map((a) => ({ id: a.id, at: a.created_at, actor: 'Instructor', action: a.action, subject: a.subject, detail: a.detail }));
    },

    // UNTESTED against a real database (needs migration 0003_class_plan.sql). Row-level security lets a student read
    // only their own class's row and an instructor manage only their own classes' rows.
    async getClassPlan(classId): Promise<ClassPlan> {
      const { data, error } = await db.from('class_plans').select('days').eq('class_id', classId).maybeSingle();
      if (error) fail('Could not load the day plan', error);
      return normalizePlan(data ? { days: data.days } : undefined);
    },
    async setClassPlan(classId, plan) {
      const bad = validatePlan(plan);
      if (bad) throw new Error(bad);
      const c = await db.from('classes').select('name').eq('id', classId).maybeSingle();
      if (c.error || !c.data) throw new Error('Class not found.');
      if (isDefaultPlan(plan)) {
        const { error } = await db.from('class_plans').delete().eq('class_id', classId);
        if (error) fail('Could not reset the day plan', error);
      } else {
        const { error } = await db.from('class_plans').upsert({ class_id: classId, days: plan.days, updated_at: new Date().toISOString() });
        if (error) fail('Could not save the day plan', error);
      }
      const skipped = skippedDays(plan);
      await audit('class.plan', c.data.name, isDefaultPlan(plan) ? 'Reset to the default Day 1 to Day 10 plan'
        : `Teaching order ${plan.days.join(', ')}${skipped.length ? `; skipped Day ${skipped.join(', ')}` : ''}`);
    },
  };
  return api;
}
