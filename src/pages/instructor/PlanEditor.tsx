import { useState } from 'react';
import { Button } from '../../components/ui';
import { programFor } from '../../lib/program';
import { defaultPlan, isDefaultPlan, moveDay, restoreDay, skipDay, skippedDays, type ClassPlan } from '../../lib/plan';

const titleOf = (track: 'ma' | 'rx', day: number) => programFor(track).find((d) => d.n === day)?.title ?? '';
const label = (day: number) => {
  const ma = titleOf('ma', day);
  const rx = titleOf('rx', day);
  return ma === rx ? ma : `MA: ${ma} · PT: ${rx}`;
};
const sameDays = (a: ClassPlan, b: ClassPlan) => a.days.length === b.days.length && a.days.every((d, i) => d === b.days[i]);

/**
 * Up/down buttons and a skip toggle for a class's day plan (no drag-only controls). Edits a local draft; nothing is
 * saved until "Save plan".
 */
export function PlanEditor({ className, saved, busy, onSave, onClose }: {
  className: string;
  saved: ClassPlan;
  busy: boolean;
  onSave: (plan: ClassPlan) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ClassPlan>(saved);
  const [said, setSaid] = useState('');
  const skipped = skippedDays(draft);
  const changed = !sameDays(draft, saved);
  const edit = (next: ClassPlan, announce: string) => { setDraft(next); setSaid(announce); };

  return (
    <section className="stack" style={{ gap: 12, borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 12 }} aria-label={`Adjust days for ${className}`}>
      <div>
        <h3 style={{ fontSize: 16, fontWeight: 700 }}>Adjust days for {className}</h3>
        <p className="muted" style={{ fontSize: 13.5, margin: '4px 0 0' }}>
          Each student’s school days (Day 1 is their first school day) follow this order. A skipped day is not assigned or graded and the class moves on to the next one.
          Runs already saved are kept, and Day numbers on saved runs do not change. The change applies to the whole class, including days already past, so make it before the days it affects.
        </p>
      </div>

      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }} aria-label="Teaching order">
        {draft.days.map((n, i) => (
          <li key={n} className="row row-between" style={{ gap: 8, padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 8 }}>
            <span style={{ fontSize: 14 }}>
              <span className="mono muted" style={{ fontSize: 12 }}>School day {i + 1}</span>{' '}
              <b>Day {n}</b> <span className="muted">{label(n)}</span>
            </span>
            <span className="row" style={{ gap: 4 }}>
              <Button className="btn-sm" aria-label={`Move Day ${n} earlier`} disabled={i === 0} onClick={() => edit(moveDay(draft, n, -1), `Day ${n} moved to school day ${i}.`)}>Up</Button>
              <Button className="btn-sm" aria-label={`Move Day ${n} later`} disabled={i === draft.days.length - 1} onClick={() => edit(moveDay(draft, n, 1), `Day ${n} moved to school day ${i + 2}.`)}>Down</Button>
              <Button className="btn-sm" aria-label={`Skip Day ${n}`} disabled={draft.days.length <= 1} onClick={() => edit(skipDay(draft, n), `Day ${n} skipped.`)}>Skip</Button>
            </span>
          </li>
        ))}
      </ol>

      {skipped.length > 0 && (
        <div>
          <h4 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 6px' }}>Skipped (not assigned, not graded)</h4>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
            {skipped.map((n) => (
              <li key={n} className="row row-between" style={{ gap: 8, padding: '6px 10px', border: '1px dashed var(--line)', borderRadius: 8 }}>
                <span style={{ fontSize: 14 }}><b>Day {n}</b> <span className="muted">{label(n)}</span></span>
                <Button className="btn-sm" aria-label={`Restore Day ${n}`} onClick={() => edit(restoreDay(draft, n), `Day ${n} restored.`)}>Restore</Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div role="status" className="visually-hidden">{said}</div>
      <div className="row row-between">
        <Button className="btn-sm" disabled={isDefaultPlan(draft)} onClick={() => edit(defaultPlan(), 'Reset to Day 1 through Day 10 in order. Save to apply.')}>Reset to default</Button>
        <span className="row">
          <Button className="btn-sm" onClick={onClose}>{changed ? 'Cancel' : 'Close'}</Button>
          <Button className="btn-sm" variant="dark" disabled={!changed} busy={busy} onClick={() => onSave(draft)}>Save plan</Button>
        </span>
      </div>
    </section>
  );
}
