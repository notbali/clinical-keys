import { describe, expect, it } from 'vitest';
import { addDays, dateOfProgramDay, isSchoolDay, parseLooseDate, programDay } from './dates';
import { makeUsername, normalizeUsername, uniqueUsername } from './username';
import { parseRoster } from './roster';
import { toCsv } from './csv';
import { computeTypingGrade } from './grades';
import { assignedThrough } from './program';
import type { Attempt } from '../data/types';
import { DEFAULT_SETTINGS } from '../data/types';

describe('school days', () => {
  it('skips weekends and closed days when counting program days', () => {
    // Mon Nov 9 2026 is Day 1; Thu Nov 12 is Day 4.
    expect(programDay('2026-11-09', '2026-11-12')).toBe(4);
    // Fri Nov 13 = 5; Sat/Sun do not add days; Mon Nov 16 = 6.
    expect(programDay('2026-11-09', '2026-11-15')).toBe(5);
    expect(programDay('2026-11-09', '2026-11-16')).toBe(6);
    expect(programDay('2026-11-09', '2026-11-16', new Set(['2026-11-11']))).toBe(5);
  });
  it('starts Day 1 on the next school day when the start date is a weekend', () => {
    expect(programDay('2026-11-14', '2026-11-16')).toBe(1);
    expect(dateOfProgramDay('2026-11-14', 1)).toBe('2026-11-16');
  });
  it('is 0 before the start and finds the exit date', () => {
    expect(programDay('2026-11-20', '2026-11-12')).toBe(0);
    expect(dateOfProgramDay('2026-11-09', 10)).toBe('2026-11-20');
    expect(isSchoolDay('2026-11-14')).toBe(false);
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
  });
  it('reads loose dates', () => {
    expect(parseLooseDate('Nov 13', '2026-11-12')).toBe('2026-11-13');
    expect(parseLooseDate('11/13', '2026-11-12')).toBe('2026-11-13');
    expect(parseLooseDate('2026-11-13', '2026-11-12')).toBe('2026-11-13');
    expect(parseLooseDate('tomorrow', '2026-11-12')).toBe('2026-11-13');
    expect(parseLooseDate('Feb 30', '2026-11-12')).toBeNull();
    expect(parseLooseDate('soon', '2026-11-12')).toBeNull();
  });
});

describe('usernames', () => {
  it('builds last name then first name', () => {
    expect(makeUsername('Maya', 'Santos')).toBe('santosmaya');
    expect(makeUsername('José', "O'Neil")).toBe('oneiljose');
    expect(makeUsername('Mary Ann', 'Lee-Smith')).toBe('leesmithmaryann');
  });
  it('adds numbers for duplicates', () => {
    expect(uniqueUsername('santosmaya', new Set(['santosmaya']))).toBe('santosmaya2');
    expect(uniqueUsername('santosmaya', new Set(['santosmaya', 'santosmaya2']))).toBe('santosmaya3');
  });
  it('forgives how a student types it', () => {
    expect(normalizeUsername(' Santos Maya ')).toBe('santosmaya');
  });
});

describe('roster paste', () => {
  const existing = [{ username: 'santosmaya', firstName: 'Maya', lastName: 'Santos' }];
  const rows = parseRoster(
    'Noah Bennett, PT, Nov 13\nSofia Alvarez, MA\nMaya Santos, MA, Nov 13\nJordan Lee, Nov 13\n\nBad Date, MA, someday',
    existing, '2026-11-13', '2026-11-12',
  );
  it('parses ready rows and fills the default date', () => {
    expect(rows[0]).toMatchObject({ username: 'bennettnoah', track: 'rx', startDate: '2026-11-13', status: 'ready' });
    expect(rows[1]).toMatchObject({ username: 'alvarezsofia', track: 'ma', startDate: '2026-11-13', status: 'ready' });
  });
  it('asks for confirmation on a repeated name and numbers the username', () => {
    expect(rows[2]).toMatchObject({ username: 'santosmaya2', status: 'confirm' });
  });
  it('flags rows with a missing track or unreadable date', () => {
    expect(rows[3].status).toBe('error');
    expect(rows[4].status).toBe('error');
    expect(rows).toHaveLength(5);
  });
});

describe('csv', () => {
  it('quotes commas and guards against spreadsheet formulas', () => {
    expect(toCsv([['a,b', 'say "hi"', '=SUM(A1)', 12, null]])).toBe('"a,b","say ""hi""",\'=SUM(A1),12,\r\n');
  });
});

const attempt = (over: Partial<Attempt>): Attempt => ({
  id: Math.random().toString(36), studentId: 's1', kind: 'sprint', track: 'ma', passage: 0,
  wpm: 29, accuracy: 97, errorsLeft: 0, seconds: 60, completed: true, clean: true, revealed: false,
  createdAt: '2026-11-12T12:36:00Z', ...over,
});

describe('typing grade', () => {
  it('combines 97% accuracy, 29 of 35 WPM and 7 of 8 activities into a grade of 91', () => {
    const assigned = assignedThrough('ma', 4);
    // Days 1 to 4 have 8 real activities (the tests are still "coming soon").
    expect(assigned).toHaveLength(8);
    // Complete 7 of the 8 (every passage clean) and leave the last one unfinished.
    const attempts: Attempt[] = [];
    let t = 0;
    assigned.slice(0, 7).forEach((a) => {
      a.passages.forEach((p) => {
        attempts.push(attempt({ day: a.day, act: a.act, passage: p, createdAt: `2026-11-1${t++ % 10}T12:00:00Z`, accuracy: 97, wpm: 29 }));
      });
    });
    const g = computeTypingGrade({ attempts, track: 'ma', day: 4, settings: DEFAULT_SETTINGS });
    expect(g.completion).toEqual({ done: 7, total: 8 });
    expect(g.accuracyScore).toBe(100);
    expect(g.speedScore).toBe(83);
    expect(g.completionScore).toBe(88);
    expect(g.computed).toBe(91);
  });
  it('has no grade before any runs, and shows an override instead of the computed value', () => {
    expect(computeTypingGrade({ attempts: [], track: 'ma', day: 1, settings: DEFAULT_SETTINGS }).total).toBeNull();
    const g = computeTypingGrade({
      attempts: [attempt({})], track: 'ma', day: 1, settings: DEFAULT_SETTINGS,
      override: { studentId: 's1', value: 80, reason: 'Missed time for a medical appointment', by: 'x', at: 'now' },
    });
    expect(g.total).toBe(80);
    expect(g.computed).not.toBe(80);
  });
  it('averages the last three finished runs, clean or not, and ignores runs with errors left', () => {
    const attempts = [
      attempt({ accuracy: 70, createdAt: '2026-11-09T10:00:00Z', completed: false, clean: false, errorsLeft: 4 }),
      attempt({ accuracy: 96, createdAt: '2026-11-10T11:00:00Z' }),
      attempt({ accuracy: 98, createdAt: '2026-11-11T11:00:00Z' }),
      attempt({ accuracy: 97, createdAt: '2026-11-12T11:00:00Z' }),
      attempt({ accuracy: 90, createdAt: '2026-11-12T12:00:00Z', clean: false }), // finished, just under 95%
      attempt({ accuracy: 50, createdAt: '2026-11-12T13:00:00Z', completed: false, clean: false, revealed: true }),
    ];
    const g = computeTypingGrade({ attempts, track: 'ma', day: 3, settings: DEFAULT_SETTINGS });
    expect(g.accuracyAvg).toBe(95); // 98, 97 and 90
  });
  it('gives partial credit to a student who finishes everything but never reaches 95%', () => {
    const attempts = [
      attempt({ accuracy: 88, wpm: 25, clean: false, createdAt: '2026-11-11T11:00:00Z' }),
      attempt({ accuracy: 89, wpm: 24, clean: false, createdAt: '2026-11-12T11:00:00Z' }),
      attempt({ accuracy: 90, wpm: 26, clean: false, createdAt: '2026-11-12T12:00:00Z' }),
    ];
    const g = computeTypingGrade({ attempts, track: 'ma', day: 2, settings: DEFAULT_SETTINGS });
    expect(g.accuracyAvg).toBe(89);
    expect(g.accuracyScore).toBe(94); // 89 / 95
    expect(g.bestWpm).toBe(26);
    expect(g.speedScore).toBe(74); // 26 / 35
    expect(g.computed).toBeGreaterThan(0);
  });
  it('scores 0 on accuracy and speed only when no run was ever finished', () => {
    const g = computeTypingGrade({
      attempts: [attempt({ completed: false, clean: false, errorsLeft: 5, accuracy: 60, wpm: 40 })], track: 'ma', day: 1, settings: DEFAULT_SETTINGS,
    });
    expect(g.accuracyAvg).toBeNull();
    expect(g.bestWpm).toBeNull();
    expect(g.accuracyScore).toBe(0);
    expect(g.speedScore).toBe(0);
    expect(g.computed).toBe(0); // has attempts, so a grade exists, and it is 0
  });
});
