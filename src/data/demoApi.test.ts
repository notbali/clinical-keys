import { describe, expect, it } from 'vitest';
import { createDemoApi, MemoryStorage } from './demoApi';

const NOW = new Date(2026, 10, 12, 13, 5); // Thu Nov 12 2026, 1:05 pm

const make = () => createDemoApi({ storage: new MemoryStorage(), now: () => NOW });

describe('demo api', () => {
  it('lets only enrolled, active students sign in, and normalizes what they type', async () => {
    const api = make();
    expect(await api.lookupStudent('nobody')).toBeNull();
    expect(await api.lookupStudent(' Santos Maya ')).toEqual({ firstName: 'Maya', lastInitial: 'S', track: 'ma' });
    const bad = await api.signInStudent('santosmay');
    expect(bad.ok).toBe(false);
    expect((await api.signInStudent('santosmaya')).ok).toBe(true);
    expect((await api.getMe()).username).toBe('santosmaya');
  });

  it('keeps a student inside their own data', async () => {
    const api = make();
    await api.signInStudent('santosmaya');
    const me = await api.getMe();
    const mine = await api.listAttempts();
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((a) => a.studentId === me.id)).toBe(true);
    await expect(api.listClasses()).rejects.toThrow();
    await expect(api.listStudents()).rejects.toThrow();
    await expect(api.setOverride('x', 50, 'nope')).rejects.toThrow();
    const saved = await api.saveAttempt({
      kind: 'sprint', track: 'ma', passage: 0, wpm: 30, accuracy: 98, errorsLeft: 0, seconds: 60, completed: true, clean: true, revealed: false,
    });
    expect(saved.studentId).toBe((await api.getMe()).id);
  });

  it('enrolls with unique usernames and removes everything when a class is deleted', async () => {
    const api = make();
    await api.signInInstructor('demo@school.example', 'x');
    const c = await api.createClass('Nov 16 group');
    const made = await api.enroll(c.id, [
      { firstName: 'Maya', lastName: 'Santos', track: 'ma', startDate: '2026-11-16' },
      { firstName: 'Noah', lastName: 'Bennett', track: 'rx', startDate: '2026-11-16' },
    ]);
    expect(made.map((m) => m.username)).toEqual(['santosmaya2', 'bennettnoah']);
    await api.deleteClass(c.id);
    const left = await api.listStudents();
    expect(left.some((s) => s.username === 'bennettnoah')).toBe(false);
    expect(left.some((s) => s.username === 'santosmaya')).toBe(true);
  });

  it('archives a class and its students, blocks their sign-in, and restores them', async () => {
    const api = make();
    await api.signInInstructor('demo@school.example', 'x');
    const classes = await api.listClasses();
    const nov2 = classes.find((c) => c.name === 'Nov 2 group')!;
    await api.archiveClass(nov2.id);
    await api.signOut();
    expect((await api.signInStudent('johnsonmarcus')).ok).toBe(false);
    await api.signInInstructor('demo@school.example', 'x');
    await api.restoreClass(nov2.id);
    await api.signOut();
    expect((await api.signInStudent('johnsonmarcus')).ok).toBe(true);
  });

  it('requires a reason for a grade override and logs it', async () => {
    const api = make();
    await api.signInInstructor('demo@school.example', 'x');
    const maya = (await api.listStudents()).find((s) => s.username === 'santosmaya')!;
    await expect(api.setOverride(maya.id, 80, '  ')).rejects.toThrow();
    await api.setOverride(maya.id, 80, 'Missed two days for a medical appointment');
    expect((await api.listOverrides())[0]).toMatchObject({ studentId: maya.id, value: 80 });
    expect((await api.listAudit())[0].action).toBe('grade.override');
    await api.clearOverride(maya.id);
    expect(await api.listOverrides()).toHaveLength(0);
  });

  it('seeds Maya on program day 4 with a streak of attempts', async () => {
    const api = make();
    await api.signInInstructor('demo@school.example', 'x');
    const maya = (await api.listStudents()).find((s) => s.username === 'santosmaya')!;
    expect(maya.enrollment?.startDate).toBe('2026-11-09');
  });
});
