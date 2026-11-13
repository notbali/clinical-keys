import { normalizeUsername, uniqueUsername, makeUsername } from '../lib/username';
import { todayISO } from '../lib/dates';
import { isDefaultPlan, normalizePlan, skippedDays, validatePlan, type ClassPlan } from '../lib/plan';
import type { Api, EnrollRow, NewAttempt, Result, StudentPreview, StudentRecord } from './api';
import { buildSeed } from './seed';
import {
  DEFAULT_SETTINGS,
  type Attempt, type AuditEntry, type ClassGroup, type Enrollment, type GradeOverride, type Note, type Session, type Settings, type Student,
} from './types';

interface DemoState {
  version: 1;
  classes: ClassGroup[];
  students: Student[];
  enrollments: Enrollment[];
  attempts: Attempt[];
  overrides: GradeOverride[];
  notes: Note[];
  audit: AuditEntry[];
  settings: Settings;
  session: Session | null;
  /** Class day plans by class id. Missing in demo state saved before plans existed. */
  plans?: Record<string, ClassPlan>;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY = 'ck-demo-v1';
const INSTRUCTOR = 'Demo Instructor';

/** In-memory storage for tests and for browsers that block localStorage. */
export class MemoryStorage implements StorageLike {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

let counter = 0;
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function createDemoApi(opts: { storage?: StorageLike; now?: () => Date } = {}): Api & { reset(): void } {
  const now = opts.now ?? (() => new Date());
  let storage: StorageLike = opts.storage ?? new MemoryStorage();
  if (!opts.storage) {
    try {
      storage = window.localStorage;
      storage.setItem('ck-probe', '1');
      storage.removeItem('ck-probe');
    } catch {
      storage = new MemoryStorage();
    }
  }

  const fresh = (): DemoState => ({ version: 1, ...buildSeed(now()), overrides: [], audit: [], settings: DEFAULT_SETTINGS, session: null });
  const load = (): DemoState => {
    try {
      const raw = storage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw) as DemoState;
        if (s.version === 1) return s;
      }
    } catch { /* fall through to a fresh demo */ }
    const s = fresh();
    save(s);
    return s;
  };
  const save = (s: DemoState) => { try { storage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or blocked */ } };
  // Errors become rejected promises, like a network call would.
  const read = <T,>(fn: (s: DemoState) => T): Promise<T> => {
    try { return Promise.resolve(fn(load())); } catch (e) { return Promise.reject(e); }
  };
  const write = <T,>(fn: (s: DemoState) => T): Promise<T> => {
    try {
      const s = load();
      const out = fn(s);
      save(s);
      return Promise.resolve(out);
    } catch (e) { return Promise.reject(e); }
  };
  const log = (s: DemoState, action: string, subject: string, detail: string) =>
    s.audit.unshift({ id: uid('audit'), at: now().toISOString(), actor: INSTRUCTOR, action, subject, detail });

  const requireInstructor = (s: DemoState) => { if (s.session?.role !== 'instructor') throw new Error('Instructor sign-in required.'); };
  const requireStudent = (s: DemoState) => { if (s.session?.role !== 'student') throw new Error('Student sign-in required.'); return s.session.studentId; };
  const record = (s: DemoState, st: Student): StudentRecord => {
    const enr = s.enrollments.filter((e) => e.studentId === st.id).sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
    return { ...st, enrollment: enr, classId: enr?.classId };
  };

  const api: Api & { reset(): void } = {
    mode: 'demo',
    reset() { save(fresh()); },

    getSession: () => read((s) => s.session),

    lookupStudent: (typed) => read((s): StudentPreview | null => {
      const u = normalizeUsername(typed);
      const st = s.students.find((x) => x.username === u && x.status === 'active');
      return st ? { firstName: st.firstName, lastInitial: st.lastName.slice(0, 1).toUpperCase(), track: st.track } : null;
    }),

    signInStudent: (typed) => write((s): Result => {
      const u = normalizeUsername(typed);
      const st = s.students.find((x) => x.username === u && x.status === 'active');
      if (!st) return { ok: false, error: "We can't find that username. Check the spelling, or ask your instructor." };
      s.session = { role: 'student', studentId: st.id };
      return { ok: true, value: undefined };
    }),

    signInInstructor: (email, password) => write((s): Result => {
      if (!email.trim() || !password) return { ok: false, error: 'Enter your email and password.' };
      s.session = { role: 'instructor', name: INSTRUCTOR, email: email.trim() };
      return { ok: true, value: undefined };
    }),

    signOut: () => write((s) => { s.session = null; }),

    getSettings: () => read((s) => s.settings),
    saveSettings: (settings) => write((s) => { requireInstructor(s); s.settings = settings; log(s, 'settings', 'program', 'Updated targets, weights or closed days'); }),

    getMe: () => read((s) => {
      const id = requireStudent(s);
      return record(s, s.students.find((x) => x.id === id)!);
    }),

    saveAttempt: (a: NewAttempt) => write((s) => {
      const studentId = requireStudent(s);
      const attempt: Attempt = { ...a, id: uid('att'), studentId, createdAt: now().toISOString() };
      s.attempts.push(attempt);
      return attempt;
    }),

    listAttempts: (studentId) => read((s) => {
      if (s.session?.role === 'student') return s.attempts.filter((a) => a.studentId === (s.session as { studentId: string }).studentId);
      requireInstructor(s);
      return studentId ? s.attempts.filter((a) => a.studentId === studentId) : s.attempts;
    }),

    listOverrides: () => read((s) => {
      if (s.session?.role === 'student') return s.overrides.filter((o) => o.studentId === (s.session as { studentId: string }).studentId);
      requireInstructor(s);
      return s.overrides;
    }),

    listClasses: () => read((s) => { requireInstructor(s); return s.classes; }),
    createClass: (name) => write((s) => {
      requireInstructor(s);
      const c: ClassGroup = { id: uid('class'), name: name.trim(), status: 'active', createdAt: now().toISOString() };
      s.classes.push(c);
      log(s, 'class.create', c.name, 'Created class');
      return c;
    }),
    archiveClass: (id) => write((s) => {
      requireInstructor(s);
      const c = s.classes.find((x) => x.id === id); if (!c) return;
      c.status = 'archived'; c.archivedAt = now().toISOString();
      const today = todayISO(now());
      for (const e of s.enrollments.filter((x) => x.classId === id)) {
        const st = s.students.find((x) => x.id === e.studentId);
        if (st && st.status === 'active') { st.status = 'archived'; st.archivedAt = c.archivedAt; e.exitDate = today; }
      }
      log(s, 'class.archive', c.name, 'Archived class and its students');
    }),
    restoreClass: (id) => write((s) => {
      requireInstructor(s);
      const c = s.classes.find((x) => x.id === id); if (!c) return;
      c.status = 'active'; delete c.archivedAt;
      for (const e of s.enrollments.filter((x) => x.classId === id)) {
        const st = s.students.find((x) => x.id === e.studentId);
        if (st) { st.status = 'active'; delete st.archivedAt; delete e.exitDate; }
      }
      log(s, 'class.restore', c.name, 'Restored class and its students');
    }),
    deleteClass: (id) => write((s) => {
      requireInstructor(s);
      const c = s.classes.find((x) => x.id === id); if (!c) return;
      const ids = new Set(s.enrollments.filter((e) => e.classId === id).map((e) => e.studentId));
      s.students = s.students.filter((x) => !ids.has(x.id));
      s.enrollments = s.enrollments.filter((e) => e.classId !== id);
      s.attempts = s.attempts.filter((a) => !ids.has(a.studentId));
      s.notes = s.notes.filter((n) => !ids.has(n.studentId));
      s.overrides = s.overrides.filter((o) => !ids.has(o.studentId));
      s.classes = s.classes.filter((x) => x.id !== id);
      if (s.plans) delete s.plans[id];
      log(s, 'class.delete', c.name, `Permanently deleted the class and ${ids.size} students`);
    }),

    listStudents: () => read((s) => { requireInstructor(s); return s.students.map((st) => record(s, st)); }),

    enroll: (classId, rows: EnrollRow[]) => write((s) => {
      requireInstructor(s);
      if (!s.classes.some((c) => c.id === classId)) throw new Error('Class not found.');
      const taken = new Set(s.students.map((x) => x.username));
      const created: StudentRecord[] = [];
      for (const r of rows) {
        const username = uniqueUsername(makeUsername(r.firstName, r.lastName), taken);
        taken.add(username);
        const st: Student = {
          id: uid('student'), username, firstName: r.firstName.trim(), lastName: r.lastName.trim(), track: r.track,
          status: 'active', createdAt: now().toISOString(),
        };
        const enr: Enrollment = { id: uid('enr'), studentId: st.id, classId, startDate: r.startDate };
        s.students.push(st); s.enrollments.push(enr);
        created.push({ ...st, enrollment: enr, classId });
        log(s, 'student.enroll', `${st.firstName} ${st.lastName}`, `Enrolled as ${username}`);
      }
      return created;
    }),

    updateStudent: (id, patch) => write((s) => {
      requireInstructor(s);
      const st = s.students.find((x) => x.id === id); if (!st) return;
      const { startDate, classId, ...rest } = patch;
      Object.assign(st, rest);
      const enr = s.enrollments.filter((e) => e.studentId === id).sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
      if (enr && startDate) enr.startDate = startDate;
      if (enr && classId) enr.classId = classId;
      log(s, 'student.update', `${st.firstName} ${st.lastName}`, Object.keys(patch).join(', '));
    }),
    exitStudent: (id) => write((s) => {
      requireInstructor(s);
      const st = s.students.find((x) => x.id === id); if (!st) return;
      st.status = 'archived'; st.archivedAt = now().toISOString();
      for (const e of s.enrollments.filter((x) => x.studentId === id)) e.exitDate = todayISO(now());
      log(s, 'student.exit', `${st.firstName} ${st.lastName}`, 'Exited and archived');
    }),
    restoreStudent: (id) => write((s) => {
      requireInstructor(s);
      const st = s.students.find((x) => x.id === id); if (!st) return;
      st.status = 'active'; delete st.archivedAt;
      for (const e of s.enrollments.filter((x) => x.studentId === id)) delete e.exitDate;
      log(s, 'student.restore', `${st.firstName} ${st.lastName}`, 'Restored');
    }),

    listNotes: (studentId) => read((s) => { requireInstructor(s); return s.notes.filter((n) => n.studentId === studentId).sort((a, b) => b.at.localeCompare(a.at)); }),
    addNote: (studentId, text) => write((s) => {
      requireInstructor(s);
      const n: Note = { id: uid('note'), studentId, text: text.trim(), at: now().toISOString(), by: INSTRUCTOR };
      s.notes.push(n);
      return n;
    }),
    setOverride: (studentId, value, reason) => write((s) => {
      requireInstructor(s);
      if (!reason.trim()) throw new Error('A reason is required to override a grade.');
      const v = Math.max(0, Math.min(100, Math.round(value)));
      s.overrides = s.overrides.filter((o) => o.studentId !== studentId);
      s.overrides.push({ studentId, value: v, reason: reason.trim(), by: INSTRUCTOR, at: now().toISOString() });
      const st = s.students.find((x) => x.id === studentId);
      log(s, 'grade.override', st ? `${st.firstName} ${st.lastName}` : studentId, `Typing grade set to ${v}: ${reason.trim()}`);
    }),
    clearOverride: (studentId) => write((s) => {
      requireInstructor(s);
      s.overrides = s.overrides.filter((o) => o.studentId !== studentId);
      const st = s.students.find((x) => x.id === studentId);
      log(s, 'grade.override.clear', st ? `${st.firstName} ${st.lastName}` : studentId, 'Removed the override');
    }),
    listAudit: () => read((s) => { requireInstructor(s); return s.audit; }),

    getClassPlan: (classId) => read((s) => {
      if (s.session?.role === 'student') {
        const sid = s.session.studentId;
        if (!s.enrollments.some((e) => e.studentId === sid && e.classId === classId)) throw new Error('Class not found.');
      } else {
        requireInstructor(s);
        if (!s.classes.some((c) => c.id === classId)) throw new Error('Class not found.');
      }
      return normalizePlan(s.plans?.[classId]);
    }),
    setClassPlan: (classId, plan) => write((s) => {
      requireInstructor(s);
      const c = s.classes.find((x) => x.id === classId);
      if (!c) throw new Error('Class not found.');
      const bad = validatePlan(plan);
      if (bad) throw new Error(bad);
      s.plans = s.plans ?? {}; // saved demo state from before plans existed has no `plans`
      if (isDefaultPlan(plan)) delete s.plans[classId];
      else s.plans[classId] = { days: [...plan.days] };
      const skipped = skippedDays(plan);
      log(s, 'class.plan', c.name, isDefaultPlan(plan) ? 'Reset to the default Day 1 to Day 10 plan'
        : `Teaching order ${plan.days.join(', ')}${skipped.length ? `; skipped Day ${skipped.join(', ')}` : ''}`);
    }),
  };
  return api;
}
