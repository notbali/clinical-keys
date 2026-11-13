import { useMemo } from 'react';
import { useApi, useAsync, useSession } from './context';
import { buildMetrics } from '../lib/metrics';
import { defaultPlan, type ClassPlan } from '../lib/plan';

/** Loads every student with their runs and computes grades, days and flags for the instructor screens. */
export function useRoster() {
  const api = useApi();
  const { settings } = useSession();
  const loaded = useAsync(async () => {
    const [students, attempts, overrides, classes] = await Promise.all([api.listStudents(), api.listAttempts(), api.listOverrides(), api.listClasses()]);
    // Each class's day plan (default when none was saved). A failed plan load must not hide the roster.
    const plans: Record<string, ClassPlan> = {};
    await Promise.all(classes.map(async (c) => { plans[c.id] = await api.getClassPlan(c.id).catch(() => defaultPlan()); }));
    return { students, attempts, overrides, classes, plans };
  }, [api]);
  const metrics = useMemo(
    () => (loaded.data ? buildMetrics({ students: loaded.data.students, attempts: loaded.data.attempts, overrides: loaded.data.overrides, settings, plans: loaded.data.plans }) : []),
    [loaded.data, settings],
  );
  return { ...loaded, metrics, classes: loaded.data?.classes ?? [], plans: loaded.data?.plans ?? {}, settings };
}
