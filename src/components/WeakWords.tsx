import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStudent } from './Layouts';
import { browserStorage, loadRecord, missedLine, recordRun, saveRecord, weakList } from '../lib/weakWords';
import type { RunResult } from '../typing/engine';

/** The weak-word sprint lives at this address. */
export const WEAK_SPRINT_PATH = '/weak-words';

/**
 * Shown inside the result card after a typing run: which words were missed, saves them to this student's rolling
 * weak-word record, and offers the 60-second weak-word sprint. Renders nothing for runs that track no words (error hunts).
 */
export function WeakWords({ result, sprint = false }: { result: RunResult; /** True on the weak-word sprint itself, which has its own "another" button. */ sprint?: boolean }) {
  const { me } = useStudent();
  const [weak, setWeak] = useState(() => weakList(loadRecord(browserStorage(), me.id), 5));
  const saved = useRef<RunResult | null>(null);

  useEffect(() => {
    if (!result.missedWords || saved.current === result) return; // saved once per run, even when effects run twice in development
    saved.current = result;
    const storage = browserStorage();
    const next = recordRun(loadRecord(storage, me.id), { at: new Date().toISOString(), missedWords: result.missedWords, cleanWords: result.cleanWords ?? [] });
    saveRecord(storage, me.id, next);
    setWeak(weakList(next, 5));
  }, [result, me.id]);

  if (!result.missedWords) return null;
  const line = missedLine(result.missedWords);
  return (
    <div className="stack" style={{ gap: 6, marginBottom: 12 }} data-testid="weak-words">
      {line ? <p style={{ fontWeight: 600 }}>{line}</p> : <p className="muted">No missed words in this run.</p>}
      {weak.length > 0 && (
        <p className="hint">
          Your weak words right now: {weak.map((w) => `${w.word} (${w.count})`).join(', ')}.
          {!sprint && <> <Link to={WEAK_SPRINT_PATH}>Practice them for 60 seconds</Link></>}
        </p>
      )}
    </div>
  );
}

/** A card for the practice library: shows the student's weak words and starts the sprint, or says there are none. */
export function WeakWordsCard() {
  const { me } = useStudent();
  const weak = weakList(loadRecord(browserStorage(), me.id), 5);
  const body = (
    <>
      <div className="row row-between"><span className="tag tag-info">Sprint</span><span className="muted" style={{ fontSize: 13 }}>60 seconds</span></div>
      <h2 className="card-title" style={{ marginTop: 8 }}>Weak-word sprint</h2>
      <p className="muted" style={{ fontSize: 14.5, margin: '4px 0 10px' }}>Your most-missed words, drilled until they stop tripping you up.</p>
      <div className="hint">{weak.length ? weak.map((w) => w.word).join(', ') : 'No weak words yet. Finish a few typing runs first.'}</div>
    </>
  );
  return weak.length
    ? <Link to={WEAK_SPRINT_PATH} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>{body}</Link>
    : <div className="card">{body}</div>;
}
