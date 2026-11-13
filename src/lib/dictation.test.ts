import { describe, expect, it } from 'vitest';
import { GENERATED_DRILLS, generatePassage, getGeneratedDrill } from '../content/generated';
import { CHART_DATES, seeds } from '../test/generated';
import {
  activeTypingSeconds, betterDictation, dictationResult, dictationSources, numberToWords, reviewDictation, speechChunks, speechScript,
} from './dictation';

describe('numberToWords', () => {
  it('spells whole numbers the way they are said', () => {
    expect(numberToWords(0)).toBe('zero');
    expect(numberToWords(7)).toBe('seven');
    expect(numberToWords(13)).toBe('thirteen');
    expect(numberToWords(21)).toBe('twenty-one');
    expect(numberToWords(84)).toBe('eighty-four');
    expect(numberToWords(100)).toBe('one hundred');
    expect(numberToWords(128)).toBe('one hundred twenty-eight');
    expect(numberToWords(270)).toBe('two hundred seventy');
    expect(numberToWords(1000)).toBe('one thousand');
    expect(numberToWords(2500)).toBe('two thousand five hundred');
  });
});

describe('speechScript: what the voice says for what the chart says', () => {
  it('reads strengths with their units in words, singular only for exactly one', () => {
    expect(speechScript('lisinopril 10 mg')).toBe('lisinopril ten milligrams');
    expect(speechScript('Take 1 mg')).toBe('Take one milligram');
    expect(speechScript('levothyroxine 125 mcg')).toBe('levothyroxine one hundred twenty-five micrograms');
    expect(speechScript('meloxicam 7.5 mg')).toBe('meloxicam seven point five milligrams');
    expect(speechScript('latanoprost 0.005% eye drops')).toBe('latanoprost zero point zero zero five percent eye drops');
    expect(speechScript('Glucose 93 mg/dL')).toBe('Glucose ninety-three milligrams per deciliter');
    expect(speechScript('1 (2.5 mL)')).toBe('one (two point five milliliters)');
  });

  it('reads a date, with and without the year', () => {
    expect(speechScript('seen on 11/17')).toBe('seen on November seventeenth');
    expect(speechScript('Tuesday, 12/08 at')).toBe('Tuesday, December eighth at');
    expect(speechScript('DOB 10/02/1994')).toBe('date of birth October second, nineteen ninety-four');
    expect(speechScript('visit 05/23/2026.')).toBe('visit May twenty-third, twenty twenty-six.');
    expect(speechScript('born 03/04/2005')).toBe('born March fourth, two thousand five');
  });

  it('reads blood pressure as "over", not as a date, and pain as "out of ten"', () => {
    expect(speechScript('BP 128/84 mmHg')).toBe('blood pressure one hundred twenty-eight over eighty-four millimeters of mercury');
    expect(speechScript('repeat 145/93 after 5 min')).toBe('repeat one hundred forty-five over ninety-three after five min');
    expect(speechScript('Pain 6/10.')).toBe('Pain six out of ten.');
  });

  it('reads times, phone numbers and prescription numbers digit by digit where that is how they are said', () => {
    expect(speechScript('at 3:05 p.m.')).toBe('at three oh five P M');
    expect(speechScript('at 9:15 a.m., fasting')).toBe('at nine fifteen A M, fasting');
    expect(speechScript('at 11:00 a.m.')).toBe('at eleven o clock A M');
    expect(speechScript('at 10:30 a.m. to Monday')).toBe('at ten thirty A M to Monday');
    expect(speechScript('Callback number 555-0142.')).toBe('Callback number five five five, zero one four two.');
    expect(speechScript('Rx# 4412345 Santos, Maya')).toBe('prescription number four four one two three four five Santos, Maya');
  });

  it('reads vitals labels and chart shorthand as a person would say them', () => {
    expect(speechScript('T 98.6 F (oral)')).toBe('temperature ninety-eight point six degrees Fahrenheit (oral)');
    expect(speechScript('P 76 bpm, R 16')).toBe('pulse seventy-six beats per minute, respirations sixteen');
    expect(speechScript('SpO2 98% on room air')).toBe('oxygen saturation ninety-eight percent on room air');
    expect(speechScript('Ht 5 ft 6 in, Wt 154 lb, BMI 24.9')).toBe('height five feet six inches, weight one hundred fifty-four pounds, B M I twenty-four point nine');
    expect(speechScript('R arm seated; L arm')).toBe('right arm seated; left arm');
    expect(speechScript('Pt is a 37 y/o female c/o cough x 3 days')).toBe('patient is a thirty-seven year old female complains of cough for three days');
    expect(speechScript('Message for Dr. Patel:')).toBe('Message for Doctor Patel:');
    expect(speechScript('bowel/bladder')).toBe('bowel slash bladder');
  });

  it('labels the sections of a SOAP note', () => {
    const out = speechScript('S: 45 y/o male\nO: T 99.1 F\nA: Strep.\nP: Rest.');
    expect(out).toBe('Subjective: forty-five year old male. Objective: temperature ninety-nine point one degrees Fahrenheit. Assessment: Strep. Plan: Rest.');
  });

  it('spells sig shorthand letter by letter instead of turning it into plain words, so a sig is still typed as a sig', () => {
    expect(speechScript('Amoxicillin 500 mg PO BID x 10 days.')).toBe('Amoxicillin five hundred milligrams P O B I D for ten days.');
    expect(speechScript('Ondansetron 4 mg PO q8h prn nausea.')).toBe('Ondansetron four milligrams P O Q eight H P R N nausea.');
    expect(speechScript('qhs')).toBe('Q H S');
    expect(speechScript('BID')).not.toMatch(/twice/i);
  });

  it('says a Tall Man name as one word, in lower case, so the voice does not spell it', () => {
    expect(speechScript('hydrALAZINE 25 mg')).toBe('hydralazine twenty-five milligrams');
    expect(speechScript('NIFEdipine ER 30 mg')).toBe('nifedipine E R thirty milligrams');
    expect(speechScript('predniSONE')).toBe('prednisone');
  });

  it('puts a pause between lines and turns a dash into a comma', () => {
    expect(speechScript('Rx# 4400001 Santos, Maya\nLisinopril 10 mg tablet Qty: 30')).toBe(
      'prescription number four four zero zero zero zero one Santos, Maya. Lisinopril ten milligrams tablet quantity: thirty',
    );
    expect(speechScript('1:27 p.m. - Fatima called')).toBe('one twenty-seven P M, Fatima called');
  });

  it('leaves no digit and no symbol behind for the voice to stumble on, in any generated passage', () => {
    let checked = 0;
    for (const d of GENERATED_DRILLS) {
      for (const today of CHART_DATES) {
        for (const seed of seeds(40)) {
          const text = generatePassage(d, seed, today).text;
          const script = speechScript(text);
          const where = `${d.id} ${seed}: ${text}\n=> ${script}`;
          expect(script, where).not.toMatch(/[0-9]/);
          expect(script, where).not.toMatch(/[\/%#@&*_=+<>\\|{}[\]^~`]/);
          expect(script, where).not.toMatch(/\n/);
          expect(script, where).not.toMatch(/ {2}/);
          expect(script, where).toBe(script.trim());
          expect(script, where).not.toMatch(/\b(y\/o|c\/o|mmHg|mg|mcg|bpm)\b/);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });
});

describe('speechChunks: short pieces, because some voices stop partway through a long text', () => {
  const script = speechScript(generatePassage(getGeneratedDrill('ma-gen-phone')!, 5, '2026-11-13').text);

  it('breaks at sentence ends first and loses nothing', () => {
    const chunks = speechChunks(script, 90);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(' ')).toBe(script);
    for (const c of chunks) { expect(c.length).toBeLessThanOrEqual(90); expect(c).toBe(c.trim()); expect(c.length).toBeGreaterThan(0); }
  });

  it('splits one very long sentence at commas, then at spaces, and keeps one chunk when it is short', () => {
    const long = `${'word '.repeat(60)}end.`;
    const chunks = speechChunks(long, 50);
    expect(chunks.every((c) => c.length <= 50)).toBe(true);
    expect(chunks.join(' ')).toBe(long);
    expect(speechChunks('Short one.', 100)).toEqual(['Short one.']);
    expect(speechChunks('', 100)).toEqual([]);
    const withCommas = 'alpha beta gamma, delta epsilon zeta, eta theta iota';
    expect(speechChunks(withCommas, 30)).toEqual(['alpha beta gamma,', 'delta epsilon zeta,', 'eta theta iota']);
  });
});

describe('reviewDictation: a word-by-word check of what was typed', () => {
  const target = 'Take 1 tablet by mouth twice daily.';

  it('calls an exact copy exact, whatever the line breaks and spacing', () => {
    const r = reviewDictation('Take 1 tablet  by mouth\ntwice daily.', target);
    expect(r).toMatchObject({ exact: true, wordsRight: 7, wordsTotal: 7, accuracy: 100, issues: [] });
  });

  it('finds a wrong, a missed and an extra word, and says which', () => {
    const r = reviewDictation('Take 2 tablet mouth twice daily. today', target);
    expect(r.exact).toBe(false);
    expect(r.wordsRight).toBe(5);
    expect(r.wordsTotal).toBe(7);
    expect(r.issues).toHaveLength(3);
    expect(r.issues[0]).toContain('“2”');
    expect(r.issues[1]).toContain('“by”');
    expect(r.issues[2]).toContain('“today”');
    expect(r.accuracy).toBe(71.4);
  });

  it('points out when only the capital letters are wrong, because that is the Tall Man mistake', () => {
    const r = reviewDictation('Take hydralazine daily', 'Take hydrALAZINE daily');
    expect(r.exact).toBe(false);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatch(/capital letters/i);
  });

  it('scores against the longer of the two, so extra typing cannot raise the score', () => {
    const r = reviewDictation('Take 1 tablet by mouth twice daily. Take 1 tablet by mouth twice daily.', target);
    expect(r.wordsRight).toBe(7);
    expect(r.accuracy).toBe(50);
    expect(reviewDictation('', target)).toMatchObject({ exact: false, wordsRight: 0, accuracy: 0 });
    expect(reviewDictation('', '')).toMatchObject({ exact: true, accuracy: 100 });
  });

  it('treats curly quotes like straight ones', () => {
    expect(reviewDictation('Don’t stop', "Don't stop").exact).toBe(true);
  });
});

describe('activeTypingSeconds: time spent typing, not time spent listening', () => {
  it('adds up the gaps between keystrokes and leaves out long pauses', () => {
    expect(activeTypingSeconds([])).toBe(0);
    expect(activeTypingSeconds([1000])).toBe(0);
    expect(activeTypingSeconds([0, 500, 1000, 1500])).toBe(1.5);
    expect(activeTypingSeconds([0, 500, 20_000, 20_500])).toBe(1);
    expect(activeTypingSeconds([0, 5000, 10_000], 5000)).toBe(10);
    expect(activeTypingSeconds([0, 5001], 5000)).toBe(0);
  });
});

describe('dictationResult', () => {
  const target = 'Take 1 tablet by mouth twice daily.'; // 35 characters, 7 words
  const keyTimes = Array.from({ length: 36 }, (_, i) => i * 400); // 14 seconds of typing

  it('scores a clean run and counts its words per minute from the typing time only', () => {
    const r = dictationResult({ typed: target, target, keyTimes, replays: 1, revealed: false });
    expect(r.seconds).toBe(14);
    expect(r.wpm).toBe(Math.round(35 / 5 / (14 / 60)));
    expect(r).toMatchObject({ clean: true, completed: true, accuracy: 100, wordsRight: 7, replays: 1 });
  });

  it('counts only the right words toward speed, and a run with any wrong word is not clean', () => {
    const r = dictationResult({ typed: 'Take 2 tablet by mouth twice daily.', target, keyTimes, replays: 0, revealed: false });
    expect(r.clean).toBe(false);
    expect(r.completed).toBe(false);
    expect(r.wpm).toBeLessThan(dictationResult({ typed: target, target, keyTimes, replays: 0, revealed: false }).wpm);
  });

  it('never counts a run where the text was shown, and gives no speed for a run with no typing time', () => {
    expect(dictationResult({ typed: target, target, keyTimes, replays: 0, revealed: true })).toMatchObject({ clean: false, completed: false, revealed: true });
    expect(dictationResult({ typed: target, target, keyTimes: [], replays: 0, revealed: false }).wpm).toBe(0);
  });
});

describe('betterDictation: the local best', () => {
  const run = (wpm: number, clean = true) => ({ wpm, accuracy: 100, clean });
  it('only a clean run can be a best, and a faster clean run beats a slower one', () => {
    expect(betterDictation(null, run(20))).toBe(true);
    expect(betterDictation(null, run(60, false))).toBe(false);
    expect(betterDictation(run(30), run(31))).toBe(true);
    expect(betterDictation(run(30), run(30))).toBe(false);
    expect(betterDictation(run(30), run(25))).toBe(false);
    expect(betterDictation(run(30), run(90, false))).toBe(false);
  });
  it('never counts a run that took no time at all', () => {
    expect(betterDictation(null, run(0))).toBe(false);
  });
});

describe('dictationSources: what a student can dictate', () => {
  it('lists real generated drills for each track, in short forms, with a label', () => {
    for (const track of ['ma', 'rx'] as const) {
      const list = dictationSources(track);
      expect(list.length).toBeGreaterThanOrEqual(2);
      for (const s of list) {
        const d = getGeneratedDrill(s.id);
        expect(d, s.id).toBeDefined();
        expect(d!.track).toBe(track);
        expect(s.label.length).toBeGreaterThan(0);
        for (const seed of seeds(25)) expect(generatePassage(d!, seed, CHART_DATES[0]).text.length, `${s.id} ${seed}`).toBeLessThan(560);
      }
    }
  });
});
