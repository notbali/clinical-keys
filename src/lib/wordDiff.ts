/** Word-by-word comparison of two texts. Exact: capital letters and punctuation make words different. No DOM, easy to test. */

export const tokenize = (s: string): string[] => s.split(/\s+/).filter(Boolean);

export type DiffKind = 'ok' | 'wrong' | 'missed' | 'extra';

export interface DiffOp {
  kind: DiffKind;
  /** The word the student has, and where it is in what they typed. */
  typed?: string;
  typedIndex?: number;
  /** The word the target has, and where it is in the target. */
  target?: string;
  targetIndex?: number;
  /** Matching words have none. Words that differ share a number with the others in the same run, counted from 0. */
  gap?: number;
}

/**
 * Lines the typed words up with the target words (longest common run), so one skipped word is one difference,
 * not a difference for every word after it. In a run of different words the first pairs are "wrong",
 * then what is left over is "missed" (target words not typed) or "extra" (typed words not in the target).
 */
export function diffTokens(typed: string[], target: string[]): DiffOp[] {
  const n = target.length;
  const m = typed.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) L[i][j] = target[i - 1] === typed[j - 1] ? L[i - 1][j - 1] + 1 : Math.max(L[i - 1][j], L[i][j - 1]);

  type Step = { match: [number, number] } | { missed: number[]; extra: number[] };
  const steps: Step[] = [];
  let gap = { missed: [] as number[], extra: [] as number[] };
  const closeGap = () => {
    if (gap.missed.length || gap.extra.length) steps.push({ missed: gap.missed.reverse(), extra: gap.extra.reverse() });
    gap = { missed: [], extra: [] };
  };
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && target[i - 1] === typed[j - 1]) { closeGap(); steps.push({ match: [i - 1, j - 1] }); i--; j--; }
    else if (i > 0 && (j === 0 || L[i - 1][j] >= L[i][j - 1])) { gap.missed.push(i - 1); i--; }
    else { gap.extra.push(j - 1); j--; }
  }
  closeGap();
  steps.reverse();

  const ops: DiffOp[] = [];
  let gapNumber = 0;
  for (const s of steps) {
    if ('match' in s) {
      const [ti, ui] = s.match;
      ops.push({ kind: 'ok', typed: typed[ui], target: target[ti], typedIndex: ui, targetIndex: ti });
      continue;
    }
    const pairs = Math.min(s.missed.length, s.extra.length);
    for (let k = 0; k < pairs; k++) ops.push({ kind: 'wrong', typed: typed[s.extra[k]], target: target[s.missed[k]], typedIndex: s.extra[k], targetIndex: s.missed[k], gap: gapNumber });
    for (const ti of s.missed.slice(pairs)) ops.push({ kind: 'missed', target: target[ti], targetIndex: ti, gap: gapNumber });
    for (const ui of s.extra.slice(pairs)) ops.push({ kind: 'extra', typed: typed[ui], typedIndex: ui, gap: gapNumber });
    gapNumber++;
  }
  return ops;
}
