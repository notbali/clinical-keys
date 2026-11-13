import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, ErrorNote, mmss } from '../../components/ui';
import { useStudent } from '../../components/Layouts';
import { WeakWords } from '../../components/WeakWords';
import { useApi } from '../../data/context';
import { newSeed, SPRINT } from '../../content';
import { mulberry32 } from '../../content/generate/rng';
import { TypingPlayer } from '../../typing/TypingPlayer';
import { browserStorage, buildWeakSprint, loadRecord, weakList } from '../../lib/weakWords';
import type { NewAttempt } from '../../data/api';
import type { RunResult } from '../../typing/engine';

/** A 60-second sprint made only from the words this student misses most. Saved as a sprint run with the drill id "weak-words". */
export function WeakSprint() {
  const api = useApi();
  const { me, reload } = useStudent();
  const [round, setRound] = useState(0);
  const [seed, setSeed] = useState(() => newSeed());
  const [result, setResult] = useState<RunResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, setPending] = useState<NewAttempt | null>(null);
  const [saving, setSaving] = useState(false);

  // Read when a sprint starts, so words fixed in the last sprint drop out of the next one.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const words = useMemo(() => weakList(loadRecord(browserStorage(), me.id)), [me.id, round]);
  const text = useMemo(() => buildWeakSprint(words, mulberry32(seed)), [words, seed]);

  const save = useCallback(async (a: NewAttempt) => {
    setSaving(true); setSaveError(null);
    try { await api.saveAttempt(a); setPending(null); reload(); }
    catch { setPending(a); setSaveError('We couldn’t save this run. Check your connection, then try saving again.'); }
    setSaving(false);
  }, [api, reload]);

  const onFinish = useCallback((r: RunResult) => {
    setResult(r);
    void save({ kind: 'sprint', track: me.track, drillId: 'weak-words', passage: 0, wpm: r.wpm, accuracy: r.accuracy, errorsLeft: r.errorsLeft, seconds: r.seconds, completed: r.completed, clean: r.clean, revealed: r.revealed });
  }, [save, me.track]);

  const restart = () => { setResult(null); setSaveError(null); setPending(null); setSeed(newSeed()); setRound((n) => n + 1); };

  return (
    <>
      <div className="row row-between">
        <div className="row"><Link to="/drills" className="btn btn-secondary btn-sm">← Practice library</Link><h1 style={{ fontSize: 22, fontWeight: 700 }}>Weak-word sprint</h1></div>
        <span className="muted" style={{ fontSize: 14 }}>{SPRINT.limit}-second sprint</span>
      </div>

      {!text ? (
        <Card title="No weak words yet">
          <p className="muted">Words you miss while typing show up here. Finish a few drills or sprints, then come back for a sprint made from your trickiest words.</p>
          <div className="row" style={{ marginTop: 12 }}><Link to="/practice?kind=sprint" className="btn btn-primary">Start a warm-up sprint</Link><Link to="/today" className="btn btn-secondary">Back to Today</Link></div>
        </Card>
      ) : (
        <>
          <div className="scenario">
            <p><b>Your trickiest words:</b> {words.map((w) => w.word).join(', ')}.</p>
            <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>Type as much as you can in {SPRINT.limit} seconds. The clock starts on your first keystroke.</p>
          </div>
          <TypingPlayer key={`weak-${round}`} target={text} mode="copy" limit={SPRINT.limit} onFinish={onFinish} onRestart={restart} />
        </>
      )}

      {result && (
        <Card className={`result ${result.errorsLeft > 0 ? 'warn' : ''}`}>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>{result.errorsLeft > 0 ? 'Time! Errors left behind' : result.clean ? 'Clean sprint' : 'Fixed, but bumpy'}</h2>
          <p className="muted">{result.errorsLeft > 0 ? `${result.errorsLeft} wrong character${result.errorsLeft > 1 ? 's' : ''} still in what you typed.` : 'Every word you typed right counts toward clearing it from your weak list.'}{result.clean ? ' This run counts toward your personal best.' : ''}</p>
          <div className="result-stats num">
            <div><span>WPM</span><b>{result.wpm}</b></div><div><span>Accuracy</span><b>{result.accuracy}%</b></div>
            <div><span>Time</span><b>{mmss(result.seconds)}</b></div><div><span>Errors left</span><b>{result.errorsLeft}</b></div>
          </div>
          <WeakWords result={result} sprint />
          {saveError && <div style={{ marginBottom: 12 }}><ErrorNote>{saveError}</ErrorNote></div>}
          <div className="row">
            <Button variant="primary" onClick={restart}>Another sprint →</Button>
            {pending && <Button onClick={() => void save(pending)} busy={saving}>Save this run</Button>}
            <Link to="/today" className="btn btn-secondary">Back to Today</Link>
            {saving && <span className="hint" role="status">Saving…</span>}
            {!saving && !saveError && <span className="hint" role="status">Saved</span>}
          </div>
        </Card>
      )}
    </>
  );
}
