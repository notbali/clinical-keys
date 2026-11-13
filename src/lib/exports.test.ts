import { describe, expect, it } from 'vitest';
import { gradesCsv } from './exports';
import { buildMetrics } from './metrics';
import { DEFAULT_SETTINGS } from '../data/types';
import { at, attempt, completeActivities, student } from '../test/fixtures';

const metrics = (students: ReturnType<typeof student>[], attempts: ReturnType<typeof attempt>[] = [], today = '2026-11-12') =>
  buildMetrics({ students, attempts, overrides: [], settings: DEFAULT_SETTINGS, today });
const lines = (csv: string) => csv.trimEnd().split('\r\n');

describe('gradesCsv', () => {
  it('has the columns an instructor needs to line up with the Blackboard gradebook', () => {
    expect(lines(gradesCsv([]))[0]).toBe(
      'Last Name,First Name,Username,Blackboard Username,Track,Program Day,Typing Grade,Overridden,Accuracy (last 3 finished runs),Best WPM,Activities Done,Activities Assigned,Last Active',
    );
  });
  it('uses CRLF line endings and ends with a newline', () => {
    const csv = gradesCsv(metrics([student()]));
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.includes('\n') && csv.split('\r\n').length).toBe(3); // header, one row, trailing empty
  });
  it('writes a student’s values in column order', () => {
    const done = completeActivities('s1', 'ma', 4, 6, { wpm: 29, accuracy: 97, createdAt: at('2026-11-12', 13, 5) });
    const row = lines(gradesCsv(metrics([student({ externalId: 'msantos' })], done)))[1].split(',');
    expect(row.slice(0, 5)).toEqual(['Santos', 'Maya', 'santosmaya', 'msantos', 'Medical Assistant']);
    expect(row[5]).toBe('4');
    expect(Number(row[6])).toBeGreaterThan(0);
    expect(row[7]).toBe('No');
    expect(row[8]).toBe('97');
    expect(row[9]).toBe('29');
    expect(row.slice(10, 12)).toEqual(['6', '8']);
    expect(row[12]).toBe(at('2026-11-12', 13, 5));
  });
  it('leaves grade, accuracy, speed and last active blank for a student with no runs, and shows the track name', () => {
    const row = lines(gradesCsv(metrics([student({ track: 'rx', startDate: '2026-11-12' })])))[1].split(',');
    expect(row[4]).toBe('Pharmacy Tech');
    expect(row[6]).toBe('');
    expect(row[8]).toBe('');
    expect(row[9]).toBe('');
    expect(row[12]).toBe('');
    expect(row[3]).toBe(''); // no Blackboard username yet
  });
  it('caps the program day between 1 and 10', () => {
    const day = (start: string) => lines(gradesCsv(metrics([student({ startDate: start })])))[1].split(',')[5];
    expect(day('2026-10-01')).toBe('10'); // long past Day 10
    expect(day('2026-11-20')).toBe('1'); // not started yet
  });
  it('marks an override', () => {
    const m = buildMetrics({ students: [student()], attempts: [attempt()], overrides: [{ studentId: 's1', value: 80, reason: 'x', by: 'y', at: 'z' }], settings: DEFAULT_SETTINGS, today: '2026-11-12' });
    const row = lines(gradesCsv(m))[1].split(',');
    expect(row[6]).toBe('80');
    expect(row[7]).toBe('Yes');
  });
  it('quotes names with commas and defuses a name that starts like a spreadsheet formula', () => {
    const csv = gradesCsv(metrics([student({ lastName: 'Smith, Jr.', firstName: '=HYPERLINK("x")' })]));
    const row = lines(csv)[1];
    expect(row.startsWith('"Smith, Jr.",')).toBe(true);
    expect(row).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
