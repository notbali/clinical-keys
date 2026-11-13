import { describe, expect, it } from 'vitest';
import { huntRunResult, nextHint, plantedErrors, scoreHunt } from './errorHunt';

const fixed = 'Wt 154 lb, BMI 24.9.\nPain 3/10, right knee.';
const flawed = 'Wt 154 kg, BMI 24.9.\nPain 13/10, right knee.';

describe('plantedErrors: what was changed in the note', () => {
  it('lists each change in order, with the line and the words just before it', () => {
    expect(plantedErrors(flawed, fixed)).toEqual([
      { flawed: 'kg,', fixed: 'lb,', line: 1, before: 'Wt 154', targetStart: 2, targetEnd: 3 },
      { flawed: '13/10,', fixed: '3/10,', line: 2, before: '24.9. Pain', targetStart: 6, targetEnd: 7 },
    ]);
  });

  it('finds a word that was taken out', () => {
    expect(plantedErrors('Do stop taking it now.', 'Do not stop taking it now.')).toEqual([
      { flawed: '', fixed: 'not', line: 1, before: 'Do', targetStart: 1, targetEnd: 2 },
    ]);
  });

  it('finds a word that was put in', () => {
    expect(plantedErrors('at the same time every other day.', 'at the same time every day.')).toEqual([
      { flawed: 'other', fixed: '', line: 1, before: 'time every', targetStart: 5, targetEnd: 5 },
    ]);
  });

  it('counts mistakes right next to each other as one, so a note needs a good word between two mistakes', () => {
    expect(plantedErrors('hydralazine 5.0 mg', 'hydrALAZINE 5 mg')).toHaveLength(1);
    expect(plantedErrors('hydralazine tablet 5.0 mg', 'hydrALAZINE tablet 5 mg')).toHaveLength(2);
  });

  it('finds nothing when the notes are the same, whatever the spacing', () => {
    expect(plantedErrors(fixed, fixed)).toEqual([]);
    expect(plantedErrors('a   b\n\nc', 'a b c')).toEqual([]);
  });
});

describe('scoreHunt', () => {
  const typedWith = (...edits: [string, string][]) => edits.reduce((t, [from, to]) => t.replace(from, to), flawed);

  it('scores a note left as it was as nothing fixed', () => {
    expect(scoreHunt(flawed, fixed, flawed)).toMatchObject({ planted: 2, fixed: 0, remaining: 2, introduced: 0, found: [false, false], accuracy: 0, completed: false });
  });

  it('scores a fully corrected note as complete', () => {
    expect(scoreHunt(flawed, fixed, fixed)).toMatchObject({ planted: 2, fixed: 2, remaining: 0, introduced: 0, found: [true, true], accuracy: 100, completed: true });
  });

  it('gives credit for each error fixed', () => {
    expect(scoreHunt(flawed, fixed, typedWith(['kg,', 'lb,']))).toMatchObject({ fixed: 1, remaining: 1, found: [true, false], accuracy: 50, completed: false });
  });

  it('counts a new mistake against the note, even when every error is fixed', () => {
    const s = scoreHunt(flawed, fixed, `${fixed.replace('knee.', 'hip.')}`);
    expect(s).toMatchObject({ fixed: 2, remaining: 0, introduced: 1, completed: false, accuracy: 66.7 });
    expect(s.introducedOps).toEqual([{ kind: 'wrong', typed: 'hip.', target: 'knee.', typedIndex: 8, targetIndex: 8, gap: expect.any(Number) }]);
  });

  it('counts a word added somewhere else, even right after a fixed error, as a new mistake and not a missed one', () => {
    expect(scoreHunt(flawed, fixed, 'Wt 154 lb, BMI 24.9.\nPain 3/10, right big knee.')).toMatchObject({ fixed: 2, remaining: 0, introduced: 1, completed: false });
    expect(scoreHunt(flawed, fixed, 'Wt 154 lb, extra BMI 24.9.\nPain 3/10, right knee.')).toMatchObject({ fixed: 2, remaining: 0, introduced: 1, found: [true, true] });
  });

  it('does not call a wrong fix a new mistake: the error is simply still there', () => {
    expect(scoreHunt(flawed, fixed, typedWith(['kg,', 'lbs,'], ['13/10,', '3/10,']))).toMatchObject({ fixed: 1, remaining: 1, introduced: 0, found: [false, true] });
  });

  it('needs the exact capitals and punctuation: Tall Man letters and trailing zeros matter', () => {
    const f = 'hydrALAZINE tablet 5 mg daily.';
    const bad = 'hydralazine tablet 5.0 mg daily.';
    expect(scoreHunt(bad, f, bad).planted).toBe(2);
    expect(scoreHunt(bad, f, 'hydrALAZINE tablet 5.0 mg daily.')).toMatchObject({ fixed: 1, remaining: 1, found: [true, false] });
    expect(scoreHunt(bad, f, 'hydralazine tablet 5 mg daily.')).toMatchObject({ fixed: 1, remaining: 1, found: [false, true] });
    expect(scoreHunt(bad, f, f).completed).toBe(true);
  });

  it('counts a word still missing, or an extra word still there, as an error left', () => {
    expect(scoreHunt('Do stop taking it.', 'Do not stop taking it.', 'Do stop taking it.')).toMatchObject({ fixed: 0, remaining: 1 });
    expect(scoreHunt('Do not stop taking it.', 'Do not stop taking it.', 'Do not stop taking it.').planted).toBe(0);
    expect(scoreHunt('every other day.', 'every day.', 'every other day.')).toMatchObject({ fixed: 0, remaining: 1, introduced: 0 });
    expect(scoreHunt('every other day.', 'every day.', 'every day.').completed).toBe(true);
  });

  it('ignores extra spaces and line breaks', () => {
    expect(scoreHunt(flawed, fixed, 'Wt  154   lb, BMI 24.9. Pain 3/10, right\nknee.').completed).toBe(true);
  });

  it('counts wiping out the note as nothing fixed, and the deleted words as new problems', () => {
    const s = scoreHunt(flawed, fixed, '');
    expect(s.fixed).toBe(0);
    expect(s.remaining).toBe(2);
    expect(s.introduced).toBeGreaterThan(0);
    expect(s.completed).toBe(false);
  });

  it('is never complete for a note with nothing wrong to find', () => {
    expect(scoreHunt(fixed, fixed, fixed)).toMatchObject({ planted: 0, completed: false, accuracy: 0 });
  });
});

describe('nextHint', () => {
  it('points at the first error still in the note', () => {
    expect(nextHint(flawed, fixed, flawed)).toEqual({ index: 0, before: 'Wt 154' });
    expect(nextHint(flawed, fixed, flawed.replace('kg,', 'lb,'))).toEqual({ index: 1, before: '24.9. Pain' });
  });
  it('has nothing to point at once every error is fixed', () => {
    expect(nextHint(flawed, fixed, fixed)).toBeNull();
  });
});

describe('huntRunResult', () => {
  const perfect = scoreHunt(flawed, fixed, fixed);
  const partial = scoreHunt(flawed, fixed, flawed.replace('kg,', 'lb,').replace('knee.', 'hip.'));

  it('fits the result the typing drills save, with no typing speed and no personal best', () => {
    expect(huntRunResult(perfect, { seconds: 45.4, hints: 1, revealed: false, typedChars: 50 })).toEqual({
      wpm: 0, accuracy: 100, errorsLeft: 0, seconds: 45, keys: 50, wrong: 0, revealed: false, peeks: 1, completed: true, clean: false,
    });
  });

  it('is not completed while errors remain or new ones were added', () => {
    const r = huntRunResult(partial, { seconds: 30, hints: 0, revealed: false, typedChars: 48 });
    expect(r).toMatchObject({ completed: false, clean: false, errorsLeft: partial.remaining + partial.introduced, wrong: partial.remaining + partial.introduced });
    expect(r.errorsLeft).toBe(2);
  });

  it('is not completed once the answers were shown', () => {
    expect(huntRunResult(perfect, { seconds: 10, hints: 0, revealed: true, typedChars: 50 })).toMatchObject({ revealed: true, completed: false, clean: false });
  });
});
