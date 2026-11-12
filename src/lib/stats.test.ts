import { describe, expect, it } from 'vitest';
import { byProgramDay, lastActiveAt, latestDay, streak, totalSeconds } from './stats';
import { at, attempt } from '../test/fixtures';

// Thu Nov 12 2026. Wed = 11, Tue = 10, Mon = 9, Fri = 6, Sat = 7, Sun = 8, next Mon = 16.
const ran = (...dates: string[]) => dates.map((d) => attempt({ createdAt: at(d) }));
const none = new Set<string>();

describe('streak', () => {
  it('is 0 with no finished runs', () => {
    expect(streak([], '2026-11-12', none)).toBe(0);
  });
  it('counts consecutive school days ending today', () => {
    expect(streak(ran('2026-11-12', '2026-11-11', '2026-11-10'), '2026-11-12', none)).toBe(3);
  });
  it('does not break just because today has no run yet', () => {
    expect(streak(ran('2026-11-11', '2026-11-10'), '2026-11-12', none)).toBe(2);
  });
  it('breaks on a missed school day', () => {
    expect(streak(ran('2026-11-12', '2026-11-10'), '2026-11-12', none)).toBe(1);
  });
  it('skips weekends instead of breaking on them', () => {
    // Monday the 16th, with runs on Monday and the Friday before (the 13th); the weekend in between does not break it.
    expect(streak(ran('2026-11-16', '2026-11-13'), '2026-11-16', none)).toBe(2);
  });
  it('skips closed days instead of breaking on them', () => {
    expect(streak(ran('2026-11-12', '2026-11-10'), '2026-11-12', new Set(['2026-11-11']))).toBe(2);
  });
  it('only counts finished runs', () => {
    const attempts = [attempt({ createdAt: at('2026-11-12') }), attempt({ createdAt: at('2026-11-11'), completed: false, clean: false })];
    expect(streak(attempts, '2026-11-12', none)).toBe(1);
  });
  it('counts several runs on one day as one day', () => {
    expect(streak(ran('2026-11-12', '2026-11-12', '2026-11-12'), '2026-11-12', none)).toBe(1);
  });
  it('still works when today is a weekend', () => {
    // Saturday: the streak ending Friday carries over.
    expect(streak(ran('2026-11-06', '2026-11-05'), '2026-11-07', none)).toBe(2);
  });
});

describe('byProgramDay', () => {
  it('takes the best WPM and the average accuracy for each program day, in order', () => {
    const list = byProgramDay([
      attempt({ day: 2, wpm: 26, accuracy: 94 }),
      attempt({ day: 1, wpm: 24, accuracy: 93 }),
      attempt({ day: 2, wpm: 28, accuracy: 96 }),
    ]);
    expect(list).toEqual([
      { day: 1, wpm: 24, accuracy: 93 },
      { day: 2, wpm: 28, accuracy: 95 },
    ]);
  });
  it('ignores free practice (no program day) and runs that were not finished', () => {
    const list = byProgramDay([
      attempt({ day: undefined, wpm: 50 }),
      attempt({ day: 3, wpm: 40, completed: false, clean: false }),
      attempt({ day: 3, wpm: 22 }),
    ]);
    expect(list).toEqual([{ day: 3, wpm: 22, accuracy: 97 }]);
  });
  it('rounds accuracy to one decimal', () => {
    expect(byProgramDay([attempt({ day: 1, accuracy: 96.1 }), attempt({ day: 1, accuracy: 97.2 }), attempt({ day: 1, accuracy: 97.2 })])[0].accuracy).toBe(96.8);
  });
  it('is empty with no runs', () => {
    expect(byProgramDay([])).toEqual([]);
  });
});

describe('latestDay', () => {
  it('is null when nothing was finished', () => {
    expect(latestDay([])).toBeNull();
    expect(latestDay([attempt({ completed: false, clean: false })])).toBeNull();
  });
  it('summarizes only the most recent day', () => {
    const r = latestDay([
      attempt({ createdAt: at('2026-11-10'), wpm: 50, accuracy: 99 }),
      attempt({ createdAt: at('2026-11-12', 9), wpm: 29, accuracy: 96 }),
      attempt({ createdAt: at('2026-11-12', 14), wpm: 31, accuracy: 98 }),
    ]);
    expect(r).toEqual({ date: '2026-11-12', wpm: 31, accuracy: 97 });
  });
});

describe('small helpers', () => {
  it('finds the latest activity time and total typing seconds', () => {
    const a = [attempt({ createdAt: at('2026-11-10'), seconds: 60 }), attempt({ createdAt: at('2026-11-12'), seconds: 90 })];
    expect(lastActiveAt(a)).toBe(at('2026-11-12'));
    expect(lastActiveAt([])).toBeNull();
    expect(totalSeconds(a)).toBe(150);
    expect(totalSeconds([])).toBe(0);
  });
});
