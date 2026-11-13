import { describe, expect, it } from 'vitest';
import { DRILLS, GLOSSARY, PROGRAM, SPRINT, getDrill, libraryDrills } from './index';
import { FDA_TALL_MAN as FDA } from '../test/tallman';
import { SPRINT_LINES } from './sprint';
import type { Drill, Track } from './types';

/**
 * Students are already working in the live app. Their progress and grades are keyed by drill id,
 * passage index, program day and activity index, so none of those may move. New content is added
 * as NEW drills (they show on the "All drills" page and are not graded), never as extra passages
 * inside an existing drill and never by reordering the program.
 */
const EXISTING_PASSAGE_COUNTS: Record<string, number> = {
  'ma-terms': 5, 'ma-vitals': 5, 'ma-soap': 3, 'ma-phone': 3, 'ma-edu': 3,
  'rx-sig': 14, 'rx-lasa': 5, 'rx-labels': 4, 'rx-safety': 4, 'rx-workflow': 4,
};

/** The new drills, with the track and the fewest passages each must have. */
const NEW_DRILLS: Record<string, { track: Track; min: number }> = {
  'ma-terms-2': { track: 'ma', min: 6 },
  'ma-complaints': { track: 'ma', min: 8 },
  'ma-abbrev': { track: 'ma', min: 5 },
  'ma-procedures': { track: 'ma', min: 6 },
  'ma-referrals': { track: 'ma', min: 5 },
  'rx-terms': { track: 'rx', min: 6 },
  'rx-sig-2': { track: 'rx', min: 11 },
  'rx-lasa-2': { track: 'rx', min: 5 },
  'rx-daysupply': { track: 'rx', min: 6 },
  'rx-calls': { track: 'rx', min: 5 },
  'ma-hunt': { track: 'ma', min: 8 },
  'rx-hunt': { track: 'rx', min: 8 },
  'ma-test': { track: 'ma', min: 2 },
  'rx-test': { track: 'rx', min: 2 },
};

const newDrills = (): Drill[] => Object.keys(NEW_DRILLS).map((id) => getDrill(id)!);
const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');

describe('existing content is untouched (progress is keyed by drill id, passage and activity position)', () => {
  it('keeps every existing drill at its original passage count', () => {
    for (const [id, n] of Object.entries(EXISTING_PASSAGE_COUNTS)) expect(getDrill(id)?.items.length, id).toBe(n);
  });

  it('keeps the program structure: same activities per day, in the same order', () => {
    const shape = (t: Track) => PROGRAM[t].map((d) => d.acts.map((a) => `${a.type}:${a.id ?? '-'}${a.soon ? ':soon' : ''}:${(a.passages ?? ['all']).join(',')}`));
    expect(shape('ma')).toEqual([
      ['sprint:-:all', 'drill:ma-terms:all', 'test:ma-test:all'],
      ['sprint:-:all', 'drill:ma-vitals:all'],
      ['sprint:-:all', 'drill:ma-complaints:all'],
      ['sprint:-:all', 'drill:ma-soap:all'],
      ['sprint:-:all', 'test:ma-test:all'],
      ['sprint:-:all', 'drill:ma-phone:0,2'],
      ['sprint:-:all', 'drill:ma-phone:1'],
      ['sprint:-:all', 'drill:ma-soap:all'],
      ['sprint:-:all', 'drill:ma-edu:all'],
      ['sprint:-:all', 'test:ma-test:all'],
    ]);
    expect(shape('rx')).toEqual([
      ['sprint:-:all', 'drill:rx-terms:all', 'test:rx-test:all'],
      ['sprint:-:all', 'drill:rx-sig:0,1,2,3,4,5,6'],
      ['sprint:-:all', 'drill:rx-sig:7,8,9,10,11,12,13'],
      ['sprint:-:all', 'drill:rx-lasa:all'],
      ['sprint:-:all', 'test:rx-test:all'],
      ['sprint:-:all', 'drill:rx-labels:all'],
      ['sprint:-:all', 'drill:rx-safety:all'],
      ['sprint:-:all', 'drill:rx-workflow:0,1'],
      ['sprint:-:all', 'drill:rx-workflow:2,3'],
      ['sprint:-:all', 'test:rx-test:all'],
    ]);
  });

  it('fills only former "coming soon" slots with new drills, so no activity position moves', () => {
    const used = Object.values(PROGRAM).flat().flatMap((d) => d.acts.map((a) => a.id)).filter((id): id is string => !!id && id in NEW_DRILLS);
    expect(used.sort()).toEqual(['ma-complaints', 'ma-test', 'ma-test', 'ma-test', 'rx-terms', 'rx-test', 'rx-test', 'rx-test']);
    expect(PROGRAM.ma[2].acts[1]).toMatchObject({ type: 'drill', id: 'ma-complaints' });
    expect(PROGRAM.ma[2].acts[1].soon).toBeFalsy();
    expect(PROGRAM.rx[0].acts[1]).toMatchObject({ type: 'drill', id: 'rx-terms' });
    expect(PROGRAM.rx[0].acts[1].soon).toBeFalsy();
  });

  it('only ever points the program at drills and passages that exist', () => {
    for (const days of Object.values(PROGRAM)) for (const d of days) for (const a of d.acts) {
      if (!a.id) continue;
      const drill = getDrill(a.id);
      expect(drill, `day ${d.n} ${a.id}`).toBeTruthy();
      for (const p of a.passages ?? []) expect(drill!.items[p], `day ${d.n} ${a.id} #${p}`).toBeTruthy();
    }
  });
});

describe('every drill is well formed', () => {
  it('has unique ids that start with the drill track', () => {
    const ids = DRILLS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of DRILLS) expect(d.id.startsWith(`${d.track}-`), d.id).toBe(true);
    expect(DRILLS.filter((d) => d.track === 'ma').length).toBeGreaterThan(0);
  });

  it('has a title, a blurb, a "why it matters" and at least one passage', () => {
    for (const d of DRILLS) {
      expect(d.title.trim().length, d.id).toBeGreaterThan(0);
      expect(d.blurb.trim().length, d.id).toBeGreaterThan(0);
      expect(d.why, d.id).toMatch(/^<b>Why it matters:<\/b> /);
      expect(d.items.length, d.id).toBeGreaterThan(0);
    }
  });

  it('has only text a student can type on a keyboard: ASCII and Enter', () => {
    for (const d of DRILLS) d.items.forEach((p, i) => {
      expect(p.text, `${d.id} #${i}`).toMatch(/^[\x20-\x7E\n]+$/);
      expect(p.text, `${d.id} #${i} leading/trailing space`).toBe(p.text.trim());
      expect(p.text, `${d.id} #${i} double space`).not.toMatch(/ {2}/);
      for (const line of p.text.split('\n')) {
        expect(line.length, `${d.id} #${i} blank line`).toBeGreaterThan(0);
        expect(line, `${d.id} #${i} trailing space`).toBe(line.trimEnd());
      }
    });
  });

  it('has trusted HTML context with balanced tags and escaped ampersands', () => {
    for (const d of DRILLS) {
      for (const html of [d.why, ...d.items.map((p) => p.ctx)]) {
        for (const tag of ['b', 'code']) {
          const open = (html.match(new RegExp(`<${tag}>`, 'g')) ?? []).length;
          const close = (html.match(new RegExp(`</${tag}>`, 'g')) ?? []).length;
          expect(open, `${d.id}: ${html}`).toBe(close);
        }
        expect(html, d.id).not.toMatch(/&(?!amp;|nbsp;|lt;|gt;)/);
      }
      d.items.forEach((p, i) => expect(p.ctx.trim().length, `${d.id} #${i}`).toBeGreaterThan(0));
    }
  });

  it('writes every weekday and date pair correctly for 2026 (the course year)', () => {
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    for (const d of DRILLS) d.items.forEach((p, i) => {
      for (const m of p.text.matchAll(/\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),? (\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/g)) {
        const date = new Date(Number(m[4] ?? 2026), Number(m[2]) - 1, Number(m[3]));
        expect(names[date.getDay()], `${d.id} #${i}: "${m[0]}"`).toBe(m[1]);
      }
    });
  });
});

describe('new drills', () => {
  it('exist on the right track with enough passages', () => {
    for (const [id, want] of Object.entries(NEW_DRILLS)) {
      const d = getDrill(id);
      expect(d, id).toBeTruthy();
      expect(d!.track, id).toBe(want.track);
      expect(d!.items.length, id).toBeGreaterThanOrEqual(want.min);
    }
  });

  it('never model do-not-use abbreviations, trailing zeros or missing leading zeros as output', () => {
    for (const d of newDrills()) d.items.forEach((p, i) => {
      for (const s of [p.text, strip(p.ctx)]) {
        const where = `${d.id} #${i}`;
        expect(s, where).not.toMatch(/\b(QD|Q\.D\.|QOD|Q\.O\.D\.|IU|MSO4|MgSO4|MS|U)\b/);
        expect(s, where).not.toMatch(/\b\d+\.0+ ?(mg|mcg|g|mL|units)\b/i);
        expect(s, where).not.toMatch(/(^|[^\d.])\.\d+ ?(mg|mcg|g|mL)\b/i);
      }
    });
  });

  it('only use strengths that really exist (vetted table, extend it when you add a drug)', () => {
    const STRENGTHS: Record<string, number[]> = {
      atorvastatin: [10, 20, 40, 80], cephalexin: [250, 500], ibuprofen: [200, 400, 600, 800],
      fluticasone: [50], furosemide: [20, 40, 80], prednisone: [1, 2.5, 5, 10, 20, 50],
      cyclobenzaprine: [5, 7.5, 10], ondansetron: [4, 8],
      levothyroxine: [25, 50, 75, 88, 100, 112, 125, 137, 150, 175, 200, 300],
      tobramycin: [0.3], metformin: [500, 850, 1000], amoxicillin: [250, 400, 500, 875],
      doxycycline: [50, 75, 100, 150], lisinopril: [2.5, 5, 10, 20, 30, 40],
      hydralazine: [10, 25, 50, 100], hydroxyzine: [10, 25, 50], amlodipine: [2.5, 5, 10],
      acetaminophen: [325, 500, 650],
    };
    let seen = 0;
    for (const d of newDrills()) d.items.forEach((p, i) => {
      for (const m of `${strip(p.ctx)} ${p.text}`.matchAll(/([A-Za-z]+) (\d+(?:\.\d+)?) ?(mg|mcg|%)(?![A-Za-z])/g)) {
        const drug = m[1].toLowerCase();
        if (!(drug in STRENGTHS)) continue; // Not a drug name (for example "Qty").
        seen++;
        expect(STRENGTHS[drug], `${d.id} #${i}: ${m[0]}`).toContain(Number(m[2]));
      }
    });
    expect(seen).toBeGreaterThan(15); // The check really ran over the new content.
  });
});

describe('sig code translator II', () => {
  /** What each sig token must turn into on the label, as a pattern. */
  const MEANING: Record<string, RegExp> = {
    PO: /by mouth/, SL: /under the tongue/, OU: /both eyes/, OD: /right eye/, OS: /left eye/, AD: /right ear/, AS: /left ear/, AU: /both ears/,
    gtt: /drops?/, gtts: /drops?/, daily: /once daily/, BID: /twice daily/, TID: /three times daily/, QID: /four times daily/,
    q4h: /every 4 hours/, q6h: /every 6 hours/, q8h: /every 8 hours/, q12h: /every 12 hours/, qAM: /every morning/, qPM: /every evening/, qhs: /at bedtime/,
    ac: /before/, pc: /after/, prn: /as needed/, aa: /affected area/, ea: /each/, subcut: /under the skin/,
    tab: /tablet/, tabs: /tablets/, cap: /capsule/, caps: /capsules/, supp: /suppository/, x: /for/,
    SOB: /shortness of breath/, 'N/V': /nausea and vomiting/, CP: /chest pain/, inh: /inhale/,
  };
  const sigOf = (ctx: string) => /<code>(.*?)<\/code>/.exec(ctx)?.[1];

  it('is a hidden-answer drill with the cheat sheet', () => {
    const d = getDrill('rx-sig-2')!;
    expect(d.mode).toBe('hidden');
    expect(d.glossary).toBe(true);
  });

  it('turns every sig code into the right words, for the old and the new translator drills', () => {
    for (const id of ['rx-sig', 'rx-sig-2']) getDrill(id)!.items.forEach((p, i) => {
      const where = `${id} #${i}`;
      const sig = sigOf(p.ctx);
      expect(sig, `${where} has a <code> sig`).toBeTruthy();
      for (const token of sig!.split(/[\s,]+/)) {
        const want = MEANING[token];
        if (want) expect(p.text.toLowerCase(), `${where}: "${token}" in "${sig}" -> "${p.text}"`).toMatch(want);
      }
      const lead = /^(\d+) /.exec(sig!);
      if (lead) expect(p.text, `${where}: dose`).toMatch(new RegExp(`^[A-Z][a-z]+ ${lead[1]} `));
      expect(p.text, where).toMatch(/\.$/);
    });
  });

  it('puts every token it teaches on the cheat sheet, without duplicates', () => {
    const keys = GLOSSARY.map(([k]) => k);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of ['q4h', 'q8h', 'q12h', 'qPM', 'subcut', 'ea']) expect(keys, k).toContain(k);
    for (const [k, v] of GLOSSARY) { expect(k.trim().length).toBeGreaterThan(0); expect(v.trim().length, k).toBeGreaterThan(0); }
  });
});

describe('Tall Man lettering', () => {
  const tallMan = (text: string) => (text.match(/[A-Za-z]{5,}/g) ?? []).filter((w) => w !== w.toLowerCase() && w !== w.toUpperCase() && w !== w[0] + w.slice(1).toLowerCase());

  it('spells every name in Look-Alike Drugs II exactly as the FDA list does', () => {
    const d = getDrill('rx-lasa-2')!;
    let names = 0;
    d.items.forEach((p, i) => {
      for (const w of tallMan(p.text)) { names++; expect(FDA.has(w), `rx-lasa-2 #${i}: ${w}`).toBe(true); }
    });
    expect(names).toBeGreaterThan(15);
  });

  it('keeps each pair together, and the drill free of names without Tall Man letters', () => {
    const d = getDrill('rx-lasa-2')!;
    const typed = d.items.map((p) => p.text).join(' ');
    for (const pair of ['acetaZOLAMIDE / acetoHEXAMIDE', 'chlorproMAZINE / chlorproPAMIDE', 'clomiPHENE / clomiPRAMINE', 'TOLAZamide / TOLBUTamide',
      'sulfADIAZINE / sulfiSOXAZOLE', 'dimenhyDRINATE / diphenhydrAMINE', 'medroxyPROGESTERone / methylPREDNISolone / methylTESTOSTERone',
      'DOBUTamine / DOPamine', 'DAUNOrubicin / DOXOrubicin', 'vinBLAStine / vinCRIStine', 'CISplatin / CARBOplatin', 'cycloSPORINE / cycloSERINE']) {
      expect(typed, pair).toContain(pair);
    }
  });
});

describe('quantity and days supply labels', () => {
  const PER_DAY: [RegExp, number][] = [[/once daily/, 1], [/twice daily/, 2], [/three times daily/, 3], [/four times daily/, 4], [/every 12 hours/, 2], [/every 8 hours/, 3], [/every 6 hours/, 4]];

  it('has a days supply that matches the quantity and the directions on every label', () => {
    const d = getDrill('rx-daysupply')!;
    d.items.forEach((p, i) => {
      const where = `rx-daysupply #${i}`;
      const qty = /Qty: (\d+)/.exec(p.text);
      const supply = /Days supply: (\d+)/.exec(p.text);
      const dose = /Take (\d+(?:\.\d+)?) (?:tablets?|capsules?|mL) by mouth (.+?)(?: for (\d+) days)?\./.exec(p.text);
      expect(qty && supply && dose, `${where} has Qty, Days supply and Take lines`).toBeTruthy();
      const perDay = PER_DAY.find(([re]) => re.test(dose![2]))?.[1];
      expect(perDay, `${where}: frequency "${dose![2]}"`).toBeTruthy();
      const days = Number(qty![1]) / (Number(dose![1]) * perDay!);
      expect(days, `${where}: ${qty![1]} / (${dose![1]} x ${perDay}) days`).toBe(Number(supply![1]));
      if (dose![3]) expect(Number(dose![3]), `${where}: "for N days" matches`).toBe(Number(supply![1]));
    });
  });

  it('puts a banner patient on every label, and the Rx number and name on the first line', () => {
    getDrill('rx-daysupply')!.items.forEach((p, i) => {
      expect(p.patient, `#${i}`).toBeTruthy();
      expect(p.text.split('\n')[0], `#${i}`).toMatch(/^Rx# 4472\d{3} [A-Za-z']+, [A-Za-z']+$/);
    });
  });
});

describe('warm-up sprint lines', () => {
  it('has a bigger pool for each track, with no repeats', () => {
    expect(SPRINT_LINES.ma.length).toBeGreaterThanOrEqual(60);
    expect(SPRINT_LINES.rx.length).toBeGreaterThanOrEqual(63);
    for (const t of ['ma', 'rx'] as const) expect(new Set(SPRINT_LINES[t]).size, t).toBe(SPRINT_LINES[t].length);
  });

  it('only has typeable single-line text that does not model do-not-use abbreviations', () => {
    for (const t of ['ma', 'rx'] as const) for (const line of SPRINT_LINES[t]) {
      expect(line, `${t}: ${line}`).toMatch(/^[\x20-\x7E]+$/);
      expect(line, `${t}: ${line}`).toBe(line.trim());
      expect(line, `${t}: ${line}`).not.toMatch(/ {2}/);
      expect(line, `${t}: ${line}`).not.toMatch(/\b(QD|QOD|IU|MSO4|MgSO4|MS|U)\b/);
      expect(line, `${t}: ${line}`).not.toMatch(/\b\d+\.0+ ?(mg|mcg|g|mL|units)\b/i);
    }
  });

  it('still builds a full, typeable sprint for each track', () => {
    for (const t of ['ma', 'rx'] as const) for (let n = 0; n < 40; n++) {
      const text = SPRINT.build(t);
      expect(text.length).toBeGreaterThan(500);
      expect(text).toMatch(/^[\x20-\x7E]+$/);
    }
  });
});

describe('typing tests (Day 1 baseline, Day 5 mid-point, Day 10 final)', () => {
  const TESTS: [Track, string][] = [['ma', 'ma-test'], ['rx', 'rx-test']];
  const LABELS = [[0, 2, 'Day 1 baseline typing test'], [4, 1, 'Day 5 mid-point typing test'], [9, 1, 'Day 10 final typing test']] as const;

  it('replace all three "coming soon" tests on each track, with the original labels', () => {
    for (const [track, id] of TESTS) for (const [dayIndex, actIndex, label] of LABELS) {
      const act = PROGRAM[track][dayIndex].acts[actIndex];
      expect(act, `${track} day ${dayIndex + 1}`).toMatchObject({ type: 'test', id, label });
      expect(act.soon, `${track} day ${dayIndex + 1}`).toBeFalsy();
    }
  });

  it('give the same passages on all three days, so Day 10 compares like for like with Day 1', () => {
    for (const [track, id] of TESTS) {
      const acts = LABELS.map(([d, a]) => PROGRAM[track][d].acts[a]);
      for (const a of acts) expect(a.passages, `${track}`).toBeUndefined(); // every passage, same on each day
      expect(getDrill(id)!.items.length, id).toBe(2);
    }
  });

  it('are flagged as exams and kept out of the practice library, so nobody rehearses the baseline text', () => {
    for (const [track, id] of TESTS) {
      expect(getDrill(id)!.exam, id).toBe(true);
      const ids = libraryDrills(track).map((d) => d.id);
      expect(ids, `${track} library`).not.toContain(id);
      expect(ids.length, `${track} library`).toBeGreaterThanOrEqual(10);
    }
    expect(DRILLS.filter((d) => d.exam).map((d) => d.id).sort()).toEqual(['ma-test', 'rx-test']);
    for (const d of DRILLS.filter((d) => !d.exam)) expect(libraryDrills(d.track).map((x) => x.id), d.id).toContain(d.id);
  });

  it('are long enough to measure speed (a few minutes) and mix words with numbers', () => {
    for (const [, id] of TESTS) {
      const d = getDrill(id)!;
      expect(d.mode).toBe('copy');
      d.items.forEach((p, i) => {
        expect(p.text.length, `${id} #${i}`).toBeGreaterThanOrEqual(300);
        expect(p.text.length, `${id} #${i}`).toBeLessThanOrEqual(700);
        expect(p.ctx, `${id} #${i}`).toMatch(/Typing test, part \d of 2/);
      });
      expect(d.items.map((p) => p.text).join(' '), id).toMatch(/\d/);
      expect(d.items.some((p) => p.text.includes('\n')), `${id} has a multi-line part`).toBe(true);
    }
  });
});
