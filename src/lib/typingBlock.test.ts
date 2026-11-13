import { describe, expect, it } from 'vitest';
import { dailyPassageIndex, typingBlock } from './typingBlock';
import { getDrill } from '../content';

const minutes = (t: string) => { const [h, m] = t.split(':').map(Number); return (h < 12 ? h + 12 : h) * 60 + m; };

describe('the typing block schedule', () => {
  it('runs 12:35 to 3:30 with no gaps', () => {
    for (const track of ['ma', 'rx'] as const) {
      const rows = typingBlock(track);
      expect(rows.map((r) => r.name)).toEqual(['Warm-up sprint', 'Today’s skill drill', 'Error hunt', 'Stretch break', 'Shift simulation', 'Practice library', 'Chart entry forms', 'Class challenge']);
      expect(rows[0].time).toBe('12:35');
      let t = minutes('12:35');
      for (const r of rows) { expect(minutes(r.time), `${track} ${r.name}`).toBe(t); t += r.minutes; }
      expect(t).toBe(minutes('3:30'));
      expect(rows.reduce((n, r) => n + r.minutes, 0)).toBe(175);
      for (const r of rows) expect(r.mins).toBe(`${r.minutes} min`);
    }
  });

  it('needs no sound: nothing in the block plays audio', () => {
    for (const track of ['ma', 'rx'] as const) expect(typingBlock(track).map((r) => r.name.toLowerCase()).join(' ')).not.toMatch(/dictation|listen|audio/);
  });

  it('marks the sprint, the skill drill, the error hunt, the practice library and the chart entry forms as available, and the rest as planned', () => {
    for (const track of ['ma', 'rx'] as const) {
      expect(typingBlock(track).map((r) => [r.name, r.built])).toEqual([
        ['Warm-up sprint', true], ['Today’s skill drill', true], ['Error hunt', true], ['Stretch break', false],
        ['Shift simulation', false], ['Practice library', true], ['Chart entry forms', true], ['Class challenge', false],
      ]);
    }
  });

  it('sends the error hunt row to that track’s own hunt drill, and the practice library row to the library', () => {
    for (const track of ['ma', 'rx'] as const) {
      const rows = typingBlock(track);
      const hunt = rows.find((r) => r.name === 'Error hunt')!;
      expect(hunt.drillId).toBe(`${track}-hunt`);
      expect(getDrill(hunt.drillId!)).toMatchObject({ track, mode: 'hunt' });
      expect(rows.find((r) => r.name === 'Practice library')!.to).toBe('/drills');
      expect(rows.find((r) => r.name === 'Chart entry forms')!.to).toBe('/forms');
      expect(rows.filter((r) => r.drillId || r.to).map((r) => r.name)).toEqual(['Error hunt', 'Practice library', 'Chart entry forms']);
    }
  });
});

describe('which daily passage is today’s', () => {
  it('moves through the passages one per program day, then starts over', () => {
    expect([1, 2, 3, 8, 9, 10].map((d) => dailyPassageIndex(8, d))).toEqual([0, 1, 2, 7, 0, 1]);
  });
  it('stays inside the drill for any day, even before Day 1 or past Day 10', () => {
    for (const day of [-3, 0, 11, 25, 100]) for (const n of [1, 6, 8]) {
      const i = dailyPassageIndex(n, day);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(n);
    }
    expect(dailyPassageIndex(8, 0)).toBe(0);
    expect(dailyPassageIndex(8, 11)).toBe(2);
    expect(dailyPassageIndex(0, 3)).toBe(0);
  });
});
