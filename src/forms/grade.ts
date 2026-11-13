import type { FormField } from './types';

/** Pure grading for the chart entry forms. No DOM, so every rule is covered by tests. */

export interface FieldResult {
  id: string;
  correct: boolean;
  blank: boolean;
  /** Why an entry is wrong, in words a student can act on. Null when it is right. It never prints the answer. */
  message: string | null;
  /** Characters of the answer that were typed right: its length minus the edits needed, never below zero. */
  charsCorrect: number;
  charsTotal: number;
}

export interface FormGrade {
  results: FieldResult[];
  correctCount: number;
  total: number;
  allCorrect: boolean;
  charsCorrect: number;
  charsTotal: number;
}

/** The only forgiveness: spaces before and after the entry. */
export const normalizeEntry = (s: string): string => s.trim();

/** Fewest single-character edits (insert, delete, change) that turn `a` into `b`. */
export function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

const sortedChars = (s: string): string => [...s].sort().join('');
const stripSpaces = (s: string): string => s.replace(/\s+/g, '');
const letterWords = (s: string): string[] => s.toLowerCase().split(/[^a-z'-]+/).filter(Boolean).sort();
const hasTallMan = (s: string): boolean => /[a-z][A-Z]/.test(s);

/** The number part ("128/84", "98.6", "5") and whatever follows it. */
function parseMeasure(s: string): { num: string; unit: string } | null {
  const m = /^(\d*\.?\d+(?:\/\d+(?:\.\d+)?)?)\s*(.*)$/.exec(s);
  return m ? { num: m[1], unit: m[2] } : null;
}

const SHORTHAND = /\b(tabs?|caps?|po|bid|tid|qid|qhs|qam|qpm|prn|q\d+h|ac|pc|hs|gtt|sig)\b/i;

/** Do-not-use items found in what the student typed, with what to write instead. */
function doNotUse(typed: string): string | null {
  if (/\bq\.?d\.?(?![a-z])/i.test(typed)) return 'QD is on the do-not-use list (it is mistaken for QID). Write "once daily".';
  if (/\bq\.?o\.?d\.?(?![a-z])/i.test(typed)) return 'QOD is on the do-not-use list. Write "every other day".';
  if (/\d\s*I\.?U\b/.test(typed)) return 'IU is on the do-not-use list (it looks like IV or 10). Write "international units".';
  if (/\d\s*U\b/.test(typed)) return 'U is on the do-not-use list (it looks like 0 or 4). Write "unit" or "units".';
  return null;
}

function diagnose(field: FormField, typed: string): string {
  const { answer, kind } = field;
  if (typed === '') return 'Left blank.';
  if (stripSpaces(typed) === stripSpaces(answer)) return 'Spacing is off: check the spaces between words and before units.';

  // Same letters, different capitals.
  if (typed.toLowerCase() === answer.toLowerCase()) {
    if (kind === 'drug' && hasTallMan(answer)) return 'Capital letters are wrong. Drug names must match the paper exactly, including the Tall Man capitals.';
    return 'Capitalization does not match the paper.';
  }

  if (kind !== 'name' && kind !== 'date') {
    const dnu = doNotUse(typed);
    if (dnu && !doNotUse(answer)) return dnu;
  }
  if (kind === 'dose') {
    if (/\d\.0+(?!\d)/.test(typed) && !/\d\.0+(?!\d)/.test(answer)) return 'A trailing zero (5.0 mg) is a do-not-use error: it can be read as 50. Leave it off.';
    if (/(^|[^\d])\.\d/.test(typed) && !/(^|[^\d])\.\d/.test(answer)) return 'A missing leading zero (.5 mg) is a do-not-use error: it can be read as 5. Write the zero before the decimal point.';
  }

  if (kind === 'name') {
    const a = letterWords(answer), t = letterWords(typed);
    if (a.length === t.length && a.every((w, i) => w === t[i])) return 'The name should be Last, First, with a comma after the last name.';
  }

  if (kind === 'date') {
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(typed)) return 'Dates are MM/DD/YYYY: two-digit month, two-digit day, four-digit year, with slashes.';
    const [m, d, y] = typed.split('/'), [am, ad, ay] = answer.split('/');
    if (m === ad && d === am && y === ay) return 'Month and day look swapped (MM/DD/YYYY).';
  }

  if (kind === 'measure' || kind === 'dose') {
    const t = parseMeasure(typed), a = parseMeasure(answer);
    if (t && a) {
      if (t.num === a.num && t.unit !== a.unit) return t.unit === '' ? 'The unit is missing.' : 'Right number, wrong unit. Check the unit on the paper.';
      if (t.num !== a.num) {
        if (t.unit === a.unit || t.unit === '') {
          if (t.num.replace('.', '') === a.num.replace('.', '')) return 'Check the decimal point.';
          if (sortedChars(t.num) === sortedChars(a.num)) return 'Two digits are swapped. Check the order of the digits.';
          if (t.unit === '' && a.unit !== '') return 'The number does not match the paper, and the unit is missing.';
          return 'The number does not match the paper.';
        }
      }
    }
  }

  if (kind === 'number') {
    if (/[a-z]/i.test(typed)) return 'Number only: leave off words and units.';
    if (sortedChars(typed) === sortedChars(answer)) return 'Two digits are swapped. Check the order of the digits.';
    return 'The number does not match.';
  }

  if (sortedChars(typed) === sortedChars(answer)) return `Some ${/\d/.test(answer) ? 'digits' : 'characters'} are swapped. Check the order of the digits and letters.`;

  if (kind === 'directions') {
    if (`${typed}.` === answer) return 'End the directions with a period.';
    if (SHORTHAND.test(typed) && !SHORTHAND.test(answer)) return 'Spell it out the way the label reads (Take 1 tablet by mouth ...). Do not leave sig shorthand or abbreviations in the directions.';
  }

  if (answer.startsWith(typed)) return 'Looks unfinished: the entry ends early.';
  if (typed.startsWith(answer)) return 'Extra text at the end of the entry.';
  let i = 0;
  while (i < typed.length && i < answer.length && typed[i] === answer[i]) i++;
  return `Does not match the paper. The first difference is at character ${i + 1}.`;
}

/** Grades one box. Right means exactly the answer after trimming. A wrong entry carries a reason. */
export function gradeField(field: FormField, raw: string | undefined): FieldResult {
  const typed = normalizeEntry(raw ?? '');
  const correct = typed === field.answer;
  return {
    id: field.id,
    correct,
    blank: typed === '',
    message: correct ? null : diagnose(field, typed),
    charsCorrect: Math.max(0, field.answer.length - editDistance(typed, field.answer)),
    charsTotal: field.answer.length,
  };
}

export function gradeForm(fields: readonly FormField[], values: Record<string, string>): FormGrade {
  const results = fields.map((f) => gradeField(f, values[f.id]));
  const correctCount = results.filter((r) => r.correct).length;
  return {
    results,
    correctCount,
    total: fields.length,
    allCorrect: correctCount === fields.length,
    charsCorrect: results.reduce((n, r) => n + r.charsCorrect, 0),
    charsTotal: results.reduce((n, r) => n + r.charsTotal, 0),
  };
}

/** Share of characters right, with one decimal. */
export const formAccuracy = (g: FormGrade): number => (g.charsTotal ? Math.round((1000 * g.charsCorrect) / g.charsTotal) / 10 : 100);

/** Words per minute, five characters to a word. Too short a run to measure reports 0, like the typing engine. */
export function formWpm(correctChars: number, seconds: number): number {
  const mins = seconds / 60;
  return mins > 0.03 ? Math.round(correctChars / 5 / mins) : 0;
}

export interface FormRunResult {
  wpm: number;
  /** Characters right on the FIRST Check, so fixing a field afterwards does not erase the slip. */
  accuracy: number;
  /** Fields still wrong at the end. */
  errorsLeft: number;
  seconds: number;
  fieldsCorrect: number;
  fieldsTotal: number;
  /** Every field right at the end. */
  completed: boolean;
  /** Completed with 95% accuracy or better: the only runs that count as personal bests. */
  clean: boolean;
}

/** Scores a run from what was on the form at the first Check and at the end. */
export function summarizeFormRun(fields: readonly FormField[], first: Record<string, string>, final: Record<string, string>, seconds: number): FormRunResult {
  const g1 = gradeForm(fields, first);
  const g2 = gradeForm(fields, final);
  const accuracy = formAccuracy(g1);
  const goodChars = g2.results.reduce((n, r) => n + (r.correct ? r.charsTotal : 0), 0);
  return {
    wpm: formWpm(goodChars, seconds),
    accuracy,
    errorsLeft: g2.total - g2.correctCount,
    seconds: Math.round(seconds),
    fieldsCorrect: g2.correctCount,
    fieldsTotal: g2.total,
    completed: g2.allCorrect,
    clean: g2.allCorrect && accuracy >= 95,
  };
}

/** Enter in a text box would submit a form. This form never submits, so Enter is blocked; Tab is how you move on. */
export const entryKeyAction = (key: string): 'block' | 'allow' => (key === 'Enter' ? 'block' : 'allow');
