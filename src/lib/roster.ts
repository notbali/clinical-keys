import { parseLooseDate, type ISODate } from './dates';
import { makeUsername, uniqueUsername } from './username';
import type { Track } from '../content/types';

export type RosterStatus = 'ready' | 'confirm' | 'error';

export interface RosterRow {
  line: number;
  raw: string;
  firstName: string;
  lastName: string;
  track: Track | null;
  startDate: ISODate;
  username: string;
  status: RosterStatus;
  message: string;
}

export interface ExistingPerson { username: string; firstName: string; lastName: string }

const TRACKS: Record<string, Track> = { ma: 'ma', 'medical assistant': 'ma', pt: 'rx', rx: 'rx', 'pharmacy tech': 'rx', 'pharmacy technician': 'rx' };

/**
 * Parses pasted lines like "Noah Bennett, PT, Nov 13".
 * Name is required. Track must be MA or PT. Date is optional (defaults to `defaultStart`).
 * A name that matches someone already enrolled needs the instructor's confirmation.
 */
export function parseRoster(text: string, existing: ExistingPerson[], defaultStart: ISODate, today: ISODate): RosterRow[] {
  const taken = new Set(existing.map((e) => e.username));
  const sameName = (f: string, l: string) =>
    existing.some((e) => e.firstName.toLowerCase() === f.toLowerCase() && e.lastName.toLowerCase() === l.toLowerCase());
  const rows: RosterRow[] = [];

  text.split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim()) return;
    const parts = raw.split(',').map((p) => p.trim());
    const nameParts = parts[0].split(/\s+/).filter(Boolean);
    const firstName = nameParts.slice(0, -1).join(' ');
    const lastName = nameParts.length ? nameParts[nameParts.length - 1] : '';
    const track = parts[1] ? TRACKS[parts[1].toLowerCase()] ?? null : null;
    const dateText = parts[2] ?? '';
    const parsed = dateText ? parseLooseDate(dateText, today) : defaultStart;

    const row: RosterRow = {
      line: i + 1, raw, firstName, lastName, track, startDate: parsed ?? defaultStart,
      username: '', status: 'ready', message: 'Ready',
    };

    if (!firstName || !lastName) {
      Object.assign(row, { status: 'error', message: 'Enter a first and last name.' });
    } else if (!track) {
      Object.assign(row, { status: 'error', message: 'Choose Medical Assistant (MA) or Pharmacy Tech (PT).' });
    } else if (!parsed) {
      Object.assign(row, { status: 'error', message: `Can't read the date "${dateText}". Try Nov 13 or 11/13.` });
    } else {
      const base = makeUsername(firstName, lastName);
      if (!base) {
        Object.assign(row, { status: 'error', message: 'The name needs at least one letter or number.' });
      } else {
        row.username = uniqueUsername(base, taken);
        taken.add(row.username);
        if (sameName(firstName, lastName)) {
          Object.assign(row, {
            status: 'confirm',
            message: `Someone named ${firstName} ${lastName} is already enrolled. Confirm this is a different person.`,
          });
        }
      }
    }
    rows.push(row);
  });
  return rows;
}
