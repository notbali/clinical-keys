/** Keyboard shortcuts on the results card of the typing screen. Pure, so it can be tested without a DOM. */

/** Ignore shortcut keys this soon after finishing, so a habitual Enter at the end of a passage does not skip the result. */
export const RESULT_GRACE_MS = 700;

export interface KeyInfo {
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  repeat: boolean;
  /** What had focus: a button, a link, a text field, or anything else (the page or a heading). */
  target: 'button' | 'link' | 'field' | 'other';
}

export type ResultAction = 'next' | 'again';

export function resultShortcut(e: KeyInfo, ctx: { hasResult: boolean; msSinceFinish: number }): ResultAction | null {
  if (!ctx.hasResult || ctx.msSinceFinish < RESULT_GRACE_MS) return null;
  if (e.repeat || e.ctrl || e.meta || e.alt || e.shift) return null;
  if (e.target !== 'other') return null;
  if (e.key === 'Enter') return 'next';
  if (e.key === 'Escape') return 'again';
  return null;
}

/** Classifies a focused element for `KeyInfo.target`. */
export function targetKind(el: { tagName?: string; isContentEditable?: boolean } | null | undefined): KeyInfo['target'] {
  const tag = (el?.tagName ?? '').toUpperCase();
  if (tag === 'BUTTON' || tag === 'SUMMARY') return 'button';
  if (tag === 'A') return 'link';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return 'field';
  return 'other';
}
