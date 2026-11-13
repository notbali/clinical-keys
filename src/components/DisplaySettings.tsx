import { useEffect, useRef, useState } from 'react';
import { applyPrefs, loadPrefs, savePrefs, updatePref, type Prefs } from '../lib/prefs';
import { browserStore } from '../lib/resume';

const GROUPS: { key: keyof Prefs; legend: string; options: [string, string][] }[] = [
  { key: 'textSize', legend: 'Text size', options: [['normal', 'Normal'], ['large', 'Large'], ['xlarge', 'Extra large']] },
  { key: 'font', legend: 'Font', options: [['default', 'Standard'], ['dyslexia', 'Easy to read (Atkinson Hyperlegible)']] },
  { key: 'contrast', legend: 'Contrast', options: [['normal', 'Standard'], ['high', 'High contrast']] },
  { key: 'motion', legend: 'Motion', options: [['system', 'Follow my device'], ['reduce', 'Reduce motion']] },
];

/** Reads saved preferences and puts them on the page. Call once at startup so every screen, including sign-in, follows them. */
export function initDisplayPrefs() { applyPrefs(loadPrefs()); }

/** A small "Display" menu for text size, font, contrast and motion. Choices are saved in this browser only. */
export function DisplaySettings({ className = 'btn btn-secondary btn-sm' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const change = <K extends keyof Prefs>(key: K, value: string) => {
    const next = updatePref(prefs, key, value as Prefs[K]);
    setPrefs(next);
    applyPrefs(next);
    savePrefs(browserStore(), next);
  };

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLInputElement>('input:checked')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    const onDown = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open]);

  return (
    <div className="display-menu">
      <button ref={btn} type="button" className={className} aria-expanded={open} aria-controls="display-panel" onClick={() => setOpen((o) => !o)}>Display</button>
      {open && (
        <div id="display-panel" ref={panel} className="display-panel" role="group" aria-label="Display options">
          {GROUPS.map((g) => (
            <fieldset key={g.key}>
              <legend>{g.legend}</legend>
              {g.options.map(([value, label]) => (
                <label key={value}>
                  <input type="radio" name={`pref-${g.key}`} value={value} checked={prefs[g.key] === value} onChange={() => change(g.key, value)} /> {label}
                </label>
              ))}
            </fieldset>
          ))}
          <p className="hint">Saved on this device only. Esc closes this menu.</p>
        </div>
      )}
    </div>
  );
}
