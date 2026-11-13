import type { Track } from '../content/types';

export interface BlockRow {
  time: string;
  name: string;
  minutes: number;
  /** "25 min", as shown. */
  mins: string;
  /** Built and usable today. The rest are planned. */
  built: boolean;
  /** The drill this row opens. */
  drillId?: string;
  /** Another page this row opens. */
  to?: string;
}

/** The afternoon typing block, 12:35 to 3:30. A suggested schedule: nothing enforces the times. Nothing in it needs sound. */
const ROWS: { time: string; name: string; minutes: number; built: boolean; hunt?: boolean; to?: string }[] = [
  { time: '12:35', name: 'Warm-up sprint', minutes: 10, built: true },
  { time: '12:45', name: 'Today’s skill drill', minutes: 35, built: true },
  { time: '1:20', name: 'Error hunt', minutes: 25, built: true, hunt: true },
  { time: '1:45', name: 'Stretch break', minutes: 10, built: true, to: '/stretch' },
  { time: '1:55', name: 'Shift simulation', minutes: 30, built: true, to: '/shift' },
  { time: '2:25', name: 'Practice library', minutes: 25, built: true, to: '/drills' },
  { time: '2:50', name: 'Chart entry forms', minutes: 25, built: true, to: '/forms' },
  { time: '3:15', name: 'Class challenge', minutes: 15, built: true, to: '/challenge' },
];

export const typingBlock = (track: Track): BlockRow[] =>
  ROWS.map(({ hunt, to, ...r }) => ({ ...r, mins: `${r.minutes} min`, ...(hunt ? { drillId: `${track}-hunt` } : {}), ...(to ? { to } : {}) }));

/** Today's passage of a daily drill: one per program day, starting over when the passages run out. Always inside the drill. */
export const dailyPassageIndex = (count: number, day: number): number => (count <= 0 ? 0 : (Math.max(day, 1) - 1) % count);
