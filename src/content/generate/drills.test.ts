import { describe, expect, it } from 'vitest';
import { DRILLS, libraryDrills } from '../index';
import {
  GENERATED_DRILLS, generatePassage, generatedDrillsForTrack, getGeneratedDrill, newSeed, parseSeed, resolveGeneratedDrill,
} from '../generated';
import { windowTitle } from '../../lib/ehrLabels';
import { ALLERGY_DRUGS } from '../../test/rxReference';
import { CHART_DATES, ageOnDate, expectSafeNotation, expectTallManNames, expectTypeable, expectValidCtx, seeds } from '../../test/generated';
import { mulberry32 } from './rng';

const TODAY: string = CHART_DATES[0];

describe('the generated drill registry', () => {
  it('has unique ids that start with the track and mark the drill as generated, and never clash with a written drill', () => {
    const ids = GENERATED_DRILLS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of GENERATED_DRILLS) {
      expect(d.id.startsWith(`${d.track}-gen-`), d.id).toBe(true);
      expect(DRILLS.some((w) => w.id === d.id), d.id).toBe(false);
    }
  });

  it('offers both tracks several endless drills, with the modes the typing player supports', () => {
    expect(generatedDrillsForTrack('ma').length).toBeGreaterThanOrEqual(3);
    expect(generatedDrillsForTrack('rx').length).toBeGreaterThanOrEqual(3);
    for (const d of GENERATED_DRILLS) { expect(['copy', 'hidden', 'hunt']).toContain(d.mode); expect(d.track, d.id).toBe(d.id.slice(0, 2)); }
    expect(generatedDrillsForTrack('rx').find((d) => d.id === 'rx-gen-sig')).toMatchObject({ mode: 'hidden', glossary: true });
    expect(generatedDrillsForTrack('ma').every((d) => d.track === 'ma')).toBe(true);
    // Only the PT sig drill shows the sig cheat sheet; every hunt has a flawed note to edit.
    expect(GENERATED_DRILLS.filter((d) => d.glossary).map((d) => d.id)).toEqual(['rx-gen-sig']);
    for (const d of GENERATED_DRILLS.filter((x) => x.mode === 'hunt')) expect(generatePassage(d, 1, TODAY).errors?.length, d.id).toBeGreaterThanOrEqual(3);
  });

  it('is kept apart from the written drills, whose progress and grades are keyed by id and passage', () => {
    expect(DRILLS.some((d) => d.id.includes('-gen-'))).toBe(false);
    for (const t of ['ma', 'rx'] as const) expect(libraryDrills(t).some((d) => d.id.includes('-gen-'))).toBe(false);
  });

  it('has a title, a blurb and a "Why it matters" for every drill, and a chart window name for the EHR look', () => {
    for (const d of GENERATED_DRILLS) {
      expect(d.title.trim().length, d.id).toBeGreaterThan(0);
      expect(d.blurb.trim().length, d.id).toBeGreaterThan(0);
      expect(d.why, d.id).toMatch(/^<b>Why it matters:<\/b> /);
      expectValidCtx(d.why, d.id);
      expect(windowTitle('drill', d.id), d.id).not.toBe('Note');
    }
  });

  it('looks drills up by id', () => {
    expect(getGeneratedDrill('ma-gen-soap')?.id).toBe('ma-gen-soap');
    expect(getGeneratedDrill('ma-soap')).toBeUndefined();
    expect(getGeneratedDrill('nope')).toBeUndefined();
  });
});

describe('seeds', () => {
  it('parseSeed accepts whole numbers a database integer can hold, and nothing else', () => {
    expect(parseSeed('123')).toBe(123);
    expect(parseSeed('0')).toBe(0);
    expect(parseSeed('2147483647')).toBe(2147483647);
    for (const bad of [null, '', ' ', '-1', '1.5', 'abc', '12abc', '2147483648', '1e3', '0x10']) expect(parseSeed(bad), String(bad)).toBeNull();
  });

  it('newSeed makes a valid, varied seed', () => {
    const r = mulberry32(99);
    const out = Array.from({ length: 200 }, () => newSeed(r));
    for (const s of out) { expect(Number.isInteger(s)).toBe(true); expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThanOrEqual(2147483647); expect(parseSeed(String(s))).toBe(s); }
    expect(new Set(out).size).toBeGreaterThan(190);
    expect(Number.isInteger(newSeed())).toBe(true);
  });
});

describe('generatePassage and resolveGeneratedDrill', () => {
  it('repeats the same passage for the same drill, seed and date, so a result can be reproduced from its seed', () => {
    for (const d of GENERATED_DRILLS) for (const s of seeds(5)) expect(generatePassage(d, s, TODAY), `${d.id} ${s}`).toEqual(generatePassage(d, s, TODAY));
  });

  it('gives different drills different passages from the same seed, and different seeds different passages', () => {
    const d = getGeneratedDrill('ma-gen-soap')!;
    expect(generatePassage(d, 1, TODAY).text).not.toBe(generatePassage(d, 2, TODAY).text);
    const texts = GENERATED_DRILLS.map((x) => generatePassage(x, 1, TODAY).text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('resolves to an ordinary one-passage Drill the practice screen can use unchanged', () => {
    for (const d of GENERATED_DRILLS) {
      const r = resolveGeneratedDrill(d.id, 42, TODAY)!;
      expect(r).toBeTruthy();
      expect(r).toMatchObject({ id: d.id, track: d.track, mode: d.mode, title: d.title, blurb: d.blurb, why: d.why });
      expect(r.glossary).toBe(d.glossary);
      expect(r.items).toHaveLength(1);
      expect(r.items[0]).toEqual(generatePassage(d, 42, TODAY));
      expect(r.exam).toBeFalsy();
    }
    expect(resolveGeneratedDrill('ma-soap', 1, TODAY)).toBeUndefined();
    expect(resolveGeneratedDrill('', 1, TODAY)).toBeUndefined();
  });
});

describe('every generated passage, from every drill', () => {
  const all = () => GENERATED_DRILLS.flatMap((d) => CHART_DATES.flatMap((today) => seeds(120).map((s) => ({ d, today, s, p: generatePassage(d, s, today) }))));

  it('is text a student can type, with valid scenario text, safe notation and exact Tall Man spelling', () => {
    for (const { d, s, p } of all()) {
      const where = `${d.id} seed ${s}`;
      expectTypeable(p.text, where);
      expectSafeNotation(p.text, where);
      expectTallManNames(p.text, where);
      expectValidCtx(p.ctx, where);
      expect(p.text.length, where).toBeGreaterThanOrEqual(25); // the written translator's shortest answer is 34 characters
      expect(p.text.length, where).toBeLessThanOrEqual(800);
    }
  });

  it('writes every weekday with its date correctly', () => {
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    let seen = 0;
    for (const { d, today, s, p } of all()) {
      for (const m of p.text.matchAll(/\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),? (\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/g)) {
        seen++;
        const [ty, tm, td] = today.split('-').map(Number);
        const todayMs = Date.UTC(ty, tm - 1, td);
        const thisYear = Date.UTC(ty, Number(m[2]) - 1, Number(m[3]));
        // A date written without a year is the next one that has not passed yet.
        const date = new Date(m[4] ? Date.UTC(Number(m[4]), Number(m[2]) - 1, Number(m[3])) : thisYear > todayMs ? thisYear : Date.UTC(ty + 1, Number(m[2]) - 1, Number(m[3])));
        expect(names[date.getUTCDay()], `${d.id} seed ${s}: ${m[0]}`).toBe(m[1]);
      }
    }
    expect(seen).toBeGreaterThan(50);
  });

  it('puts a chart banner on every passage that is about a patient, and the banner always agrees with the text', () => {
    let banners = 0;
    for (const { d, today, s, p } of all()) {
      const where = `${d.id} seed ${s}`;
      if (!p.patient) continue;
      banners++;
      const pt = p.patient;
      expect(pt.name, where).toMatch(/^[A-Z][a-z]+, [A-Z][a-z]+$/);
      expect(pt.dob, where).toMatch(/^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/(19|20)\d\d$/);
      expect(pt.mrn, where).toMatch(/^\d{7,8}$/);
      expect(Number.parseInt(pt.age, 10), where).toBe(ageOnDate(pt.dob, today));
      const yo = p.text.match(/(\d+) y\/o/);
      if (yo) expect(`${yo[1]} y`, where).toBe(pt.age);
      if (/\bfemale\b/i.test(p.text)) expect(pt.sex, where).toBe('F');
      if (/\bmale\b/i.test(p.text) && !/\bfemale\b/i.test(p.text)) expect(pt.sex, where).toBe('M');
      const [last, first] = pt.name.split(', ');
      for (const m of p.text.matchAll(/\b([A-Z][a-z]+) ([A-Z][a-z]+)\b(?= \(DOB| called| reports)/g)) expect(`${m[1]} ${m[2]}`, where).toBe(`${first} ${last}`);
      const allergies = pt.allergies.toLowerCase();
      // The allergy line itself may name the allergen ("Allergies: Sulfa drugs (hives)"); no drug anywhere else may be one the patient is allergic to.
      const withoutAllergyList = p.text.toLowerCase().replace(`allergies: ${allergies}.`, '');
      if (allergies !== 'nkda') for (const [key, drugs] of Object.entries(ALLERGY_DRUGS)) {
        if (allergies.includes(key)) for (const drug of drugs) expect(withoutAllergyList, `${where}: allergy ${key}`).not.toContain(drug);
      }
    }
    expect(banners).toBeGreaterThan(1000);
  });

  it('never repeats a patient name from the written drills', () => {
    const written = new Set(DRILLS.flatMap((x) => x.items).flatMap((p) => (p.patient ? [p.patient.name] : [])));
    for (const { d, s, p } of all()) if (p.patient) expect(written.has(p.patient.name), `${d.id} seed ${s}: ${p.patient.name}`).toBe(false);
  });

  it('never run out: nearly every seed gives a different exercise (the sig drill is the exception: about 90 prescriptions exist)', () => {
    // An exercise is what the student sees (the scenario line) plus what they type. For the sig drill the product is in the scenario line.
    const enough: Record<string, number> = { 'rx-gen-sig': 70, 'rx-gen-lasa': 120 };
    for (const d of GENERATED_DRILLS) {
      const seen = new Set(seeds(300).map((s) => { const p = generatePassage(d, s, TODAY); return `${p.ctx}|${p.text}`; }));
      expect(seen.size, d.id).toBeGreaterThan(enough[d.id] ?? 250);
    }
  });
});
