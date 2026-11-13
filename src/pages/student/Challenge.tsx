import { useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, ErrorNote, Tag, TrackTag, mmss } from '../../components/ui';
import { PatientBanner } from '../../components/PatientBanner';
import { useStudent } from '../../components/Layouts';
import { useApi } from '../../data/context';
import { usePoll } from '../../data/usePoll';
import { getGeneratedDrill } from '../../content';
import { POLL_MS, passageFor, rankResults, resolveChallengePassage, summarize, type RankedResult } from '../../lib/challenge';
import { TypingPlayer } from '../../typing/TypingPlayer';
import type { RunResult } from '../../typing/engine';
import '../../styles/challenge.css';

function Board({ ranked, meId }: { ranked: RankedResult[]; meId: string }) {
  if (!ranked.length) return <p className="empty">No one has finished yet.</p>;
  return (
    <table className="chal-board">
      <thead><tr><th>#</th><th>Name</th><th>Track</th><th className="num-col">WPM</th><th className="num-col">Accuracy</th><th>Result</th></tr></thead>
      <tbody>
        {ranked.map((r) => (
          <tr key={r.studentId} className={`${r.studentId === meId ? 'me' : ''} ${r.clean ? '' : 'dim'}`}>
            <td className="num">{r.rank}</td>
            <td translate="no">{r.displayName}{r.studentId === meId && ' (you)'}</td>
            <td><TrackTag track={r.track} /></td>
            <td className="num num-col">{r.wpm}</td>
            <td className="num num-col">{r.accuracy}%</td>
            <td>{r.clean ? <Tag tone="good">Clean</Tag> : <Tag tone="warn">{r.errorsLeft > 0 ? `${r.errorsLeft} error${r.errorsLeft > 1 ? 's' : ''} left` : r.revealed ? 'Answer shown' : 'Under 95%'}</Tag>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The student side of the class challenge: join the open round, type the shared passage once, watch the board. */
export function Challenge() {
  const api = useApi();
  const { me, ehr } = useStudent();
  const active = usePoll(() => api.getActiveChallenge(), POLL_MS, [api]);
  // Once a student has joined, keep following that round even after it stops being the open one.
  const [watchId, setWatchId] = useState<string | null>(null);
  const roundId = watchId ?? active.data?.id ?? null;
  const view = usePoll(async () => {
    const [challenge, results] = await Promise.all([api.getChallenge(roundId!), api.listChallengeResults(roundId!)]);
    return { challenge, ranked: rankResults(results) };
  }, POLL_MS, [api, roundId], !!roundId);

  const [started, setStarted] = useState(false);
  const [run, setRun] = useState<RunResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [key, setKey] = useState(0);
  const sent = useRef(false);

  const challenge = view.data?.challenge ?? null;
  const ranked = view.data?.ranked ?? [];
  const mine = ranked.find((r) => r.studentId === me.id);
  const passage = challenge ? passageFor(challenge, me.track) : undefined;
  const text = useMemo(() => (passage ? resolveChallengePassage(passage) : undefined), [passage]);
  const mode = passage ? getGeneratedDrill(passage.drillId)?.mode : undefined;

  const submit = useCallback(async (r: RunResult) => {
    if (!roundId) return;
    setSaving(true); setSaveError(null);
    try {
      await api.submitChallengeResult(roundId, { wpm: r.wpm, accuracy: r.accuracy, errorsLeft: r.errorsLeft, seconds: r.seconds, revealed: r.revealed || r.peeks > 0 });
      view.refresh();
    } catch (e) {
      sent.current = false;
      setSaveError(e instanceof Error ? e.message : 'We couldn’t submit your result.');
    }
    setSaving(false);
  }, [api, roundId, view]);

  const onFinish = useCallback((r: RunResult) => {
    setRun(r);
    if (sent.current) return;
    sent.current = true;
    void submit(r);
  }, [submit]);

  const join = () => { setWatchId(roundId); setStarted(true); };
  const sum = summarize(ranked);
  const isOpen = challenge?.status === 'open';

  let body: React.ReactNode;
  if (!roundId) {
    body = <Card><p className="empty">No challenge is open right now. This page checks every couple of seconds, so stay here and it will appear when your instructor starts one.</p></Card>;
  } else if (!challenge) {
    body = <Card><p className="empty">Loading the challenge…</p></Card>;
  } else if (!passage || !text) {
    body = <Card><p className="empty">This round has no passage for your track. Wait for the next one.</p></Card>;
  } else if (mine || run) {
    body = (
      <>
        {run && (
          <Card className={`result ${run.errorsLeft > 0 ? 'warn' : ''}`}>
            <h2 style={{ fontSize: 22, fontWeight: 700 }}>{mine ? (mine.clean ? `Clean run: #${mine.rank} so far` : 'Submitted, not clean') : saveError ? 'Not submitted yet' : 'Submitting…'}</h2>
            <p className="muted">{run.errorsLeft > 0 || run.accuracy < 95 || run.revealed || run.peeks > 0
              ? 'Accuracy comes first in the challenge: a run with errors left, under 95% accuracy or with the answer shown ranks below every clean run.'
              : 'No errors left and 95% accuracy or better, so you rank on speed.'}</p>
            <div className="result-stats num">
              <div><span>WPM</span><b>{run.wpm}</b></div><div><span>Accuracy</span><b>{run.accuracy}%</b></div>
              <div><span>Time</span><b>{mmss(run.seconds)}</b></div><div><span>Errors left</span><b>{run.errorsLeft}</b></div>
            </div>
            {saveError && <div style={{ marginBottom: 12 }}><ErrorNote>{saveError}</ErrorNote></div>}
            <div className="row">
              {saveError && <Button variant="primary" onClick={() => { sent.current = true; void submit(run); }} busy={saving}>Try submitting again</Button>}
              <Link to="/today" className="btn btn-secondary">Back to Today</Link>
            </div>
          </Card>
        )}
        <Card title="Leaderboard" subtitle={`${isOpen ? 'Round open' : 'Final results'} · ${sum.finished} finished · ${sum.clean} clean`}>
          <Board ranked={ranked} meId={me.id} />
        </Card>
      </>
    );
  } else if (!isOpen) {
    body = <><Card><p className="empty">This round has ended. {ranked.length ? 'Here are the final results.' : 'Wait for the next one.'}</p></Card>{ranked.length > 0 && <Card title="Final results"><Board ranked={ranked} meId={me.id} /></Card>}</>;
  } else if (!started) {
    body = (
      <Card title="A round is open" subtitle="Everyone in your class types the same passage, once. Accuracy first: fix your errors, because any run with errors left ranks below every clean run.">
        <div className="row"><Button variant="primary" onClick={join}>Start typing</Button><span className="hint">The clock starts on your first keystroke. There is one try.</span></div>
      </Card>
    );
  } else {
    body = (
      <div className="stack">
        {!isOpen && <ErrorNote>The instructor has ended the round. You can’t submit now.</ErrorNote>}
        <div className="scenario"><div dangerouslySetInnerHTML={{ __html: text.ctx }} /></div>
        {ehr && <PatientBanner patient={text.patient} task="Class challenge" />}
        <TypingPlayer key={`${roundId}-${key}`} target={text.text} mode={mode === 'hidden' ? 'hidden' : 'copy'} onFinish={onFinish}
          onRestart={() => { if (!run) setKey((n) => n + 1); }} hint="One try counts. Esc restarts only before you finish." />
      </div>
    );
  }

  return (
    <>
      <div className="row row-between">
        <div className="row"><Link to="/today" className="btn btn-secondary btn-sm">← Today</Link><h1 style={{ fontSize: 22, fontWeight: 700 }}>Class challenge</h1></div>
        {challenge && <Tag tone={isOpen ? 'good' : 'neutral'}>{isOpen ? 'Round open' : 'Round ended'}</Tag>}
      </div>
      {(active.error || view.error) && <ErrorNote>Can’t reach the server right now. Trying again…</ErrorNote>}
      {body}
    </>
  );
}
