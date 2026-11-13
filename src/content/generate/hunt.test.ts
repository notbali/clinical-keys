import { describe, expect, it } from 'vitest';
import { GENERATED_DRILLS, generatePassage, getGeneratedDrill, resolveGeneratedDrill } from '../generated';
import { makeLabelPassage } from './rxPassages';
import { buildLabel, makeRxHuntPassage } from './huntRx';
import { makeMaHuntPassage } from './huntMa';
import { mulberry32 } from './rng';
import { plantedErrors, scoreHunt } from '../../lib/errorHunt';
import { FDA_TALL_MAN } from '../../test/tallman';
import { CHART_DATES, ageOnDate, seeds } from '../../test/generated';
import type { HuntCategory, Passage } from '../types';

const CATEGORIES: HuntCategory[] = ['number', 'unit', 'spelling', 'patient', 'allergy', 'tall-man', 'do-not-use', 'logic'];
const DO_NOT_USE = /\b(QD|Q\.D\.|QOD|IU|MSO4|MgSO4|MS|U)\b|\b\d+\.0+\b|(^|[\s(])\.\d/;
const bare = (w: string) => w.replace(/[.,;:!?()]+$/g, '').replace(/^[(]+/, '');

const MAKERS = { 'ma-gen-hunt': makeMaHuntPassage, 'rx-gen-hunt': makeRxHuntPassage } as const;

for (const [id, make] of Object.entries(MAKERS)) {
  describe(id, () => {
    const runs = () => CHART_DATES.flatMap((today) => seeds(150).map((s) => ({ today, s, p: make(mulberry32(s), today) as Passage })));

    it('is a registered proofreading drill for its own track', () => {
      const d = getGeneratedDrill(id)!;
      expect(d).toBeTruthy();
      expect(d.mode).toBe('hunt');
      expect(d.track).toBe(id.slice(0, 2));
      expect(d.title).toMatch(/error hunt/i);
      expect(d.glossary).toBeFalsy();
      const r = resolveGeneratedDrill(id, 5, CHART_DATES[0])!;
      expect(r.mode).toBe('hunt');
      expect(r.items[0].flawed).toBeTruthy();
      expect(generatePassage(d, 5, CHART_DATES[0])).toEqual(r.items[0]);
    });

    it('is repeatable from its seed', () => {
      for (const s of seeds(10)) expect(make(mulberry32(s), CHART_DATES[0])).toEqual(make(mulberry32(s), CHART_DATES[0]));
    });

    it('plants three or four errors, exactly the ones it declares, each in its own word and in order', () => {
      for (const { s, p } of runs()) {
        const where = `${id} seed ${s}`;
        expect(p.flawed, where).not.toBe(p.text);
        const planted = plantedErrors(p.flawed!, p.text);
        expect(planted.length, `${where} ${JSON.stringify(planted)}`).toBe(p.errors!.length);
        expect(p.errors!.length, where).toBeGreaterThanOrEqual(3);
        expect(p.errors!.length, where).toBeLessThanOrEqual(4);
        for (let i = 1; i < planted.length; i++) expect(planted[i].targetStart, where).toBeGreaterThanOrEqual(planted[i - 1].targetEnd);
        for (const e of planted) {
          expect(e.fixed.split(' ').length + e.flawed.split(' ').length, `${where} each error stays inside its own few words (an allergy list can be a few words long)`).toBeLessThanOrEqual(8);
          expect(e.flawed === '' && e.fixed === '', where).toBe(false);
        }
        expect(p.ctx, where).toContain(`There are ${p.errors!.length} errors`);
        expect(scoreHunt(p.flawed!, p.text, p.text), where).toMatchObject({ completed: true, accuracy: 100, introduced: 0 });
        expect(scoreHunt(p.flawed!, p.text, p.flawed!), where).toMatchObject({ fixed: 0, completed: false });
      }
    });

    it('explains every error with a known category and a clear reason', () => {
      for (const { s, p } of runs()) p.errors!.forEach((e, k) => {
        const where = `${id} seed ${s} error ${k}`;
        expect(CATEGORIES, where).toContain(e.category);
        expect(e.why.trim().length, where).toBeGreaterThan(10);
        expect(e.why.length, where).toBeLessThanOrEqual(220);
        expect(e.why, where).not.toMatch(/[<>]/);
      });
    });

    it('plants each kind of error the way its category says', () => {
      for (const { s, p } of runs()) plantedErrors(p.flawed!, p.text).forEach((e, k) => {
        const where = `${id} seed ${s} error ${k} ("${e.flawed}" -> "${e.fixed}")`;
        const cat = p.errors![k].category;
        if (cat === 'number') { expect(e.flawed, where).toMatch(/\d/); expect(e.fixed, where).toMatch(/\d/); }
        if (cat === 'do-not-use') { expect(e.flawed, where).toMatch(DO_NOT_USE); expect(e.fixed, where).not.toMatch(DO_NOT_USE); }
        if (cat === 'tall-man') {
          expect(FDA_TALL_MAN.has(bare(e.fixed)), where).toBe(true);
          expect(bare(e.flawed), where).toBe(bare(e.fixed).toLowerCase());
        }
        if (cat === 'spelling') expect(Math.abs(bare(e.flawed).length - bare(e.fixed).length), where).toBeLessThanOrEqual(1);
      });
    });

    it('has a flawed note that can be typed and looks like the real note', () => {
      for (const { s, p } of runs()) {
        const f = p.flawed!;
        const where = `${id} seed ${s}`;
        expect(f, where).toMatch(/^[\x20-\x7E\n]+$/);
        expect(f, where).toBe(f.trim());
        expect(f, where).not.toMatch(/ {2}/);
        for (const line of f.split('\n')) { expect(line.length, where).toBeGreaterThan(0); expect(line, where).toBe(line.trimEnd()); }
        expect(f.split('\n').length, where).toBe(p.text.split('\n').length);
        expect(f.length / p.text.length, where).toBeGreaterThan(0.8);
        expect(f.length / p.text.length, where).toBeLessThan(1.25);
      }
    });

    it('has a chart banner that agrees with the correct note, including the allergy line', () => {
      for (const { today, s, p } of runs()) {
        const pt = p.patient;
        const where = `${id} seed ${s}`;
        if (!pt) { expect(p.errors!.some((e) => e.category === 'patient' || e.category === 'allergy'), where).toBe(false); continue; }
        expect(Number.parseInt(pt.age, 10), where).toBe(ageOnDate(pt.dob, today));
        const yo = p.text.match(/(\d+) y\/o/);
        if (yo) expect(`${yo[1]} y`, where).toBe(pt.age);
        if (/\bfemale\b/.test(p.text)) expect(pt.sex, where).toBe('F');
        else if (/\bmale\b/.test(p.text)) expect(pt.sex, where).toBe('M');
        expect(p.text, where).toContain(`Allergies: ${pt.allergies}.`);
        const [last, first] = pt.name.split(', ');
        if (/called|reports/.test(p.text)) expect(p.text, where).toContain(`${first} ${last}`);
      }
    });

    it('shows each kind of error often enough to teach it', () => {
      const seen = new Map<string, number>();
      for (const { p } of runs()) for (const e of p.errors!) seen.set(e.category, (seen.get(e.category) ?? 0) + 1);
      const want = id.startsWith('rx') ? CATEGORIES : CATEGORIES.filter((c) => c !== 'tall-man');
      for (const c of want) expect(seen.get(c) ?? 0, `${id} ${c}`).toBeGreaterThan(20);
    });

    it('does not repeat the same errors in every note: nearly every seed gives a different note', () => {
      const seen = new Set(seeds(300).map((s) => make(mulberry32(s), CHART_DATES[0]).flawed));
      expect(seen.size).toBeGreaterThan(250);
    });
  });
}

describe('rx-gen-hunt label notes', () => {
  it('start from the same label the label drill makes', () => {
    for (const s of seeds(60)) expect(buildLabel(mulberry32(s), CHART_DATES[0]).text, `seed ${s}`).toBe(makeLabelPassage(mulberry32(s), CHART_DATES[0]).text);
  });

  it('show the prescription in the scenario so every label error can be found by checking', () => {
    let labels = 0;
    for (const s of seeds(100)) {
      const p = makeRxHuntPassage(mulberry32(s), CHART_DATES[0]);
      if (!p.text.startsWith('Rx#')) continue;
      labels++;
      expect(p.ctx, `seed ${s}`).toMatch(/<code>.*Sig: .*<\/code>/);
      expect(p.ctx, `seed ${s}`).toContain('Disp:');
    }
    expect(labels).toBeGreaterThan(50);
  });
});

describe('the generated drills in the registry', () => {
  it('lists the three new drills', () => {
    expect(GENERATED_DRILLS.map((d) => d.id)).toEqual(expect.arrayContaining(['ma-gen-chart', 'ma-gen-hunt', 'rx-gen-hunt']));
    expect(getGeneratedDrill('ma-gen-chart')).toMatchObject({ mode: 'hidden', track: 'ma' });
    expect(getGeneratedDrill('ma-gen-chart')!.glossary).toBeFalsy();
  });
});
