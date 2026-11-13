import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, mmss } from '../components/ui';
import type { HuntError } from '../content/types';
import { HUNT_LABEL, huntRunResult, nextHint, plantedErrors, scoreHunt, type HuntScore } from '../lib/errorHunt';
import type { DiffOp } from '../lib/wordDiff';
import type { RunResult } from './engine';

interface Props {
  /** The note with mistakes in it. This is what the student edits. */
  flawed: string;
  /** The correct note. Never shown until the student checks. */
  fixed: string;
  errors: HuntError[];
  onFinish: (result: RunResult) => void;
  onRestart: () => void;
}

export function ErrorHuntPlayer({ flawed, fixed, errors, onFinish, onRestart }: Props) {
  const startedAt = useRef(performance.now());
  const [typed, setTyped] = useState(flawed);
  const [hints, setHints] = useState(0);
  const [hint, setHint] = useState('');
  const [outcome, setOutcome] = useState<{ score: HuntScore; revealed: boolean; seconds: number } | null>(null);
  const [, tick] = useState(0);

  const running = !outcome;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [running]);

  const finish = useCallback((revealed: boolean) => {
    if (outcome) return;
    const seconds = (performance.now() - startedAt.current) / 1000;
    const score = scoreHunt(flawed, fixed, typed);
    setOutcome({ score, revealed, seconds });
    onFinish(huntRunResult(score, { seconds, hints, revealed, typedChars: typed.length }));
  }, [outcome, flawed, fixed, typed, hints, onFinish]);

  const giveHint = () => {
    const h = nextHint(flawed, fixed, typed);
    if (!h) { setHint('Every planted error looks fixed. Read it once more for anything you changed by mistake, then press Check.'); return; }
    setHints((n) => n + 1);
    setHint(`Hint: look for ${HUNT_LABEL[errors[h.index].category]} ${h.before ? `just after “${h.before}”` : 'right at the start'}.`);
  };

  const changed = typed !== flawed;
  const seconds = outcome ? outcome.seconds : (performance.now() - startedAt.current) / 1000;

  return (
    <div className="stack">
      <div className="grid-tiles" aria-live="off">
        {outcome ? (
          <>
            <Tile label="Fixed" value={`${outcome.revealed ? 0 : outcome.score.fixed} of ${outcome.score.planted}`} />
            <Tile label="New mistakes" value={outcome.revealed ? '—' : outcome.score.introduced} />
            <Tile label="Time" value={mmss(outcome.seconds)} />
            <Tile label="Hints used" value={hints} />
          </>
        ) : (
          <>
            <Tile label="Errors to find" value={errors.length} />
            <Tile label="Hints used" value={hints} />
            <Tile label="Time" value={mmss(seconds)} />
          </>
        )}
      </div>

      <textarea
        className="hunt-input"
        aria-label="Edit this note to fix the errors"
        value={typed}
        readOnly={!!outcome}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); finish(false); } }}
        onDrop={(e) => e.preventDefault()}
        autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} name="hunt"
      />

      {!outcome ? (
        <>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={() => finish(false)} disabled={!changed}>Check my note</Button>
            <Button onClick={giveHint}>Hint</Button>
            <Button onClick={() => { setTyped(flawed); setHint(''); }} disabled={!changed}>Undo all my changes</Button>
            <Button variant="ghost" onClick={() => finish(true)}>I give up: show me</Button>
            <span className="hint" style={{ marginLeft: 'auto' }}>Ctrl+Enter checks · Capitals and punctuation count</span>
          </div>
          {hint && <div className="note note-warn" role="status">{hint}</div>}
        </>
      ) : (
        <Review flawed={flawed} fixed={fixed} errors={errors} score={outcome.score} revealed={outcome.revealed} onRestart={onRestart} />
      )}
    </div>
  );
}

/** The most new mistakes listed in the review, so a note that was wiped out or pasted over stays readable. */
const MAX_SHOWN = 8;

const describeOp = (op: DiffOp): string =>
  op.kind === 'wrong' ? `You changed “${op.target}” to “${op.typed}”.` : op.kind === 'extra' ? `You added “${op.typed}”.` : `You removed “${op.target}”.`;

function Review({ flawed, fixed, errors, score, revealed }: { flawed: string; fixed: string; errors: HuntError[]; score: HuntScore; revealed: boolean; onRestart: () => void }) {
  const planted = plantedErrors(flawed, fixed);
  return (
    <div className="stack">
      <div className="dx-box">
        <h3>The {planted.length} errors</h3>
        <ul className="hunt-list">
          {planted.map((p, i) => {
            const ok = !revealed && score.found[i];
            return (
              <li key={i} className={ok ? 'ok' : 'miss'}>
                <b>{ok ? '✓ Fixed' : revealed ? 'Answer' : '✗ Still wrong'}</b>
                <span className="hunt-change"> Line {p.line}: {p.flawed ? <s>{p.flawed}</s> : <em>(missing)</em>} → <b>{p.fixed || '(take it out)'}</b></span>
                <span className="hint"> {errors[i].why}</span>
              </li>
            );
          })}
        </ul>
      </div>
      {!revealed && score.introduced > 0 && (
        <div className="dx-box">
          <h3>New mistakes you introduced</h3>
          <ul className="hunt-list">
            {score.introducedOps.slice(0, MAX_SHOWN).map((op, i) => <li key={i} className="miss">{describeOp(op)}</li>)}
            {score.introducedOps.length > MAX_SHOWN && <li className="miss">…and {score.introducedOps.length - MAX_SHOWN} more changes. Use “Undo all my changes” to start the note again.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

const Tile = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="stat"><div className="stat-label">{label}</div><div className="stat-value">{value}</div></div>
);
