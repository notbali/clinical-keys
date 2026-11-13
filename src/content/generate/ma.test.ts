import { describe, expect, it } from 'vitest';
import { ALLERGY_DRUGS, MAX_DAILY, PRODUCTS, type Form } from '../../test/rxReference';
import { CHART_DATES, ageOnDate, expectSafeNotation, expectTallManNames, expectTypeable, expectValidCtx, seeds } from '../../test/generated';
import { mulberry32 } from './rng';
import { providerSurname } from './patient';
import { makePhonePassage, makeSoapPassage, makeVitalsPassage } from './maPassages';

const TODAY: string = CHART_DATES[0];
const DAILY_OF: Record<string, number> = { daily: 1, BID: 2, TID: 3, QID: 4, q6h: 4, q8h: 3, q12h: 2 };
const NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Every "Drug 500 mg ... BID" in a note must be a real strength at a safe daily total. Returns how many were checked. */
function checkDoses(text: string, where: string): number {
  let n = 0;
  for (const m of text.matchAll(/\b([A-Za-z]+(?:-[a-z]+)?) (\d+(?:\.\d+)?) (mg|mcg)\b(?:,? (?:PO |\d+ tablets? )?)?(daily|BID|TID|QID|q\d+h|once daily|twice daily)?/g)) {
    const key = m[1].toLowerCase();
    if (!(key in PRODUCTS)) continue;
    n++;
    const strength = Number(m[2]);
    expect(Object.values(PRODUCTS[key]).flat(), `${where}: ${m[0]}`).toContain(strength);
    const freq = m[4] === 'once daily' ? 'daily' : m[4] === 'twice daily' ? 'BID' : m[4];
    if (freq && DAILY_OF[freq]) expect(strength * DAILY_OF[freq], `${where}: ${m[0]} per day`).toBeLessThanOrEqual(MAX_DAILY[key]);
  }
  return n;
}

const noAllergyConflict = (text: string, allergies: string, where: string) => {
  const a = allergies.toLowerCase();
  if (a === 'nkda') return;
  for (const [key, drugs] of Object.entries(ALLERGY_DRUGS)) {
    if (!a.includes(key)) continue;
    for (const d of drugs) expect(text.toLowerCase(), `${where}: allergy ${key}`).not.toContain(d);
  }
};

describe('generated SOAP notes', () => {
  const notes = (today = TODAY, n = 400) => seeds(n).map((s) => makeSoapPassage(mulberry32(s), today));
  const parts = (text: string) => { const l = text.split('\n'); return { S: l[0], O: l[1], A: l[2], P: l[3], count: l.length }; };

  it('are four lines, S then O then A then P, with a banner patient', () => {
    for (const p of notes()) {
      const t = parts(p.text);
      expect(t.count, p.text).toBe(4);
      expect(t.S.startsWith('S: '), p.text).toBe(true);
      expect(t.O.startsWith('O: '), p.text).toBe(true);
      expect(t.A.startsWith('A: '), p.text).toBe(true);
      expect(t.P.startsWith('P: '), p.text).toBe(true);
      expect(p.patient, p.text).toBeTruthy();
    }
  });

  it('say the age and sex the chart banner shows, and the date of birth gives that age', () => {
    for (const today of CHART_DATES) for (const p of notes(today)) {
      const m = /^S: (\d+) y\/o (male|female) /.exec(p.text);
      expect(m, p.text).toBeTruthy();
      expect(`${m![1]} y`, p.text).toBe(p.patient!.age);
      expect(m![2] === 'female' ? 'F' : 'M', p.text).toBe(p.patient!.sex);
      expect(ageOnDate(p.patient!.dob, today), p.text).toBe(Number(m![1]));
    }
  });

  it('record believable vitals in the O line', () => {
    for (const p of notes()) {
      const m = /T (\d+\.\d) F, P (\d+), R (\d+), BP (\d+)\/(\d+)/.exec(parts(p.text).O);
      expect(m, p.text).toBeTruthy();
      const [t, pulse, r, sys, dia] = m!.slice(1).map(Number);
      expect(t).toBeGreaterThanOrEqual(97); expect(t).toBeLessThanOrEqual(103);
      expect(pulse).toBeGreaterThanOrEqual(56); expect(pulse).toBeLessThanOrEqual(112);
      expect(r).toBeGreaterThanOrEqual(12); expect(r).toBeLessThanOrEqual(22);
      expect(sys).toBeGreaterThanOrEqual(100); expect(sys).toBeLessThanOrEqual(170);
      expect(dia).toBeGreaterThanOrEqual(60); expect(dia).toBeLessThanOrEqual(100);
      expect(sys - dia).toBeGreaterThanOrEqual(30);
    }
  });

  it('cover at least eight different conditions', () => {
    expect(new Set(notes().map((p) => parts(p.text).A)).size).toBeGreaterThanOrEqual(8);
  });

  it('keep each note about one condition: the history, the exam, the diagnosis and the plan agree', () => {
    for (const p of notes()) {
      const { S, O, A, P } = parts(p.text);
      const where = p.text;
      if (/Strep pharyngitis/.test(A)) {
        expect(S, where).toMatch(/sore throat/);
        expect(Number(/T (\d+\.\d)/.exec(O)![1]), where).toBeGreaterThanOrEqual(100.4);
        expect(P, where).toMatch(/Amoxicillin/);
      }
      if (/Upper respiratory infection/.test(A)) {
        expect(S, where).toMatch(/cough/);
        expect(Number(/T (\d+\.\d)/.exec(O)![1]), where).toBeLessThan(100);
      }
      if (/UTI|urinary tract/i.test(A)) {
        expect(S, where).toMatch(/female/);
        expect(S, where).toMatch(/burning with urination/);
        expect(P, where).toMatch(/Sulfamethoxazole-trimethoprim/);
      }
      if (/Hypertension/.test(A)) {
        expect(S, where).toMatch(/hypertension/);
        expect(Number(/BP (\d+)\//.exec(O)![1]), where).toBeGreaterThanOrEqual(138);
      }
      if (/diabetes/i.test(A)) {
        expect(S, where).toMatch(/diabetes/);
        expect(P, where).toMatch(/Hemoglobin A1c/);
        expect(O, where).toMatch(/Glucose \(fingerstick\) \d+ mg\/dL/);
      }
      if (/gastroenteritis/i.test(A)) {
        expect(S, where).toMatch(/vomiting/);
        expect(P, where).toMatch(/Ondansetron/);
      }
      if (/sprain/i.test(A)) {
        const side = (s: string) => /\b(right|left)\b/.exec(s)?.[1];
        expect(side(S), where).toBeTruthy();
        expect(side(O), where).toBe(side(S));
      }
      if (/lumbar strain/i.test(A)) expect(P, where).toMatch(/Ibuprofen/);
    }
  });

  it('use real strengths at safe doses, and write them in the notation the written notes use', () => {
    let checked = 0;
    for (const p of notes()) { checked += checkDoses(p.text, p.text); expectSafeNotation(p.text, p.text); }
    expect(checked).toBeGreaterThan(200);
  });

  it('never name a drug the banner says the patient is allergic to', () => {
    for (const today of CHART_DATES) for (const p of notes(today)) noAllergyConflict(p.text, p.patient!.allergies, p.text);
  });

  it('are typeable, spell Tall Man names exactly and have valid scenario text', () => {
    for (const p of notes()) {
      expectTypeable(p.text, p.text);
      expectTallManNames(p.text, p.text);
      expectValidCtx(p.ctx, p.text);
      expect(p.ctx, p.text).toContain('Enter');
      expect(p.text.length, p.text).toBeGreaterThanOrEqual(250);
      expect(p.text.length, p.text).toBeLessThanOrEqual(800);
    }
  });

  it('never run out, and repeat exactly for the same seed', () => {
    expect(new Set(notes().map((p) => p.text)).size).toBeGreaterThan(330);
    for (const s of seeds(10)) expect(makeSoapPassage(mulberry32(s), TODAY)).toEqual(makeSoapPassage(mulberry32(s), TODAY));
  });
});

describe('generated phone messages', () => {
  const msgs = (today = TODAY, n = 400) => seeds(n).map((s) => makePhonePassage(mulberry32(s), today));
  const REFILL = /^(\d{1,2}):(\d\d) ([ap])\.m\. - ([A-Z][a-z]+) ([A-Z][a-z]+) \(DOB (\d\d\/\d\d\/\d{4})\) called requesting a refill of (.+?)\. Last office visit (\d\d\/\d\d\/\d{4})\. Preferred pharmacy: (.+?)\. Routed to Dr\. ([A-Z][a-z]+) for approval\.$/;
  const RESCHEDULE = /^(\d{1,2}):(\d\d) ([ap])\.m\. - ([A-Z][a-z]+) ([A-Z][a-z]+) called to reschedule the (annual physical|follow-up|lab draw) from (\w+), (\d\d)\/(\d\d) at (\d{1,2}):(\d\d) ([ap])\.m\. to (\w+), (\d\d)\/(\d\d) at (\d{1,2}):(\d\d) ([ap])\.m\. (Reminded patient to .+?)\. Callback number (555-01\d\d)\. Message routed to Dr\. ([A-Z][a-z]+)\.$/;
  const REACTION = /^Message for Dr\. ([A-Z][a-z]+): ([A-Z][a-z]+) ([A-Z][a-z]+) reports (.+?) that started (\d) days? after beginning (.+?)\. (.+)$/;
  const kind = (t: string) => (REFILL.test(t) ? 'refill' : RESCHEDULE.test(t) ? 'reschedule' : REACTION.test(t) ? 'reaction' : 'unknown');
  const iso = (m: number, d: number, y: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const utc = (isoDate: string) => { const [y, m, d] = isoDate.split('-').map(Number); return Date.UTC(y, m - 1, d); };

  it('are one of three kinds: a refill request, a reschedule, or a possible reaction, and all three turn up', () => {
    const kinds = msgs().map((p) => kind(p.text));
    expect(kinds).not.toContain('unknown');
    expect(new Set(kinds)).toEqual(new Set(['refill', 'reschedule', 'reaction']));
  });

  it('name the banner patient and the banner provider', () => {
    for (const p of msgs()) {
      const [last, first] = p.patient!.name.split(', ');
      expect(p.text, p.text).toContain(`${first} ${last}`);
      expect(p.text, p.text).toContain(`Dr. ${providerSurname(p.patient!.provider!)}`);
      expect(p.text.match(/Dr\. [A-Z][a-z]+/g)!.every((d) => d === `Dr. ${providerSurname(p.patient!.provider!)}`), p.text).toBe(true);
    }
  });

  it('put a believable call time on every message (8:00 a.m. to 4:59 p.m.)', () => {
    for (const p of msgs()) {
      const m = /^(\d{1,2}):(\d\d) ([ap])\.m\. - /.exec(p.text);
      if (!m) continue;
      expect(Number(m[1]), p.text).toBeGreaterThanOrEqual(1); expect(Number(m[1]), p.text).toBeLessThanOrEqual(12);
      expect(Number(m[2]), p.text).toBeLessThanOrEqual(59);
      const mins = minutes(m[1], m[2], m[3]);
      expect(mins, p.text).toBeGreaterThanOrEqual(8 * 60); expect(mins, p.text).toBeLessThan(17 * 60);
    }
  });

  it('refill requests: the date of birth is the banner’s, the last visit is in the past, the drug and dose are real', () => {
    let seen = 0;
    for (const p of msgs()) {
      const m = REFILL.exec(p.text);
      if (!m) continue;
      seen++;
      expect(m[6], p.text).toBe(p.patient!.dob);
      const [vm, vd, vy] = m[8].split('/').map(Number);
      const visit = utc(iso(vm, vd, vy)), today = utc(TODAY);
      expect(new Date(visit).getUTCMonth() + 1, `${m[8]} is a real date`).toBe(vm);
      expect(visit, p.text).toBeLessThan(today);
      expect(today - visit, p.text).toBeLessThanOrEqual(366 * 86_400_000);
      const d = /^(.+?) (\d+(?:\.\d+)?) (mg|mcg), (\d+) (tablets?|capsules?) (once daily|twice daily|three times daily|at bedtime|every morning|every evening)$/.exec(m[7]);
      expect(d, `drug phrase "${m[7]}"`).toBeTruthy();
      const key = d![1].toLowerCase();
      const form = d![5].replace(/s$/, '') as Form;
      expect(PRODUCTS[key]?.[form], m[7]).toContain(Number(d![2]));
      const perDay = { 'once daily': 1, 'twice daily': 2, 'three times daily': 3, 'at bedtime': 1, 'every morning': 1, 'every evening': 1 }[d![6]]!;
      expect(Number(d![2]) * Number(d![4]) * perDay, m[7]).toBeLessThanOrEqual(MAX_DAILY[key]);
      expectTallManNames(m[7], m[7]);
      noAllergyConflict(m[7], p.patient!.allergies, p.text);
    }
    expect(seen).toBeGreaterThan(80);
  });

  it('reschedules: both days are weekdays coming up, the weekday names fit the dates, and the new day is later', () => {
    let seen = 0;
    for (const p of msgs()) {
      const m = RESCHEDULE.exec(p.text);
      if (!m) continue;
      seen++;
      const today = utc(TODAY);
      const todayYear = Number(TODAY.slice(0, 4));
      const dates = [[m[7], Number(m[8]), Number(m[9])], [m[13], Number(m[14]), Number(m[15])]].map(([wd, mo, da]) => {
        const thisYear = utc(iso(mo as number, da as number, todayYear));
        const t = thisYear > today ? thisYear : utc(iso(mo as number, da as number, todayYear + 1));
        const date = new Date(t);
        expect(date.getUTCMonth() + 1, `${mo}/${da} is a real date`).toBe(mo);
        expect(NAMES[date.getUTCDay()], `${wd}, ${mo}/${da} in ${p.text}`).toBe(wd);
        expect(date.getUTCDay(), p.text).toBeGreaterThanOrEqual(1);
        expect(date.getUTCDay(), p.text).toBeLessThanOrEqual(5);
        expect(t - today, p.text).toBeLessThanOrEqual(75 * 86_400_000);
        return t;
      });
      expect(dates[1], p.text).toBeGreaterThan(dates[0]);
      for (const [h, mi, ap] of [[m[10], m[11], m[12]], [m[16], m[17], m[18]]] as const) {
        const mins = minutes(h, mi, ap);
        expect(mins, p.text).toBeGreaterThanOrEqual(8 * 60); expect(mins, p.text).toBeLessThanOrEqual(16 * 60 + 30);
        expect(mins % 15, p.text).toBe(0);
      }
      expect(m[6] === 'annual physical' || m[6] === 'lab draw' ? /fast 8 to 12 hours/.test(m[19]) : /medication list/.test(m[19]), p.text).toBe(true);
    }
    expect(seen).toBeGreaterThan(80);
  });

  it('reactions: a plausible side effect for the drug named, routed to the provider, with the 911 safety line and no advice', () => {
    const SIDE_EFFECTS: Record<string, RegExp> = {
      amoxicillin: /rash/, lisinopril: /dry cough/, amlodipine: /swelling in both ankles/, metformin: /nausea/, sertraline: /nausea/, atorvastatin: /muscle aches/,
    };
    let seen = 0;
    for (const p of msgs()) {
      const m = REACTION.exec(p.text);
      if (!m) continue;
      seen++;
      const drug = m[6];
      expect(SIDE_EFFECTS[drug], `unknown drug "${drug}" in ${p.text}`).toBeTruthy();
      expect(m[4], p.text).toMatch(SIDE_EFFECTS[drug]);
      expect(m[7], p.text).toMatch(/provider will call back today/);
      expect(m[7], p.text).toMatch(/call 911 if trouble breathing or facial swelling develops/);
      expect(p.text, p.text).not.toMatch(/\b(stop taking|should take|increase|decrease|recommend)\b/i);
      noAllergyConflict(p.text, p.patient!.allergies, p.text);
    }
    expect(seen).toBeGreaterThan(80);
  });

  it('are typeable, free of do-not-use notation and have valid scenario text', () => {
    for (const p of msgs()) {
      expectTypeable(p.text, p.text);
      expectSafeNotation(p.text, p.text);
      expectValidCtx(p.ctx, p.text);
      expect(p.text.length, p.text).toBeGreaterThanOrEqual(150);
      expect(p.text.length, p.text).toBeLessThanOrEqual(600);
    }
  });

  it('never run out, and repeat exactly for the same seed', () => {
    expect(new Set(msgs().map((p) => p.text)).size).toBeGreaterThan(330);
    for (const s of seeds(10)) expect(makePhonePassage(mulberry32(s), TODAY)).toEqual(makePhonePassage(mulberry32(s), TODAY));
  });
});

describe('generated vitals entries', () => {
  const items = (today = TODAY, n = 400) => seeds(n).map((s) => makeVitalsPassage(mulberry32(s), today));
  const FULL = /^BP (\d+)\/(\d+) mmHg, P (\d+) bpm, R (\d+), T (\d+\.\d) F \(oral\), SpO2 (\d+)% on room air\. Ht (\d) ft (\d+) in, Wt (\d+) lb, BMI (\d+\.\d)\.$/;
  const RECHECK = /^Pt is a (\d+) y\/o (male|female)\. BP (\d+)\/(\d+) mmHg ([LR]) arm seated; repeat (\d+)\/(\d+) after 5 min\. Provider notified\.$/;
  const GLUCOSE = /^Glucose \(fingerstick\) (\d+) mg\/dL at (\d{1,2}):(\d\d) a\.m\., fasting\. Pt states last meal was at (\d{1,2}):(\d\d) p\.m\.$/;

  it('are one of three kinds, and all three turn up', () => {
    const kinds = items().map((p) => (FULL.test(p.text) ? 'full' : RECHECK.test(p.text) ? 'recheck' : GLUCOSE.test(p.text) ? 'glucose' : 'unknown'));
    expect(kinds).not.toContain('unknown');
    expect(new Set(kinds)).toEqual(new Set(['full', 'recheck', 'glucose']));
  });

  it('full sets: believable numbers, and a BMI that comes from the height and weight', () => {
    let seen = 0;
    for (const p of items()) {
      const m = FULL.exec(p.text);
      if (!m) continue;
      seen++;
      const [sys, dia, pulse, resp, temp, spo2, ft, inch, lb, bmi] = m.slice(1).map(Number);
      expect(sys).toBeGreaterThanOrEqual(100); expect(sys).toBeLessThanOrEqual(170);
      expect(dia).toBeGreaterThanOrEqual(60); expect(dia).toBeLessThanOrEqual(100);
      expect(pulse).toBeGreaterThanOrEqual(56); expect(pulse).toBeLessThanOrEqual(112);
      expect(resp).toBeGreaterThanOrEqual(12); expect(resp).toBeLessThanOrEqual(22);
      expect(temp).toBeGreaterThanOrEqual(97); expect(temp).toBeLessThanOrEqual(99.2);
      expect(spo2).toBeGreaterThanOrEqual(95); expect(spo2).toBeLessThanOrEqual(100);
      const inches = ft * 12 + inch;
      expect(Math.abs(bmi - (703 * lb) / (inches * inches)), p.text).toBeLessThanOrEqual(0.051);
    }
    expect(seen).toBeGreaterThan(80);
  });

  it('blood pressure rechecks: the first reading is high, the repeat is a little lower, and the age and sex are the banner’s', () => {
    let seen = 0;
    for (const today of CHART_DATES) for (const p of items(today)) {
      const m = RECHECK.exec(p.text);
      if (!m) continue;
      seen++;
      const [age, , sys, dia, , rSys, rDia] = [Number(m[1]), m[2], Number(m[3]), Number(m[4]), m[5], Number(m[6]), Number(m[7])];
      expect(`${age} y`, p.text).toBe(p.patient!.age);
      expect(m[2] === 'female' ? 'F' : 'M', p.text).toBe(p.patient!.sex);
      expect(ageOnDate(p.patient!.dob, today), p.text).toBe(age);
      expect(sys, p.text).toBeGreaterThanOrEqual(138); expect(sys, p.text).toBeLessThanOrEqual(170);
      expect(rSys, p.text).toBeLessThan(sys); expect(rSys, p.text).toBeGreaterThanOrEqual(sys - 12);
      expect(rDia, p.text).toBeLessThanOrEqual(dia); expect(rDia, p.text).toBeGreaterThanOrEqual(dia - 6);
      expect(rSys - rDia, p.text).toBeGreaterThanOrEqual(30);
    }
    expect(seen).toBeGreaterThan(80);
  });

  it('fasting glucose: a normal-to-prediabetic reading, taken in the morning after an evening last meal', () => {
    let seen = 0;
    for (const p of items()) {
      const m = GLUCOSE.exec(p.text);
      if (!m) continue;
      seen++;
      expect(Number(m[1]), p.text).toBeGreaterThanOrEqual(70); expect(Number(m[1]), p.text).toBeLessThanOrEqual(125);
      const test = minutes(m[2], m[3], 'a'), meal = minutes(m[4], m[5], 'p');
      expect(test, p.text).toBeGreaterThanOrEqual(6 * 60 + 30); expect(test, p.text).toBeLessThanOrEqual(9 * 60 + 30);
      expect(meal, p.text).toBeGreaterThanOrEqual(18 * 60); expect(meal, p.text).toBeLessThanOrEqual(21 * 60 + 30);
      expect(test + 24 * 60 - meal, `${p.text}: at least 8 hours fasting`).toBeGreaterThanOrEqual(8 * 60);
    }
    expect(seen).toBeGreaterThan(80);
  });

  it('are typeable, safe, bannered and have valid scenario text', () => {
    for (const p of items()) {
      expect(p.patient, p.text).toBeTruthy();
      expectTypeable(p.text, p.text);
      expectSafeNotation(p.text, p.text);
      expectValidCtx(p.ctx, p.text);
      expect(p.text, p.text).not.toContain('\n');
    }
  });

  it('never run out, and repeat exactly for the same seed', () => {
    expect(new Set(items().map((p) => p.text)).size).toBeGreaterThan(330);
    for (const s of seeds(10)) expect(makeVitalsPassage(mulberry32(s), TODAY)).toEqual(makeVitalsPassage(mulberry32(s), TODAY));
  });
});

/** `minutes` helper is shared by the describe blocks above. */
function minutes(h: string, m: string, ap: string): number {
  return ((Number(h) % 12) + (ap === 'p' ? 12 : 0)) * 60 + Number(m);
}
