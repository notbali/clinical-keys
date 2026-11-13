import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../content/generate/rng';
import {
  MAX_RUNS, buildWeakSprint, emptyRecord, loadRecord, missedLine, parseRecord, recordRun, saveRecord, serializeRecord, weakList,
  type StorageLike,
} from './weakWords';

const run = (missed: Record<string, number>, clean: string[] = []) => ({
  at: '2026-11-12T18:00:00.000Z',
  missedWords: Object.entries(missed).map(([word, count]) => ({ word, count })),
  cleanWords: clean,
});

describe('weakList', () => {
  it('is empty for a new student', () => {
    expect(weakList(emptyRecord())).toEqual([]);
  });

  it('adds up misses across runs and puts the most missed first', () => {
    let r = recordRun(emptyRecord(), run({ hydrOXYzine: 2, mg: 1 }));
    r = recordRun(r, run({ hydrOXYzine: 1, daily: 1 }));
    expect(weakList(r)).toEqual([
      { word: 'hydrOXYzine', count: 3 },
      { word: 'daily', count: 1 },
      { word: 'mg', count: 1 },
    ]);
  });

  it('lets a word fade when it is later typed right', () => {
    let r = recordRun(emptyRecord(), run({ mg: 1, daily: 2 }));
    r = recordRun(r, run({}, ['mg', 'daily', 'other']));
    expect(weakList(r)).toEqual([{ word: 'daily', count: 1 }]);
    r = recordRun(r, run({}, ['daily']));
    expect(weakList(r)).toEqual([]);
  });

  it('does not let a clean run before the first miss cancel it', () => {
    let r = recordRun(emptyRecord(), run({}, ['mg']));
    r = recordRun(r, run({ mg: 1 }));
    expect(weakList(r)).toEqual([{ word: 'mg', count: 1 }]);
  });

  it('limits the list', () => {
    const many = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`word${String(i).padStart(2, '0')}`, 1]));
    expect(weakList(recordRun(emptyRecord(), run(many)), 5)).toHaveLength(5);
    expect(weakList(recordRun(emptyRecord(), run(many)))).toHaveLength(10);
  });
});

describe('recordRun', () => {
  it('keeps only the most recent runs, so the record rolls', () => {
    let r = emptyRecord();
    r = recordRun(r, run({ oldword: 4 }));
    for (let i = 0; i < MAX_RUNS; i++) r = recordRun(r, run({ newword: 1 }));
    expect(r.runs).toHaveLength(MAX_RUNS);
    expect(weakList(r).map((w) => w.word)).toEqual(['newword']);
  });

  it('does not store a run that changed nothing, and does not change the old record', () => {
    const before = recordRun(emptyRecord(), run({ mg: 1 }));
    const same = recordRun(before, run({}, ['unrelated']));
    expect(same.runs).toHaveLength(1);
    const after = recordRun(before, run({ mg: 1 }));
    expect(before.runs).toHaveLength(1);
    expect(after.runs).toHaveLength(2);
  });
});

describe('storage', () => {
  const fake = (): StorageLike & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  };

  it('saves and loads a record per student', () => {
    const st = fake();
    saveRecord(st, 's1', recordRun(emptyRecord(), run({ mg: 2 })));
    expect(weakList(loadRecord(st, 's1'))).toEqual([{ word: 'mg', count: 2 }]);
    expect(weakList(loadRecord(st, 's2'))).toEqual([]);
  });

  it('survives a missing, broken or hand-edited record', () => {
    expect(parseRecord(null)).toEqual(emptyRecord());
    expect(parseRecord('not json')).toEqual(emptyRecord());
    expect(parseRecord('{"runs":"nope"}')).toEqual(emptyRecord());
    const messy = parseRecord(JSON.stringify({ runs: [{ at: 'x', missed: { mg: 2, bad: 'a', neg: -1 }, ok: ['fine', 7] }, 'junk', null] }));
    expect(weakList(messy)).toEqual([{ word: 'mg', count: 2 }]);
    expect(parseRecord(serializeRecord(messy))).toEqual(messy);
  });

  it('works with no storage, or storage that throws', () => {
    expect(loadRecord(undefined, 's1')).toEqual(emptyRecord());
    expect(() => saveRecord(undefined, 's1', emptyRecord())).not.toThrow();
    const bad: StorageLike = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
    expect(loadRecord(bad, 's1')).toEqual(emptyRecord());
    expect(() => saveRecord(bad, 's1', emptyRecord())).not.toThrow();
  });
});

describe('missedLine', () => {
  it('says nothing when nothing was missed', () => {
    expect(missedLine([])).toBeNull();
  });
  it('names the most missed words', () => {
    expect(missedLine([{ word: 'hydrOXYzine', count: 3 }])).toBe('You missed hydrOXYzine 3 times.');
    expect(missedLine([{ word: 'hydrOXYzine', count: 3 }, { word: 'mg', count: 2 }, { word: 'daily', count: 1 }]))
      .toBe('You missed hydrOXYzine 3 times, mg twice and daily once.');
  });
  it('shows at most three words', () => {
    const m = ['a1', 'b2', 'c3', 'd4'].map((word) => ({ word, count: 1 }));
    expect(missedLine(m)).toBe('You missed a1 once, b2 once and c3 once, plus 1 more.');
  });
});

describe('buildWeakSprint', () => {
  const words = [{ word: 'hydrOXYzine', count: 3 }, { word: 'mg', count: 1 }, { word: 'daily', count: 2 }];

  it('is empty when there are no weak words', () => {
    expect(buildWeakSprint([], mulberry32(1))).toBe('');
  });

  it('is long enough for a fast typist in 60 seconds and only uses the weak words', () => {
    const text = buildWeakSprint(words, mulberry32(7));
    expect(text.length).toBeGreaterThanOrEqual(500);
    expect(new Set(text.split(' '))).toEqual(new Set(['hydrOXYzine', 'mg', 'daily']));
    expect(text.endsWith(' ')).toBe(false);
  });

  it('is the same for the same seed and different for another', () => {
    expect(buildWeakSprint(words, mulberry32(7))).toBe(buildWeakSprint(words, mulberry32(7)));
    expect(buildWeakSprint(words, mulberry32(7))).not.toBe(buildWeakSprint(words, mulberry32(8)));
  });

  it('shows the most missed words more often', () => {
    const parts = buildWeakSprint(words, mulberry32(3)).split(' ');
    const n = (w: string) => parts.filter((p) => p === w).length;
    expect(n('hydrOXYzine')).toBeGreaterThan(n('mg'));
  });

  it('never repeats the same word twice in a row when there is more than one', () => {
    const parts = buildWeakSprint(words, mulberry32(11)).split(' ');
    parts.slice(1).forEach((p, i) => expect(p).not.toBe(parts[i]));
  });

  it('still works with a single weak word', () => {
    const text = buildWeakSprint([{ word: 'mg', count: 1 }], mulberry32(1));
    expect(text.length).toBeGreaterThanOrEqual(500);
    expect(new Set(text.split(' '))).toEqual(new Set(['mg']));
  });
});
