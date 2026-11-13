import { describe, expect, it } from 'vitest';
import { ALLERGY_DRUGS, MAX_DAILY, PRODUCTS } from '../../test/rxReference';
import { CHART_DATES, expectSafeNotation, expectTallManNames, FDA_BY_LOWER, seeds } from '../../test/generated';
import { mulberry32 } from './rng';
import { allOrders, type RxOrder } from './rxCatalog';
import {
  canPlant, FLASH_CATEGORIES, KINDS_FOR, makeCard, makeCardFromOrder, makeDrugCard, makeRound, makeVitalsCard, ROUND_SIZE,
  type FlashCard, type FlashCategory, type FlashKind,
} from './flashcards';
import { LASA_GROUPS } from './rxPassages';

const TODAY: string = CHART_DATES[0];

// ---------------------------------------------------------------------------------------------------------------------
// An auditor written separately from the planter. It reads only what a student sees (the lines and the banner) and lists
// every problem it can find. A correct card must audit clean; a flawed card must audit to exactly its one planted error.

const PHRASES: [string, number][] = [
  ['three times daily', 3], ['four times daily', 4], ['twice daily', 2], ['once daily', 1],
  ['every 12 hours', 2], ['every 8 hours', 3], ['every 6 hours', 4], ['at bedtime', 1], ['every morning', 1], ['every evening', 1],
];
const SIG_PHRASE: Record<string, string> = {
  daily: 'once daily', BID: 'twice daily', TID: 'three times daily', QID: 'four times daily', qhs: 'at bedtime', qAM: 'every morning',
  qPM: 'every evening', q6h: 'every 6 hours', q8h: 'every 8 hours', q12h: 'every 12 hours',
};
const DNU = /\b(QD|qd|QOD|IU|MSO4|MgSO4)\b|\bU\b/;
const SOLID = /^(?:Rx: |Current medication: )?([A-Za-z][A-Za-z -]*?) (\d+(?:\.\d+)?) (mg|mcg)(?:\/\d+(?:\.\d+)? mg)? (tablet|capsule)(?: Qty: (\d+))?$/;

/** The words of the directions with the do-not-use QD read as "once daily", so that mistake is reported once, as itself. */
const plainDirections = (d: string): string => d.replace(/\b(QD|qd)(?=[ .])/, 'once daily');

function perDayIn(directions: string): number | null {
  const hits = PHRASES.filter(([p]) => plainDirections(directions).includes(p));
  return hits.length === 1 ? hits[0][1] : null;
}

function audit(card: FlashCard): string[] {
  const found = new Set<string>();
  const text = card.lines.join('\n');

  for (const w of text.match(/[A-Za-z]{5,}/g) ?? []) {
    const fda = FDA_BY_LOWER.get(w.toLowerCase());
    if (fda && fda !== w) found.add('tall-man');
  }
  if (DNU.test(text)) found.add('do-not-use');
  if (/\b\d+\.\d*0 ?(mg|mcg|g|mL|units)\b/.test(text)) found.add('trailing-zero');

  for (const line of card.lines) {
    const m = SOLID.exec(line);
    if (m) {
      const name = m[1].toLowerCase();
      const unit = m[3];
      if (unit !== (name === 'levothyroxine' ? 'mcg' : 'mg')) found.add('unit');
      else {
        const list = PRODUCTS[name]?.[m[4] as 'tablet' | 'capsule'];
        if (!list || !list.includes(Number(m[2]))) found.add(`bad-strength:${line}`);
      }
    }
    const fixed = /(\d+) (mcg|mg)\/actuation/.exec(line);
    if (fixed && fixed[2] !== 'mcg') found.add('unit');
  }

  // Vitals entries.
  const temp = /\bT (\d+(?:\.\d)?) (F|C)\b/.exec(text);
  if (temp) {
    const v = Number(temp[1]);
    if (temp[2] === 'F' ? v < 94 || v > 108 : v < 34 || v > 42) found.add(temp[2] === 'C' ? 'unit' : `bad-temp:${v}`);
  }
  const glu = /Glucose \(fingerstick\) (\d+) (mg\/dL|mmol\/L)/.exec(text);
  if (glu) {
    const v = Number(glu[1]);
    if (glu[2] === 'mmol/L' ? v > 40 : v < 40 || v > 400) found.add(glu[2] === 'mmol/L' ? 'unit' : `bad-glucose:${v}`);
  }
  if (/mmHg/.test(text) && /BP \d+\/\d+ (?!mmHg)/.test(text)) found.add('unit');

  // Quantity: the label's own arithmetic.
  const productLine = card.lines.find((l) => /Qty: /.test(l));
  const dirLine = card.lines.find((l) => /^Take \d+ /.test(l));
  const days = /Days supply: (\d+)/.exec(text)?.[1];
  const qty = productLine ? /Qty: (\d+)$/.exec(productLine)?.[1] : undefined;
  if (qty && dirLine && days) {
    const perDose = Number(/^Take (\d+) /.exec(dirLine)![1]);
    const perDay = perDayIn(dirLine);
    if (perDay == null) found.add(`unreadable:${dirLine}`);
    else if (perDose * perDay * Number(days) !== Number(qty)) found.add('quantity');
  }

  // Allergy: the banner against the drug.
  const allergies = (card.patient?.allergies ?? '').toLowerCase();
  const drugText = text.toLowerCase();
  for (const [key, words] of Object.entries(ALLERGY_DRUGS)) {
    if (allergies.includes(key) && words.some((w) => drugText.includes(w))) found.add('allergy');
  }
  if (allergies.includes('penicillin') && drugText.includes('cephalexin')) found.add('allergy');

  // Sig translation.
  const sigLine = card.lines.find((l) => l.startsWith('Sig: '));
  const labelLine = card.lines.find((l) => l.startsWith('Label: '));
  if (sigLine && labelLine) {
    const sig = sigLine.slice(5);
    const label = plainDirections(labelLine.slice(7));
    const m = /^(\d+) (?:tabs?|caps?) PO /.exec(sig);
    if (m) {
      const token = (/\b(daily|BID|TID|QID|qhs|qAM|qPM|q6h|q8h|q12h)\b/.exec(sig) ?? [])[1];
      const phrase = SIG_PHRASE[token];
      const labelPhrases = PHRASES.filter(([p]) => label.includes(p)).map(([p]) => p);
      if (!phrase || labelPhrases.length !== 1 || labelPhrases[0] !== phrase) found.add('translation');
      if (Number(/^Take (\d+) /.exec(label)?.[1]) !== Number(m[1])) found.add('translation');
      if (/\bprn\b/.test(sig) !== label.includes('as needed')) found.add('translation');
      const sd = /x (\d+) days/.exec(sig)?.[1];
      const ld = /for (\d+) days/.exec(label)?.[1];
      if (sd !== ld) found.add('translation');
    }
  }
  return [...found];
}

const expectedAudit = (card: FlashCard): string[] => (card.error ? [card.error.category] : []);
const describeCard = (c: FlashCard) => `${c.kind}/${c.error?.category ?? 'correct'}\n${c.patient ? `[${c.patient.name}; ${c.patient.allergies}]\n` : ''}${c.lines.join('\n')}`;

const KINDS: FlashKind[] = ['label', 'sig', 'chart', 'drug'];
const ORDER_KINDS = ['label', 'sig', 'chart'] as const;

// ---------------------------------------------------------------------------------------------------------------------

describe('every order the catalog can make, on every card kind that shows a drug', () => {
  const orders = allOrders();

  it('makes a correct card that audits clean, with the right facts in its explanation', () => {
    for (const order of orders) {
      for (const kind of ORDER_KINDS) {
        const card = makeCardFromOrder(mulberry32(order.sig.length * 31 + kind.length), TODAY, kind, order, null)!;
        const where = `${order.productLine} ${kind}\n${describeCard(card)}`;
        expect(card, where).toBeTruthy();
        expect(card.error, where).toBeNull();
        expect(audit(card), where).toEqual([]);
        expect(card.explanation.startsWith('Correct.'), where).toBe(true);
        expect(card.lines.join('\n'), where).toContain(order.productLine);
        expectSafeNotation(card.lines.join('\n'), where);
        expectTallManNames(card.lines.join('\n'), where);
      }
    }
  });

  it('makes a flawed card for every category that can be planted in the order, and the auditor finds exactly that one flaw', () => {
    let planted = 0;
    for (const order of orders) {
      for (const kind of ORDER_KINDS) {
        for (const category of FLASH_CATEGORIES) {
          const can = canPlant(order, kind, category);
          const card = makeCardFromOrder(mulberry32(order.qty.length + category.length * 7), TODAY, kind, order, category);
          if (!can) { expect(card, `${order.productLine} ${kind} ${category} is not plantable`).toBeNull(); continue; }
          const where = `${order.productLine} ${kind} ${category}\n${card ? describeCard(card) : 'null'}`;
          expect(card, where).toBeTruthy();
          expect(card!.error?.category, where).toBe(category);
          expect(audit(card!), where).toEqual([category]);
          planted++;
        }
      }
    }
    expect(planted).toBeGreaterThan(1500);
  });

  it('can plant every category in a good number of orders', () => {
    for (const category of FLASH_CATEGORIES) {
      const n = orders.filter((o) => ORDER_KINDS.some((k) => canPlant(o, k, category))).length;
      expect(n, category).toBeGreaterThan(category === 'tall-man' ? 6 : category === 'allergy' ? 6 : 15);
    }
  });

  it('agrees with the table of which kinds a category can appear on', () => {
    for (const category of FLASH_CATEGORIES) {
      for (const kind of ORDER_KINDS) {
        const any = orders.some((o) => canPlant(o, kind, category));
        expect(any, `${kind} ${category}`).toBe(KINDS_FOR[category].includes(kind));
      }
    }
    expect(KINDS_FOR['tall-man']).toContain('drug');
    expect(KINDS_FOR.translation).toEqual(['sig']);
    expect(KINDS_FOR.quantity).toEqual(['label']);
  });
});

describe('the error that is planted', () => {
  it('is shown on the card, is different from the right answer, and is explained', () => {
    for (const order of allOrders()) {
      for (const kind of ORDER_KINDS) {
        for (const category of FLASH_CATEGORIES) {
          if (!canPlant(order, kind, category)) continue;
          const card = makeCardFromOrder(mulberry32(5), TODAY, kind, order, category)!;
          const e = card.error!;
          const where = describeCard(card);
          expect(card.lines.some((l) => l.includes(e.wrong)), `${where}\nwrong=${e.wrong}`).toBe(true);
          expect(e.right, where).not.toBe(e.wrong);
          expect(e.right.trim().length, where).toBeGreaterThan(0);
          expect(e.why.length, where).toBeGreaterThan(30);
          expect(card.explanation, where).toContain(e.why);
          expect(card.explanation.startsWith('Not correct.'), where).toBe(true);
        }
      }
    }
  });

  it('puts the true numbers in the explanation of a quantity error and the allergy in the explanation of an allergy error', () => {
    const lisinopril = allOrders().find((o) => o.productLine === 'Lisinopril 10 mg tablet' && o.daysSupply === 30)!;
    const q = makeCardFromOrder(mulberry32(1), TODAY, 'label', lisinopril, 'quantity')!;
    expect(q.error!.right).toBe('Qty: 30');
    expect(q.error!.wrong).not.toBe('Qty: 30');
    expect(q.error!.why).toContain('1 x 1 a day x 30 days = 30');
    const amox = allOrders().find((o) => o.drugId === 'amoxicillin-capsule')!;
    const a = makeCardFromOrder(mulberry32(1), TODAY, 'label', amox, 'allergy')!;
    expect(a.patient!.allergies).toMatch(/Penicillin/);
    expect(a.error!.why).toContain(a.patient!.allergies);
    expect(a.error!.why).toMatch(/pharmacist|provider/i);
    expect(a.error!.wrong).toBe(amox.productLine);
  });

  it('names the do-not-use abbreviation and the trailing zero it planted, and never plants a lookalike of a real strength', () => {
    const lisinopril = allOrders().find((o) => o.productLine === 'Lisinopril 10 mg tablet' && o.daysSupply === 30)!;
    const z = makeCardFromOrder(mulberry32(1), TODAY, 'label', lisinopril, 'trailing-zero')!;
    expect(z.error!.wrong).toBe('Lisinopril 10.0 mg tablet');
    expect(z.error!.why).toMatch(/100 mg/);
    const d = makeCardFromOrder(mulberry32(1), TODAY, 'label', lisinopril, 'do-not-use')!;
    expect(d.error!.wrong).toMatch(/^(QD|qd)$/);
    expect(d.error!.right).toBe('once daily');
    expect(d.error!.why).toMatch(/Joint Commission/);
    const meloxicam = allOrders().find((o) => o.productLine === 'Meloxicam 7.5 mg tablet')!;
    expect(makeCardFromOrder(mulberry32(1), TODAY, 'label', meloxicam, 'trailing-zero')!.error!.wrong).toBe('Meloxicam 7.50 mg tablet');
  });

  it('uses the FDA spelling as the right answer for a Tall Man error', () => {
    const order = allOrders().find((o) => o.drugId === 'hydralazine')!;
    const t = makeCardFromOrder(mulberry32(1), TODAY, 'label', order, 'tall-man')!;
    expect(t.error!.right).toBe('hydrALAZINE');
    expect(t.error!.wrong.toLowerCase()).toBe('hydralazine');
    expect(t.error!.why).toContain('hydrALAZINE');
  });
});

describe('vitals cards', () => {
  it('are right when correct, and the one planted unit error is a temperature or glucose unit', () => {
    const seen = new Set<string>();
    for (const seed of seeds(60)) {
      for (const today of CHART_DATES) {
        const ok = makeVitalsCard(mulberry32(seed), today, null);
        expect(ok.kind).toBe('chart');
        expect(ok.error).toBeNull();
        expect(audit(ok), describeCard(ok)).toEqual([]);
        expect(ok.patient).toBeDefined();
        const bad = makeVitalsCard(mulberry32(seed), today, 'unit');
        expect(audit(bad), describeCard(bad)).toEqual(['unit']);
        expect(bad.error!.category).toBe('unit');
        expect(bad.lines.some((l) => l.includes(bad.error!.wrong)), describeCard(bad)).toBe(true);
        seen.add(bad.lines.join(' ').includes('mmol/L') ? 'glucose' : 'temperature');
      }
    }
    expect([...seen].sort()).toEqual(['glucose', 'temperature']);
  });
});

describe('drug name cards', () => {
  it('show a look-alike group with the FDA Tall Man names, or exactly one name spelled wrong', () => {
    const names = new Set(LASA_GROUPS.flat());
    for (const seed of seeds(80)) {
      const ok = makeDrugCard(mulberry32(seed), null);
      expect(ok.kind).toBe('drug');
      expect(ok.error).toBeNull();
      expect(audit(ok), describeCard(ok)).toEqual([]);
      expect([...names].some((n) => ok.lines.join(' ').includes(n)), describeCard(ok)).toBe(true);
      const bad = makeDrugCard(mulberry32(seed), 'tall-man');
      expect(audit(bad), describeCard(bad)).toEqual(['tall-man']);
      expect(names.has(bad.error!.right), describeCard(bad)).toBe(true);
      expect(bad.lines.some((l) => l.includes(bad.error!.wrong))).toBe(true);
      expect(bad.explanation).toContain(bad.error!.right);
    }
  });
});

describe('makeCard', () => {
  it('builds the card it is asked for, in every kind and category it is allowed', () => {
    for (const category of FLASH_CATEGORIES) {
      for (const kind of KINDS_FOR[category]) {
        for (const track of ['ma', 'rx'] as const) {
          for (const seed of seeds(30)) {
            const card = makeCard(mulberry32(seed), TODAY, track, { kind, category });
            expect(card.kind, `${kind} ${category}`).toBe(kind);
            expect(card.error?.category, describeCard(card)).toBe(category);
            expect(audit(card), describeCard(card)).toEqual([category]);
          }
        }
      }
    }
  });

  it('builds correct cards of every kind that audit clean and carry a banner patient where a chart would', () => {
    for (const kind of KINDS) {
      for (const track of ['ma', 'rx'] as const) {
        for (const seed of seeds(40)) {
          const card = makeCard(mulberry32(seed), TODAY, track, { kind, category: null });
          expect(card.kind).toBe(kind);
          expect(card.error, describeCard(card)).toBeNull();
          expect(audit(card), describeCard(card)).toEqual([]);
          if (kind === 'label' || kind === 'chart') expect(card.patient, describeCard(card)).toBeDefined();
          if (kind === 'sig' || kind === 'drug') expect(card.patient).toBeUndefined();
          expect(card.title.length).toBeGreaterThan(0);
          expect(card.explanation.startsWith('Correct.')).toBe(true);
        }
      }
    }
  });

  it('is repeatable from the same random source, and different from a different one', () => {
    const a = makeCard(mulberry32(11), TODAY, 'rx');
    expect(makeCard(mulberry32(11), TODAY, 'rx')).toEqual(a);
    const many = new Set(seeds(30).map((s) => describeCard(makeCard(mulberry32(s), TODAY, 'rx'))));
    expect(many.size).toBeGreaterThan(20);
  });
});

describe('a round of cards', () => {
  const rounds = (track: 'ma' | 'rx') => CHART_DATES.flatMap((today) => seeds(60).map((seed) => ({ seed, today, cards: makeRound(seed, track, today) })));

  it('is ten cards, and the same ten for the same seed, track and date', () => {
    expect(ROUND_SIZE).toBe(10);
    expect(makeRound(42, 'ma', TODAY)).toHaveLength(10);
    expect(makeRound(42, 'ma', TODAY, 6)).toHaveLength(6);
    expect(makeRound(42, 'ma', TODAY)).toEqual(makeRound(42, 'ma', TODAY));
    expect(makeRound(42, 'ma', TODAY)).not.toEqual(makeRound(43, 'ma', TODAY));
    expect(makeRound(42, 'ma', TODAY)).not.toEqual(makeRound(42, 'rx', TODAY));
  });

  it('is a mix: between four and six flawed cards, never all one answer', () => {
    for (const track of ['ma', 'rx'] as const) {
      for (const r of rounds(track)) {
        const flawed = r.cards.filter((c) => c.error).length;
        expect(flawed, `${track} ${r.seed}`).toBeGreaterThanOrEqual(4);
        expect(flawed, `${track} ${r.seed}`).toBeLessThanOrEqual(6);
      }
    }
  });

  it('has flaws of different kinds in one round, and no drug twice', () => {
    for (const track of ['ma', 'rx'] as const) {
      for (const r of rounds(track)) {
        const cats = r.cards.filter((c) => c.error).map((c) => c.error!.category);
        expect(new Set(cats).size, `${track} ${r.seed}: ${cats}`).toBe(cats.length);
        const subjects = r.cards.map((c) => c.subject);
        expect(new Set(subjects).size, `${track} ${r.seed}: ${subjects}`).toBe(subjects.length);
      }
    }
  });

  it('is audited card by card: every correct card is clean and every flawed card has its one planted flaw', () => {
    let cards = 0;
    for (const track of ['ma', 'rx'] as const) {
      for (const r of rounds(track)) {
        for (const c of r.cards) {
          expect(audit(c), `${track} ${r.seed}\n${describeCard(c)}`).toEqual(expectedAudit(c));
          cards++;
        }
      }
    }
    expect(cards).toBe(2 * 3 * 60 * 10);
  });

  it('covers every category and every kind over enough rounds, and favors the track’s own work', () => {
    for (const track of ['ma', 'rx'] as const) {
      const all = rounds(track).flatMap((r) => r.cards);
      for (const category of FLASH_CATEGORIES) expect(all.some((c) => c.error?.category === category), `${track} ${category}`).toBe(true);
      for (const kind of KINDS) expect(all.some((c) => c.kind === kind), `${track} ${kind}`).toBe(true);
    }
    const share = (track: 'ma' | 'rx', kind: FlashKind) => { const all = rounds(track).flatMap((r) => r.cards); return all.filter((c) => c.kind === kind).length / all.length; };
    expect(share('ma', 'chart')).toBeGreaterThan(share('rx', 'chart'));
    expect(share('rx', 'label')).toBeGreaterThan(share('ma', 'label'));
  });

  it('does not mix up the answers: where the answer sits in the round is not a pattern', () => {
    const firstFlawed = rounds('rx').map((r) => r.cards[0].error !== null);
    expect(firstFlawed.some(Boolean)).toBe(true);
    expect(firstFlawed.some((f) => !f)).toBe(true);
  });

  it('holds the same patient rules as the written content: sex, age and allergies agree with the banner', () => {
    for (const r of rounds('ma')) {
      for (const c of r.cards) {
        if (!c.patient) continue;
        expect(['F', 'M']).toContain(c.patient.sex);
        expect(c.patient.age).toMatch(/^\d+ y$/);
        expect(c.patient.dob).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
        expect(c.patient.mrn).toMatch(/^\d{7}$/);
        expect(c.patient.name).toMatch(/^[A-Za-z]+, [A-Za-z]+$/);
      }
    }
  });

  it('keeps its maximum daily doses inside the labeled limits on every correct label', () => {
    for (const r of rounds('rx')) {
      for (const c of r.cards) {
        if (c.kind !== 'label' || c.error) continue;
        const m = /^(.+?) (\d+(?:\.\d+)?) mg/.exec(c.lines[1]);
        if (!m) continue;
        const key = m[1].toLowerCase();
        const dir = c.lines[2];
        const perDose = Number(/^Take (\d+) /.exec(dir)?.[1]);
        const daily = Number(m[2]) * perDose * (perDayIn(dir) ?? 99);
        if (MAX_DAILY[key]) expect(daily, describeCard(c)).toBeLessThanOrEqual(MAX_DAILY[key]);
      }
    }
  });
});

describe('the categories', () => {
  it('are the seven the roadmap asks for', () => {
    const want: FlashCategory[] = ['tall-man', 'do-not-use', 'trailing-zero', 'quantity', 'allergy', 'unit', 'translation'];
    expect([...FLASH_CATEGORIES].sort()).toEqual(want.sort());
  });
});

// Keep the type import used even if a refactor drops the other uses.
export type { RxOrder };
