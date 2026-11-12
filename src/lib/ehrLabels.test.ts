import { describe, expect, it } from 'vitest';
import { bannerName, windowTitle } from './ehrLabels';
import { DRILLS } from '../content';

describe('chart labels', () => {
  it('shows the surname in capitals like a chart banner', () => {
    expect(bannerName('Whitaker, Hannah')).toBe('WHITAKER, Hannah');
    expect(bannerName('Cher')).toBe('CHER');
  });
  it('names a chart window for every drill and for the sprint, with a safe fallback', () => {
    for (const d of DRILLS) expect(windowTitle('drill', d.id), d.id).not.toBe('Note');
    expect(windowTitle('sprint')).toBe('Typing Sprint');
    expect(windowTitle('drill', 'not-a-drill')).toBe('Note');
  });
});
