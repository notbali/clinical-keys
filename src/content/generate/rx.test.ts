import { describe, expect, it } from 'vitest';
import { FDA_TALL_MAN } from '../../test/tallman';
import { ALLERGY_DRUGS, AUX_WORDING, MAX_DAILY, PRODUCTS, type Form } from '../../test/rxReference';
import { CHART_DATES, expectSafeNotation, expectTallManNames, expectTypeable, expectValidCtx, seeds } from '../../test/generated';
import { GLOSSARY } from '../glossary';
import { mulberry32 } from './rng';
import { PROVIDERS } from './patient';
import { allOrders, randomOrder, type RxOrder } from './rxCatalog';
import { LASA_GROUPS, makeLabelPassage, makeLasaPassage, makeSigPassage } from './rxPassages';

const TODAY: string = CHART_DATES[0];

/** Frequency wording on a label and how many doses a day it means. Exactly one must appear in the directions. */
const FREQ_PHRASES: [string, number][] = [
  ['three times daily', 3], ['four times daily', 4], ['twice daily', 2], ['once daily', 1],
  ['every 12 hours', 2], ['every 8 hours', 3], ['every 6 hours', 4], ['at bedtime', 1], ['every morning', 1], ['every evening', 1],
];
const perDayOf = (directions: string): number => {
  const hits = FREQ_PHRASES.filter(([p]) => directions.includes(p));
  expect(hits.length, `one frequency in "${directions}"`).toBe(1);
  return hits[0][1];
};

const SOLID = /^(.+?) (\d+(?:\.\d+)?) (mg|mcg)(?:\/\d+(?:\.\d+)? mg)? (tablet|capsule)$/;
const solids = (): RxOrder[] => allOrders().filter((o) => o.kind !== 'fixed');
const parseSolid = (o: RxOrder) => {
  const m = SOLID.exec(o.productLine);
  expect(m, `product line "${o.productLine}"`).toBeTruthy();
  return { name: m![1].toLowerCase(), strength: Number(m![2]), form: m![4] as Form };
};

/** Which allergy class (in the order's own vocabulary) each allergy key in the test reference stands for. */
const CLASS_OF: Record<string, string> = { penicillin: 'penicillin', sulfa: 'sulfa', codeine: 'codeine', aspirin: 'nsaid', nsaid: 'nsaid' };

describe('the drug catalog, checked on every combination it can produce', () => {
  const orders = allOrders();

  it('is big enough to feel endless, with no duplicate orders', () => {
    expect(orders.length).toBeGreaterThan(150);
    const keys = orders.map((o) => `${o.productLine}|${o.sig}|${o.qty}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(orders.map((o) => o.drugId)).size).toBeGreaterThanOrEqual(30);
  });

  it('only uses strengths and dosage forms that really exist', () => {
    for (const o of solids()) {
      const { name, strength, form } = parseSolid(o);
      expect(PRODUCTS[name], `unknown drug "${name}" (add it to src/test/rxReference.ts if it is real)`).toBeTruthy();
      expect(PRODUCTS[name][form], `${o.productLine}: not sold as a ${form}`).toBeTruthy();
      expect(PRODUCTS[name][form], o.productLine).toContain(strength);
    }
  });

  it('never goes over the labeled adult maximum per day', () => {
    for (const o of solids()) {
      const { name, strength } = parseSolid(o);
      const perDose = Number(/^Take (\d+) /.exec(o.directions)?.[1]);
      const daily = strength * perDose * perDayOf(o.directions);
      expect(MAX_DAILY[name], `no maximum on file for ${name}`).toBeTruthy();
      expect(daily, `${o.productLine}: ${o.directions} = ${daily} a day`).toBeLessThanOrEqual(MAX_DAILY[name]);
    }
  });

  it('works out the quantity from the directions and the days supply', () => {
    for (const o of solids()) {
      const perDose = Number(/^Take (\d+) /.exec(o.directions)?.[1]);
      expect(o.daysSupply, o.productLine).toBeGreaterThan(0);
      expect(o.qtyNumber, `${o.productLine}: ${o.directions}`).toBe(perDose * perDayOf(o.directions) * o.daysSupply!);
      expect(o.qty).toBe(String(o.qtyNumber));
    }
  });

  it('writes directions in the label style: Take N tablets by mouth, plural only when needed', () => {
    for (const o of solids()) {
      const { form } = parseSolid(o);
      const m = /^Take (\d+) (tablets?|capsules?) by mouth /.exec(o.directions);
      expect(m, o.directions).toBeTruthy();
      expect(m![2], o.directions).toBe(Number(m![1]) === 1 ? form : `${form}s`);
      expect(o.directions, o.directions).toMatch(/\.$/);
    }
  });

  it('says how long a course lasts, and only for courses', () => {
    for (const o of solids()) {
      const days = /for (\d+) days/.exec(o.directions)?.[1];
      if (o.kind === 'course') expect(Number(days), o.directions).toBe(o.daysSupply);
      else expect(days, o.directions).toBeUndefined();
      expect(/as needed for/.test(o.directions), o.directions).toBe(o.kind === 'prn');
      if (o.kind === 'maintenance') expect([30, 90], o.productLine).toContain(o.daysSupply);
    }
  });

  it('lines the sig shorthand up with the label directions, one for one', () => {
    for (const o of solids()) {
      const m = /^(\d+) (tabs?|caps?) PO /.exec(o.sig);
      expect(m, o.sig).toBeTruthy();
      expect(o.directions.startsWith(`Take ${m![1]} `), `${o.sig} -> ${o.directions}`).toBe(true);
      expect(o.sig, o.sig).not.toMatch(/\bqd\b/i);
    }
  });

  it('gives antibiotics the "finish all of this medication" label, and only known auxiliary wording', () => {
    for (const o of orders) {
      for (const a of o.aux) expect(AUX_WORDING.has(a), `${o.productLine}: "${a}"`).toBe(true);
      if (o.antibiotic) expect(o.aux, o.productLine).toContain('Finish all of this medication unless otherwise directed by prescriber.');
    }
    expect(orders.some((o) => o.antibiotic)).toBe(true);
  });

  it('tags every drug with the allergy classes that would forbid it', () => {
    for (const o of orders) {
      const text = `${o.productLine} ${o.directions}`.toLowerCase();
      for (const [key, words] of Object.entries(ALLERGY_DRUGS)) {
        if (words.some((w) => text.includes(w))) expect(o.classes, `${o.productLine} is a ${key} drug`).toContain(CLASS_OF[key]);
      }
    }
    expect(orders.filter((o) => o.classes.includes('penicillin')).length).toBeGreaterThan(0);
    expect(orders.filter((o) => o.classes.includes('sulfa')).length).toBeGreaterThan(0);
    expect(orders.filter((o) => o.classes.includes('nsaid')).length).toBeGreaterThan(0);
  });

  it('is safe to type: Tall Man names exact, no do-not-use abbreviations, nothing untypeable', () => {
    for (const o of orders) {
      const text = [o.productLine, o.directions, o.sig, ...o.aux].join('\n');
      expectTypeable(text, o.productLine);
      expectSafeNotation(text, o.productLine);
      expectTallManNames(text, o.productLine);
    }
  });

  it('uses Tall Man lettering where the FDA list has a drug the catalog carries', () => {
    for (const name of ['hydrALAZINE', 'hydrOXYzine', 'glipiZIDE', 'predniSONE', 'traZODone', 'busPIRone', 'buPROPion XL', 'NIFEdipine ER']) {
      expect(orders.some((o) => o.productLine.startsWith(`${name} `)), name).toBe(true);
      expect(FDA_TALL_MAN.has(name.split(' ')[0]), name).toBe(true);
    }
  });

  it('includes an inhaler, a nasal spray and eye drops with their own quantity wording', () => {
    const fixed = orders.filter((o) => o.kind === 'fixed');
    expect(fixed.map((o) => o.productLine)).toEqual(expect.arrayContaining([
      'Albuterol HFA 90 mcg/actuation inhaler', 'Fluticasone 50 mcg/actuation nasal spray', 'Latanoprost 0.005% eye drops',
    ]));
    for (const o of fixed) expect(o.qty, o.productLine).toMatch(/^1 \(\d+(?:\.\d+)? (g|mL)\)$/);
    expect(fixed.find((o) => o.productLine.startsWith('Albuterol'))!.directions).toBe('Inhale 2 puffs every 4 to 6 hours as needed for shortness of breath.');
  });

  it('gives every order at least one refill choice, and none for courses', () => {
    for (const o of orders) {
      expect(o.refillOptions.length, o.productLine).toBeGreaterThan(0);
      for (const r of o.refillOptions) { expect(r).toBeGreaterThanOrEqual(0); expect(r).toBeLessThanOrEqual(5); }
      if (o.kind === 'course') expect(o.refillOptions, o.productLine).toEqual([0]);
    }
  });
});

describe('randomOrder', () => {
  const draw = (n: number, avoid?: Parameters<typeof randomOrder>[1]) => seeds(n).map((s) => randomOrder(mulberry32(s), avoid));

  it('is repeatable', () => {
    for (const s of seeds(15)) expect(randomOrder(mulberry32(s))).toEqual(randomOrder(mulberry32(s)));
  });

  it('reaches every kind of order and most of the catalog', () => {
    const got = draw(800);
    expect(new Set(got.map((o) => o.kind))).toEqual(new Set(['maintenance', 'course', 'prn', 'fixed']));
    expect(new Set(got.map((o) => o.drugId)).size).toBeGreaterThanOrEqual(30);
  });

  it('never returns a drug in a class it was told to avoid', () => {
    for (const avoid of [{ avoid: ['penicillin'] }, { avoid: ['sulfa', 'nsaid'] }, { avoid: ['penicillin', 'sulfa', 'nsaid', 'codeine'] }] as const) {
      for (const o of draw(300, avoid)) for (const c of avoid.avoid) expect(o.classes, o.productLine).not.toContain(c);
    }
  });
});

describe('generated prescription labels', () => {
  const labels = (today = TODAY, n = 300) => seeds(n).map((s) => makeLabelPassage(mulberry32(s), today));
  const last = (text: string) => text.split('\n').at(-1)!;

  it('are four or five lines in the written labels’ layout, led by the Rx number and the patient', () => {
    for (const p of labels()) {
      const lines = p.text.split('\n');
      expect(lines.length, p.text).toBeGreaterThanOrEqual(4);
      expect(lines.length, p.text).toBeLessThanOrEqual(5);
      expect(lines[0], p.text).toBe(`Rx# ${/^Rx# (44\d{5}) /.exec(lines[0])?.[1]} ${p.patient!.name}`);
      expect(lines[1], p.text).toMatch(/ Qty: \S/);
      expect(last(p.text), p.text).toMatch(/^(Days supply: \d+ )?Refills: \d Dr\. [A-Z]\. [A-Za-z]+$/);
    }
  });

  it('name the same prescriber as the chart banner, and show a banner with every label', () => {
    for (const p of labels()) {
      expect(p.patient, p.text).toBeTruthy();
      expect(PROVIDERS).toContain(p.patient!.provider);
      expect(last(p.text), p.text).toContain(p.patient!.provider);
    }
  });

  it('keep the quantity, days supply and directions in agreement', () => {
    let checked = 0;
    for (const p of labels()) {
      const lines = p.text.split('\n');
      const supply = /Days supply: (\d+)/.exec(last(p.text));
      const qty = /Qty: (\d+)$/.exec(lines[1]);
      const dose = /^Take (\d+) /.exec(lines[2]);
      if (!supply || !qty || !dose) continue;
      checked++;
      expect(Number(qty[1]), p.text).toBe(Number(dose[1]) * perDayOf(lines[2]) * Number(supply[1]));
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('give refills the way a pharmacy would: none on an antibiotic course, a few on a maintenance drug', () => {
    for (const p of labels()) {
      const refills = Number(/Refills: (\d)/.exec(last(p.text))![1]);
      if (p.text.includes('Finish all of this medication')) expect(refills, p.text).toBe(0);
      if (/Days supply: (30|90) /.test(last(p.text)) && !/as needed/.test(p.text)) expect(refills, p.text).toBeGreaterThanOrEqual(1);
    }
  });

  it('never give a patient a drug they are allergic to', () => {
    for (const today of CHART_DATES) for (const p of labels(today)) {
      const allergies = p.patient!.allergies.toLowerCase();
      if (allergies === 'nkda') continue;
      for (const [key, drugs] of Object.entries(ALLERGY_DRUGS)) {
        if (!allergies.includes(key)) continue;
        for (const drug of drugs) expect(p.text.toLowerCase(), `allergy ${key}`).not.toContain(drug);
      }
    }
  });

  it('are typeable, free of do-not-use notation, and spell Tall Man names exactly', () => {
    for (const p of labels()) {
      expectTypeable(p.text, p.text);
      expectSafeNotation(p.text, p.text);
      expectTallManNames(p.text, p.text);
      expect(p.text.length, p.text).toBeGreaterThanOrEqual(80);
      expect(p.text.length, p.text).toBeLessThanOrEqual(520);
    }
  });

  it('explain the arithmetic in the scenario line, and that line agrees with the label', () => {
    for (const p of labels()) {
      expectValidCtx(p.ctx, p.text);
      expect(p.ctx, p.text).toContain('Enter');
      const m = /(Once|Twice|Three times|Four times) a day for (\d+) days.*?: (\d+) (?:tablets?|capsules?)/.exec(p.ctx);
      if (!m) continue;
      expect(Number(m[3]), `${p.ctx} vs ${p.text}`).toBe(Number(/Qty: (\d+)/.exec(p.text)![1]));
      expect(Number(m[2]), p.ctx).toBe(Number(/Days supply: (\d+)/.exec(last(p.text))![1]));
    }
  });

  it('never run out: hundreds of different labels, and the same seed repeats the same label', () => {
    expect(new Set(labels().map((p) => p.text)).size).toBeGreaterThan(250);
    for (const s of seeds(10)) expect(makeLabelPassage(mulberry32(s), TODAY)).toEqual(makeLabelPassage(mulberry32(s), TODAY));
  });
});

describe('generated sig translations', () => {
  const MEANING: Record<string, RegExp> = {
    PO: /by mouth/, SL: /under the tongue/, OU: /both eyes/, gtt: /drops?/, gtts: /drops?/, daily: /once daily/, BID: /twice daily/, TID: /three times daily/, QID: /four times daily/,
    q4h: /every 4 hours/, q6h: /every 6 hours/, q8h: /every 8 hours/, q12h: /every 12 hours/, qAM: /every morning/, qPM: /every evening/, qhs: /at bedtime/,
    ac: /before/, prn: /as needed/, ea: /each/, tab: /tablet/, tabs: /tablets/, cap: /capsule/, caps: /capsules/, x: /for/,
    SOB: /shortness of breath/, 'N/V': /nausea and vomiting/, inh: /inhale/,
  };
  const PLAIN = new Set(['pain', 'muscle', 'spasm', 'itching', 'cough', 'sleep', 'with', 'food', 'meals', 'breakfast', 'puffs', 'sprays', 'nostril', 'days', 'q4-6h', 'on', 'empty', 'stomach']);
  const glossaryTokens = new Set(GLOSSARY.map(([k]) => k.replace('(s)', '')));
  const items = (n = 400) => seeds(n).map((s) => makeSigPassage(mulberry32(s), TODAY));
  const sigOf = (ctx: string) => /<code>(.*?)<\/code>/.exec(ctx)?.[1];

  it('show a product and a <code> sig, and ask for the label directions', () => {
    for (const p of items()) {
      expect(p.ctx, p.ctx).toMatch(/^<b>[^<]+<\/b> &nbsp; Sig: <code>[^<]+<\/code>$/);
      expectValidCtx(p.ctx, p.text);
      expect(p.text, p.ctx).toMatch(/\.$/);
      expect(p.text, p.ctx).not.toContain('\n');
    }
  });

  it('turn every sig code into the right words, as the written translator drills are checked', () => {
    for (const p of items()) {
      const sig = sigOf(p.ctx)!;
      for (const token of sig.split(/[\s,]+/)) {
        const want = MEANING[token];
        if (want) expect(p.text.toLowerCase(), `"${token}" in "${sig}" -> "${p.text}"`).toMatch(want);
      }
      const lead = /^(\d+) /.exec(sig);
      if (lead) expect(p.text, `${sig} -> ${p.text}`).toMatch(new RegExp(`^[A-Z][a-z]+ ${lead[1]} `));
    }
  });

  it('use only abbreviations that are on the cheat sheet shown beside the drill', () => {
    for (const p of items()) {
      for (const token of sigOf(p.ctx)!.split(/[\s,]+/)) {
        if (/^[\d.-]+$/.test(token) || PLAIN.has(token)) continue;
        expect(glossaryTokens.has(token) || /^(tabs|caps)$/.test(token), `"${token}" in "${sigOf(p.ctx)}" is not on the cheat sheet`).toBe(true);
      }
    }
  });

  it('are typeable and safe, with no quantity and no auxiliary wording in the answer', () => {
    for (const p of items()) {
      expectTypeable(p.text, p.text);
      expectSafeNotation(`${p.text} ${p.ctx}`, p.text);
      expectTallManNames(`${p.text} ${p.ctx}`, p.text);
      expect(p.text, p.text).not.toMatch(/Qty|Refills|Rx#/);
    }
  });

  it('use real strengths on the product line', () => {
    for (const p of items()) {
      const product = /<b>([^<]+)<\/b>/.exec(p.ctx)![1];
      const m = SOLID.exec(product);
      if (!m) continue;
      expect(PRODUCTS[m[1].toLowerCase()]?.[m[4] as Form], product).toContain(Number(m[2]));
    }
  });

  // A sig exercise is the product plus its sig. Days supply and refills do not show in it, so there are fewer of these than
  // orders. This is the honest size of the drill: about four times the 25 written translator items, not endless.
  it('draws from at least 90 different prescriptions, and a few hundred draws reach most of them', () => {
    const possible = new Set(allOrders().map((o) => `${o.productLine}|${o.sig}`));
    expect(possible.size).toBeGreaterThanOrEqual(90);
    expect(new Set(items().map((p) => p.ctx + p.text)).size).toBeGreaterThan(70);
  });

  it('repeats exactly for the same seed', () => {
    for (const s of seeds(10)) expect(makeSigPassage(mulberry32(s), TODAY)).toEqual(makeSigPassage(mulberry32(s), TODAY));
  });
});

describe('generated Tall Man (look-alike) drills', () => {
  const items = (n = 200) => seeds(n).map((s) => makeLasaPassage(mulberry32(s), TODAY));
  const tallMan = (text: string) => (text.match(/[A-Za-z]{5,}/g) ?? []).filter((w) => w !== w.toLowerCase() && w !== w.toUpperCase() && w !== w[0] + w.slice(1).toLowerCase());

  it('draw their groups only from names on the FDA list, spelled exactly', () => {
    expect(LASA_GROUPS.length).toBeGreaterThanOrEqual(15);
    const all = LASA_GROUPS.flat();
    expect(new Set(all).size, 'a name is in two groups').toBe(all.length);
    for (const g of LASA_GROUPS) { expect(g.length).toBeGreaterThanOrEqual(2); for (const n of g) expect(FDA_TALL_MAN.has(n), n).toBe(true); }
  });

  it('keep every look-alike pair together and every name in Tall Man lettering', () => {
    for (const p of items()) {
      const words = tallMan(p.text);
      expect(words.length, p.text).toBeGreaterThanOrEqual(4);
      for (const w of words) expect(FDA_TALL_MAN.has(w), `${w} in "${p.text}"`).toBe(true);
      const groupsShown = LASA_GROUPS.filter((g) => g.some((n) => p.text.includes(n)));
      for (const g of groupsShown) for (const n of g) expect(p.text, `group ${g.join(' / ')} must be shown whole`).toContain(n);
      expectTallManNames(p.text, p.text);
    }
  });

  it('show no group twice in one passage, are typeable, and have valid scenario text', () => {
    for (const p of items()) {
      expectTypeable(p.text, p.text);
      expectSafeNotation(p.text, p.text);
      expectValidCtx(p.ctx, p.text);
      const counts = tallMan(p.text).reduce<Record<string, number>>((m, w) => ({ ...m, [w]: (m[w] ?? 0) + 1 }), {});
      for (const [w, c] of Object.entries(counts)) expect(c, `${w} repeated in "${p.text}"`).toBeLessThanOrEqual(2);
    }
  });

  it('vary, and repeat exactly for the same seed', () => {
    expect(new Set(items().map((p) => p.text)).size).toBeGreaterThan(120);
    for (const s of seeds(10)) expect(makeLasaPassage(mulberry32(s), TODAY)).toEqual(makeLasaPassage(mulberry32(s), TODAY));
  });
});
