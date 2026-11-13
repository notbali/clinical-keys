import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, ErrorNote, Stat, Tag, mmss } from '../../components/ui';
import { PatientBanner } from '../../components/PatientBanner';
import { useStudent } from '../../components/Layouts';
import { useApi } from '../../data/context';
import type { NewAttempt } from '../../data/api';
import { generatePassage, generatedDrillsForTrack, getGeneratedDrill, GLOSSARY, newSeed } from '../../content';
import type { Passage } from '../../content';
import { todayISO } from '../../lib/dates';
import { windowTitle } from '../../lib/ehrLabels';
import {
  PRIORITY_LABEL, SHIFT_PRESETS, buildShiftQueue, maxTaskPoints, scoreTask, shiftAttempt, shiftNote, summarizeShift,
  type Priority, type ShiftPreset, type ShiftTask, type TaskOutcome,
} from '../../lib/shift';
import { TypingPlayer } from '../../typing/TypingPlayer';
import type { RunResult } from '../../typing/engine';

const TONE: Record<Priority, 'bad' | 'warn' | 'neutral'> = { stat: 'bad', urgent: 'warn', routine: 'neutral' };
const taskName = (drillId: string) => getGeneratedDrill(drillId)?.title.replace(/ \(Generated\)$/, '') ?? drillId;
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

interface Shift { preset: ShiftPreset; queue: ShiftTask[]; passages: Passage[]; endsAt: number }

/** A timed queue of mixed tasks for the student's track. The queue and the scoring live in lib/shift. */
export function Shift() {
  const api = useApi();
  const { me, reload, ehr } = useStudent();
  const [shift, setShift] = useState<Shift | null>(null);
  const [outcomes, setOutcomes] = useState<(TaskOutcome | undefined)[]>([]);
  const [index, setIndex] = useState(0);
  const [round, setRound] = useState(0);
  const [over, setOver] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [unsaved, setUnsaved] = useState<NewAttempt[]>([]);
  const [saving, setSaving] = useState(false);
  const chartDate = useMemo(() => todayISO(), []);

  const start = (preset: ShiftPreset) => {
    const ids = generatedDrillsForTrack(me.track).map((d) => d.id);
    const queue = buildShiftQueue(ids, preset.tasks, newSeed());
    const passages = queue.map((t) => generatePassage(getGeneratedDrill(t.drillId)!, t.seed, chartDate));
    setShift({ preset, queue, passages, endsAt: Date.now() + preset.minutes * 60000 });
    setOutcomes([]); setIndex(0); setRound(0); setOver(false); setUnsaved([]); setNow(Date.now());
  };

  // The shift clock. When it runs out, whatever is half typed is left behind.
  useEffect(() => {
    if (!shift || over) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= shift.endsAt) setOver(true);
    }, 500);
    return () => clearInterval(id);
  }, [shift, over]);

  const save = useCallback(async (list: NewAttempt[]) => {
    setSaving(true);
    const failed: NewAttempt[] = [];
    for (const a of list) { try { await api.saveAttempt(a); } catch { failed.push(a); } }
    setUnsaved(failed);
    setSaving(false);
    if (failed.length < list.length) reload();
  }, [api, reload]);

  // The latest values for the finish handler, so it never records a result against the wrong task.
  const live = useRef({ shift, index, outcomes });
  live.current = { shift, index, outcomes };
  const onFinish = useCallback((r: RunResult) => {
    const { shift: s, index: i, outcomes: o } = live.current;
    if (!s || o[i]) return;
    setOutcomes((prev) => { const next = [...prev]; next[i] = { kind: 'finished', result: r }; return next; });
    void save([shiftAttempt(me.track, s.queue[i], r)]);
  }, [save, me.track]);

  const advance = (from: number, total: number) => { if (from + 1 >= total) setOver(true); else { setIndex(from + 1); setRound(0); } };
  const skip = () => {
    if (!shift) return;
    setOutcomes((prev) => { const next = [...prev]; next[index] = { kind: 'skipped' }; return next; });
    advance(index, shift.queue.length);
  };

  const back = <Link to="/today" className="btn btn-secondary btn-sm">← Today</Link>;

  // ---- Before the shift ----
  if (!shift) {
    return (
      <>
        <div className="row">{back}<h1 style={{ fontSize: 22, fontWeight: 700 }}>Shift simulation</h1></div>
        <Card title="Clock in" subtitle="A queue of mixed tasks, the way a real shift comes in. Accuracy is worth more than speed.">
          <div className="stack">
            <div className="row" role="group" aria-label="Length of the shift">
              {SHIFT_PRESETS.map((p) => (
                <Button key={p.minutes} variant={p.minutes === 20 ? 'primary' : 'secondary'} onClick={() => start(p)}>{p.label} · {p.tasks} tasks</Button>
              ))}
            </div>
            <ul className="hint" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
              <li><b>STAT</b> tasks come first and are worth the most, then <b>Urgent</b>, then <b>Routine</b>.</li>
              <li>A clean task (no errors left, 95% accuracy or better) earns a bonus. Fixing your mistakes as you go still earns points.</li>
              <li>Each uncorrected error costs 15 points, more than speed can ever earn. Skipping a task costs points too.</li>
              <li>The clock keeps running while you work. Tasks you do not reach are not counted against you.</li>
            </ul>
          </div>
        </Card>
      </>
    );
  }

  const { queue, passages } = shift;
  const secondsLeft = Math.max(0, Math.ceil((shift.endsAt - now) / 1000));
  const report = summarizeShift(queue, outcomes);

  // ---- The report ----
  if (over) {
    const rows = report.perTask;
    return (
      <>
        <div className="row">{back}<h1 style={{ fontSize: 22, fontWeight: 700 }}>Shift report</h1><span className="muted" style={{ fontSize: 14 }}>{shift.preset.label}</span></div>
        <Card className={`result ${report.withErrors > 0 ? 'warn' : ''}`}>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>{report.points} points</h2>
          <p className="muted">{shiftNote(report)}</p>
          <div className="grid-tiles" style={{ marginTop: 12 }}>
            <Stat label="Points" value={report.points} note={`of ${report.maxPoints} possible`} />
            <Stat label="Tasks done" value={`${report.done} of ${report.total}`} note={`${report.clean} clean${report.skipped ? ` · ${report.skipped} skipped` : ''}${report.notReached ? ` · ${report.notReached} not reached` : ''}`} />
            <Stat label="Accuracy" value={report.accuracy != null ? `${report.accuracy}%` : '—'} />
            <Stat label="WPM" value={report.wpm != null ? Math.round(report.wpm) : '—'} />
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="kv"><span>Best task</span><b>{report.best != null ? `#${report.best + 1} ${taskName(queue[report.best].drillId)} (${signed(rows[report.best].points)})` : '—'}</b></div>
            <div className="kv"><span>Slowest task</span><b>{report.slowest != null ? `#${report.slowest + 1} ${taskName(queue[report.slowest].drillId)} (${rows[report.slowest].result!.wpm} WPM)` : '—'}</b></div>
          </div>
        </Card>

        <Card title="Task by task">
          <div className="act-list">
            {queue.map((t, i) => {
              const row = rows[i];
              const r = row.result;
              return (
                <div className="act" key={t.n}>
                  <div className="act-dot" aria-hidden="true">{t.n}</div>
                  <div className="act-main">
                    <b>{taskName(t.drillId)} <Tag tone={TONE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Tag></b>
                    <span>{row.skipped ? 'Skipped' : !row.reached ? 'Not reached' : `${r!.wpm} WPM · ${r!.accuracy}% accuracy${r!.errorsLeft ? ` · ${r!.errorsLeft} error${r!.errorsLeft > 1 ? 's' : ''} left` : r!.clean ? ' · clean' : ''}`}</span>
                  </div>
                  <div className="act-stat num">{row.reached ? `${signed(row.points)} pts` : ''}</div>
                </div>
              );
            })}
          </div>
        </Card>

        {unsaved.length > 0 && (
          <ErrorNote>
            {unsaved.length} finished task{unsaved.length > 1 ? 's' : ''} couldn’t be saved. Check your connection, then try again.{' '}
            <Button onClick={() => void save(unsaved)} busy={saving}>Save again</Button>
          </ErrorNote>
        )}
        <div className="row">
          <Button variant="primary" onClick={() => setShift(null)}>Start another shift</Button>
          <Link to="/today" className="btn btn-secondary">Back to Today</Link>
          {saving && <span className="hint" role="status">Saving…</span>}
        </div>
      </>
    );
  }

  // ---- During the shift ----
  const task = queue[index];
  const passage = passages[index];
  const drill = getGeneratedDrill(task.drillId)!;
  const outcome = outcomes[index];
  const finished = outcome?.kind === 'finished' ? outcome : undefined;
  const score = finished ? scoreTask(task.priority, finished) : null;
  const earned = summarizeShift(queue, outcomes).perTask.reduce((n, t) => n + t.points, 0);
  const last = index + 1 >= queue.length;
  const title = taskName(task.drillId);
  const rx = me.track === 'rx';

  const scenario = (
    <div className="scenario">
      <div dangerouslySetInnerHTML={{ __html: passage.ctx }} />
      <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>
        {drill.mode === 'hidden' ? 'Type the label directions in full. Peeking costs points.' : 'Type it exactly as shown. Capitals, numbers, spacing and punctuation all count.'}
      </p>
    </div>
  );

  return (
    <>
      <div className="row row-between">
        <div className="row">{back}<h1 style={{ fontSize: 22, fontWeight: 700 }}>Shift simulation</h1></div>
        <div className="row" style={{ gap: 20 }}>
          <span className="num" style={{ fontSize: 14 }}><span className="muted">Task</span> <b>{index + 1} of {queue.length}</b></span>
          <span className="num" style={{ fontSize: 14 }}><span className="muted">Points</span> <b>{Math.max(0, earned)}</b></span>
          <span className="num" style={{ fontSize: 22, fontWeight: 800, color: secondsLeft <= 60 ? 'var(--bad)' : 'var(--ink)' }} role="timer" aria-label={`${mmss(secondsLeft)} left in the shift`}>{mmss(secondsLeft)}</span>
        </div>
      </div>

      <div className="cols">
        <div className="col-main stack">
          <div className="row">
            <Tag tone={TONE[task.priority]}>{PRIORITY_LABEL[task.priority]}</Tag>
            <b style={{ fontSize: 18 }}>{title}</b>
            <span className="muted" style={{ fontSize: 14 }}>worth up to {maxTaskPoints(task.priority)} points</span>
          </div>
          {ehr && <PatientBanner patient={passage.patient} task={`${rx ? 'Pharmacy' : 'Clinic'} queue: ${title}`} />}
          {ehr ? (
            <div className="note-window">
              <div className="note-title"><b>{windowTitle('drill', task.drillId)}</b><Tag tone={finished ? 'good' : 'neutral'}>{finished ? 'Entered' : 'In your queue'}</Tag></div>
              <div className="note-body">{scenario}
                <TypingPlayer key={`${index}-${round}`} target={passage.text} mode={drill.mode === 'hidden' ? 'hidden' : 'copy'} onFinish={onFinish} onRestart={() => setRound((n) => n + 1)} />
              </div>
            </div>
          ) : (<>{scenario}
            <TypingPlayer key={`${index}-${round}`} target={passage.text} mode={drill.mode === 'hidden' ? 'hidden' : 'copy'} onFinish={onFinish} onRestart={() => setRound((n) => n + 1)} />
          </>)}

          {finished && score && (
            <Card className={`result ${finished.result.errorsLeft > 0 ? 'warn' : ''}`}>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>{signed(score.total)} points</h2>
              <p className="muted">
                {finished.result.errorsLeft > 0
                  ? `${finished.result.errorsLeft} error${finished.result.errorsLeft > 1 ? 's' : ''} left in the text. That costs ${-score.errors} points: on the job, errors are fixed before anything goes out.`
                  : finished.result.revealed ? 'The answer was showing, so this task earns nothing.'
                  : finished.result.clean ? `Clean: no errors left and ${finished.result.accuracy}% accuracy. Bonus earned.` : `No errors left, but ${finished.result.accuracy}% accuracy. Push for 95% or better to earn the clean bonus.`}
              </p>
              <div className="row">
                <Button variant="primary" onClick={() => advance(index, queue.length)}>{last ? 'See shift report →' : 'Next task →'}</Button>
              </div>
            </Card>
          )}
          {!finished && (
            <div className="row">
              <Button onClick={skip}>Skip task ({scoreTask(task.priority, { kind: 'skipped' }).total} points)</Button>
              <Button variant="ghost" onClick={() => setOver(true)}>End shift now</Button>
            </div>
          )}
          {drill.glossary && (
            <Card title="Sig code cheat sheet"><div className="glossary">{GLOSSARY.map(([k, v]) => <div key={k}><b>{k}</b>{v}</div>)}</div></Card>
          )}
        </div>

        <aside className="col-side stack">
          <Card title="Your queue" subtitle="STAT first, then urgent, then routine">
            <div className="act-list">
              {queue.map((t, i) => {
                const o = outcomes[i];
                const status = o ? (o.kind === 'skipped' ? 'Skipped' : 'Done') : i === index ? 'Now' : 'Waiting';
                const pts = o ? signed(scoreTask(t.priority, o).total) : `up to ${maxTaskPoints(t.priority)}`;
                return (
                  <div className={`act ${i === index ? 'now' : ''} ${o?.kind === 'finished' ? 'done' : ''}`} key={t.n}>
                    <div className="act-dot" aria-hidden="true">{o?.kind === 'finished' ? '✓' : t.n}</div>
                    <div className="act-main"><b>{taskName(t.drillId)}</b><span>{status} · {pts} pts</span></div>
                    <Tag tone={TONE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Tag>
                  </div>
                );
              })}
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}
