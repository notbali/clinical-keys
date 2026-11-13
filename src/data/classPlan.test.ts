import { describe, expect, it } from 'vitest';
import { createDemoApi, MemoryStorage } from './demoApi';
import { defaultPlan } from '../lib/plan';

const NOW = new Date(2026, 10, 12, 13, 5);
const make = (storage = new MemoryStorage()) => ({ storage, api: createDemoApi({ storage, now: () => NOW }) });
const SKIP3 = { days: [1, 2, 4, 5, 6, 7, 8, 9, 10] };

async function instructorWithClass() {
  const ctx = make();
  await ctx.api.signInInstructor('demo@school.example', 'x');
  const cls = await ctx.api.createClass('Plan group');
  return { ...ctx, cls };
}

describe('demo api: class plan', () => {
  it('gives a class with no plan the default plan', async () => {
    const { api, cls } = await instructorWithClass();
    expect(await api.getClassPlan(cls.id)).toEqual(defaultPlan());
  });

  it('saves a plan and returns it', async () => {
    const { api, cls } = await instructorWithClass();
    await api.setClassPlan(cls.id, SKIP3);
    expect(await api.getClassPlan(cls.id)).toEqual(SKIP3);
    await api.setClassPlan(cls.id, { days: [1, 2, 3, 5, 4, 6, 7, 8, 9, 10] });
    expect((await api.getClassPlan(cls.id)).days).toEqual([1, 2, 3, 5, 4, 6, 7, 8, 9, 10]);
  });

  it('keeps plans per class', async () => {
    const { api, cls } = await instructorWithClass();
    const other = await api.createClass('Other');
    await api.setClassPlan(cls.id, SKIP3);
    expect(await api.getClassPlan(other.id)).toEqual(defaultPlan());
  });

  it('resets to the default plan', async () => {
    const { api, cls } = await instructorWithClass();
    await api.setClassPlan(cls.id, SKIP3);
    await api.setClassPlan(cls.id, defaultPlan());
    expect(await api.getClassPlan(cls.id)).toEqual(defaultPlan());
  });

  it('rejects an invalid plan and an unknown class, and stores nothing', async () => {
    const { api, cls } = await instructorWithClass();
    await expect(api.setClassPlan(cls.id, { days: [1, 1] })).rejects.toThrow();
    await expect(api.setClassPlan(cls.id, { days: [] })).rejects.toThrow();
    await expect(api.setClassPlan(cls.id, { days: [11] })).rejects.toThrow();
    await expect(api.setClassPlan('nope', SKIP3)).rejects.toThrow(/not found/i);
    await expect(api.getClassPlan('nope')).rejects.toThrow(/not found/i);
    expect(await api.getClassPlan(cls.id)).toEqual(defaultPlan());
  });

  it('writes a change-log entry', async () => {
    const { api, cls } = await instructorWithClass();
    await api.setClassPlan(cls.id, SKIP3);
    const audit = await api.listAudit();
    expect(audit[0]).toMatchObject({ action: 'class.plan', subject: 'Plan group' });
    expect(audit[0].detail).toMatch(/skip/i);
  });

  it('is removed with the class', async () => {
    const { api, cls, storage } = await instructorWithClass();
    await api.setClassPlan(cls.id, SKIP3);
    await api.deleteClass(cls.id);
    expect(storage.getItem('ck-demo-v1')).not.toContain(cls.id);
  });

  it('lets a student read their own class plan but never write it or read another class', async () => {
    const { api, cls } = await instructorWithClass();
    await api.signOut();
    await api.signInStudent('santosmaya');
    const me = await api.getMe();
    expect(me.classId).toBeTruthy();
    await expect(api.setClassPlan(me.classId!, SKIP3)).rejects.toThrow();
    await expect(api.getClassPlan(cls.id)).rejects.toThrow();
    expect(await api.getClassPlan(me.classId!)).toEqual(defaultPlan());

    await api.signOut();
    await api.signInInstructor('demo@school.example', 'x');
    await api.setClassPlan(me.classId!, SKIP3);
    await api.signOut();
    await api.signInStudent('santosmaya');
    expect(await api.getClassPlan(me.classId!)).toEqual(SKIP3);
  });

  it('requires a sign-in', async () => {
    const { api, cls } = await instructorWithClass();
    await api.signOut();
    await expect(api.getClassPlan(cls.id)).rejects.toThrow();
    await expect(api.setClassPlan(cls.id, SKIP3)).rejects.toThrow();
  });

  it('works on demo state saved before plans existed', async () => {
    const { api, cls, storage } = await instructorWithClass();
    await api.setClassPlan(cls.id, SKIP3);
    const saved = JSON.parse(storage.getItem('ck-demo-v1')!);
    delete saved.plans;
    storage.setItem('ck-demo-v1', JSON.stringify(saved));
    const old = createDemoApi({ storage, now: () => NOW });
    expect(await old.getClassPlan(cls.id)).toEqual(defaultPlan());
    await old.setClassPlan(cls.id, SKIP3);
    expect(await old.getClassPlan(cls.id)).toEqual(SKIP3);
  });
});
