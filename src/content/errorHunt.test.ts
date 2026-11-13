import { describe, expect, it } from 'vitest';
import { getDrill, libraryDrills } from './index';
import { plantedErrors, scoreHunt } from '../lib/errorHunt';
import { FDA_TALL_MAN } from '../test/tallman';
import type { Drill, HuntCategory, Track } from './types';

const DRILL_IDS: [Track, string][] = [['ma', 'ma-hunt'], ['rx', 'rx-hunt']];
const CATEGORIES: HuntCategory[] = ['number', 'unit', 'spelling', 'patient', 'allergy', 'tall-man', 'do-not-use', 'logic'];
const DO_NOT_USE = /\b(QD|Q\.D\.|QOD|IU|MSO4|MgSO4|MS|U)\b|\b\d+\.0+\b|(^|[\s(])\.\d/;
const bare = (w: string) => w.replace(/[.,;:!?()]+$/g, '').replace(/^[(]+/, '');

describe('error hunt drills', () => {
  it('exist for both tracks as proofreading drills with a full set of passages', () => {
    for (const [track, id] of DRILL_IDS) {
      const d = getDrill(id) as Drill;
      expect(d, id).toBeTruthy();
      expect(d.track).toBe(track);
      expect(d.mode).toBe('hunt');
      expect(d.exam).toBeFalsy();
      expect(d.title).toMatch(/error hunt/i);
      expect(d.items.length, id).toBeGreaterThanOrEqual(8);
    }
  });

  it('are listed in the practice library of their own track only', () => {
    expect(libraryDrills('ma').map((d) => d.id)).toContain('ma-hunt');
    expect(libraryDrills('ma').map((d) => d.id)).not.toContain('rx-hunt');
    expect(libraryDrills('rx').map((d) => d.id)).toContain('rx-hunt');
    expect(libraryDrills('rx').map((d) => d.id)).not.toContain('ma-hunt');
  });

  for (const [, id] of DRILL_IDS) {
    describe(id, () => {
      const drill = () => getDrill(id)!;

      it('has a flawed note and a described list of errors for every passage', () => {
        drill().items.forEach((p, i) => {
          expect(typeof p.flawed, `${id} #${i} flawed`).toBe('string');
          expect(Array.isArray(p.errors), `${id} #${i} errors`).toBe(true);
          expect(p.flawed, `${id} #${i}`).not.toBe(p.text);
        });
      });

      it('declares exactly the errors that were planted, three to five in each note', () => {
        drill().items.forEach((p, i) => {
          const planted = plantedErrors(p.flawed!, p.text);
          expect(planted.length, `${id} #${i} planted ${JSON.stringify(planted.map((e) => `${e.flawed} -> ${e.fixed}`))}`).toBe(p.errors!.length);
          expect(p.errors!.length, `${id} #${i}`).toBeGreaterThanOrEqual(3);
          expect(p.errors!.length, `${id} #${i}`).toBeLessThanOrEqual(5);
        });
      });

      it('explains every error in plain text with a known category', () => {
        drill().items.forEach((p, i) => p.errors!.forEach((e, k) => {
          expect(CATEGORIES, `${id} #${i} error ${k}`).toContain(e.category);
          expect(e.why.trim().length, `${id} #${i} error ${k}`).toBeGreaterThan(10);
          expect(e.why.length, `${id} #${i} error ${k}`).toBeLessThanOrEqual(220);
          expect(e.why, `${id} #${i} error ${k}`).not.toMatch(/[<>]/);
        }));
      });

      it('has a flawed note that can be typed, and looks like the real note', () => {
        drill().items.forEach((p, i) => {
          const f = p.flawed!;
          expect(f, `${id} #${i}`).toMatch(/^[\x20-\x7E\n]+$/);
          expect(f, `${id} #${i}`).toBe(f.trim());
          expect(f, `${id} #${i}`).not.toMatch(/ {2}/);
          for (const line of f.split('\n')) { expect(line.length, `${id} #${i}`).toBeGreaterThan(0); expect(line, `${id} #${i}`).toBe(line.trimEnd()); }
          expect(f.split('\n').length, `${id} #${i} same number of lines`).toBe(p.text.split('\n').length);
          expect(f.length / p.text.length, `${id} #${i} length`).toBeGreaterThan(0.8);
          expect(f.length / p.text.length, `${id} #${i} length`).toBeLessThan(1.25);
        });
      });

      it('tells the student how many errors to find, and the number is right', () => {
        drill().items.forEach((p, i) => expect(p.ctx, `${id} #${i}`).toContain(`There are ${p.errors!.length} errors`));
      });

      it('scores the correct note as complete and the flawed note as nothing fixed', () => {
        drill().items.forEach((p, i) => {
          expect(scoreHunt(p.flawed!, p.text, p.text), `${id} #${i} correct`).toMatchObject({ completed: true, accuracy: 100, introduced: 0 });
          expect(scoreHunt(p.flawed!, p.text, p.flawed!), `${id} #${i} flawed`).toMatchObject({ fixed: 0, completed: false });
        });
      });

      it('plants each kind of error the way its category says', () => {
        drill().items.forEach((p, i) => plantedErrors(p.flawed!, p.text).forEach((e, k) => {
          const where = `${id} #${i} error ${k} ("${e.flawed}" -> "${e.fixed}")`;
          const cat = p.errors![k]?.category;
          if (cat === 'number') { expect(e.flawed, where).toMatch(/\d/); expect(e.fixed, where).toMatch(/\d/); }
          if (cat === 'do-not-use') { expect(e.flawed, where).toMatch(DO_NOT_USE); expect(e.fixed, where).not.toMatch(DO_NOT_USE); }
          if (cat === 'tall-man') {
            expect(FDA_TALL_MAN.has(bare(e.fixed)), `${where}: fixed spelling is on the FDA list`).toBe(true);
            expect(bare(e.flawed), where).toBe(bare(e.fixed).toLowerCase());
          }
        }));
      });

      it('has a different note in every passage', () => {
        const texts = drill().items.map((p) => p.text);
        expect(new Set(texts).size).toBe(texts.length);
        expect(new Set(drill().items.map((p) => p.ctx)).size).toBe(texts.length);
      });
    });
  }

  it('covers the safety habits of each track', () => {
    const cats = (id: string) => new Set(getDrill(id)!.items.flatMap((p) => p.errors!.map((e) => e.category)));
    for (const c of ['do-not-use', 'patient', 'allergy', 'number', 'unit', 'spelling', 'logic'] as HuntCategory[]) expect(cats('ma-hunt').has(c), `ma-hunt has ${c}`).toBe(true);
    for (const c of ['do-not-use', 'tall-man', 'patient', 'allergy', 'number', 'unit', 'spelling', 'logic'] as HuntCategory[]) expect(cats('rx-hunt').has(c), `rx-hunt has ${c}`).toBe(true);
  });
});
