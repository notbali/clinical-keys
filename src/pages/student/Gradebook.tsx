import { Link } from 'react-router-dom';
import { Card, ProgressBar, Stat, Tag, fmtDate, mmss } from '../../components/ui';
import { LineChart } from '../../components/Charts';
import { useStudent } from '../../components/Layouts';
import { computeTypingGrade } from '../../lib/grades';
import { assignedThrough, doneCount } from '../../lib/program';
import { byProgramDay, totalSeconds } from '../../lib/stats';
import { todayISO } from '../../lib/dates';

export function Gradebook() {
  const { me, attempts, settings, override, day } = useStudent();
  const current = Math.min(Math.max(day, 1), 10);
  const target = settings.targets[me.track];
  const w = settings.weights;
  const g = computeTypingGrade({ attempts, track: me.track, day: current, settings, override });
  const points = byProgramDay(attempts);
  const wsum = w.accuracy + w.speed + w.completion || 1;
  const part = (weight: number, score: number) => ((weight / wsum) * score).toFixed(1);
  const today = todayISO();
  const todaySec = totalSeconds(attempts.filter((a) => todayISO(new Date(a.createdAt)) === today));

  const todo = assignedThrough(me.track, current).filter((a) => doneCount(attempts, a.day, a.act, a.passages) < a.passages.length);
  const work: { title: string; why: string; to: string; cta: string }[] = [];
  if (g.accuracyAvg != null && g.accuracyAvg < target.accuracy) work.push({ title: 'Accuracy first', why: `Your last finished runs average ${g.accuracyAvg}%, under the ${target.accuracy}% target. Slow down a little: fewer corrections makes you faster.`, to: '/today', cta: 'Go to today’s activities' });
  if (g.bestWpm != null && g.bestWpm < target.wpm) work.push({ title: 'Build speed', why: `You’re ${target.wpm - g.bestWpm} WPM below the ${target.wpm} WPM target. Extra warm-up sprints are the fastest way to close it.`, to: '/practice?kind=sprint', cta: 'Start a warm-up sprint' });
  if (todo.length) work.push({ title: 'Finish what’s assigned', why: `${todo.length} activit${todo.length === 1 ? 'y is' : 'ies are'} unfinished through Day ${current}. Next up: ${todo[0].label} (Day ${todo[0].day}).`, to: '/today', cta: 'Open Today' });
  if (!work.length) work.push({ title: 'You’re on track', why: 'Keep your accuracy up and keep the streak going.', to: '/today', cta: 'Open Today' });

  const recent = [...attempts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);

  return (
    <>
      <div><h1 className="page-title">My gradebook</h1><p className="page-sub">{me.track === 'ma' ? 'Medical Assistant' : 'Pharmacy Tech'} · {day > 10 ? 'Program complete' : `Day ${current} of 10`} · Updates after every run you finish.</p></div>

      <div className="grid-tiles">
        <div className="card" style={{ background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)', flexBasis: 260 }}>
          <div style={{ fontSize: 12, letterSpacing: '0.06em', fontWeight: 600, opacity: 0.85 }}>TYPING GRADE</div>
          <div className="num" style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.05 }}>{g.total == null ? '—' : `${g.total}%`}</div>
          <div style={{ fontSize: 13.5, opacity: 0.9, marginTop: 6 }}>{g.total == null ? 'Finish a run to get your first grade.' : g.override ? 'Set by your instructor' : 'Calculated from your runs'}</div>
        </div>
        <Stat label={`Accuracy · ${w.accuracy}% of typing grade`} value={g.accuracyAvg == null ? '—' : `${g.accuracyAvg}%`} note={`Target ${target.accuracy}%`} tone={g.accuracyScore >= 100 ? 'good' : undefined} />
        <Stat label={`Speed · ${w.speed}% of typing grade`} value={g.bestWpm == null ? '—' : `${g.bestWpm} WPM`} note={`Target ${target.wpm} WPM`} />
        <Stat label={`Activities · ${w.completion}% of typing grade`} value={`${g.completion.done} of ${g.completion.total}`} note={`Assigned through Day ${current}`} />
      </div>

      {g.override && <div className="note note-info"><b>Your instructor set this grade.</b> {g.override.reason} <span className="muted">(Calculated grade: {g.computed ?? '—'}%)</span></div>}

      <Card title="Your progress, day by day" subtitle="Best speed and average accuracy for each program day. The dashed lines mark the Day 1, Day 5 and Day 10 tests.">
        <div className="cols" style={{ gap: 24 }}>
          <div style={{ flex: '1 1 400px', minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Speed (WPM) <span className="muted" style={{ fontWeight: 400 }}>· target {target.wpm}</span></div>
            <LineChart variant="solid" label="Words per minute by program day" points={points.filter((p) => p.wpm != null).map((p) => ({ x: p.day, y: p.wpm! }))} xMax={10} yMin={0} yMax={Math.max(45, target.wpm + 10)} yTicks={[0, 10, 20, 30, 40].filter((t) => t <= Math.max(45, target.wpm + 10))} target={target.wpm} marks={[{ x: 1, name: 'Baseline' }, { x: 5, name: 'Midpoint' }, { x: 10, name: 'Final' }]} />
          </div>
          <div style={{ flex: '1 1 400px', minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Accuracy <span className="muted" style={{ fontWeight: 400 }}>· target {target.accuracy}%</span></div>
            <LineChart variant="dashed" unit="%" label="Accuracy by program day" points={points.filter((p) => p.accuracy != null).map((p) => ({ x: p.day, y: p.accuracy! }))} xMax={10} yMin={80} yMax={100} yTicks={[80, 85, 90, 95, 100]} target={target.accuracy} marks={[{ x: 1, name: 'Baseline' }, { x: 5, name: 'Midpoint' }, { x: 10, name: 'Final' }]} />
          </div>
        </div>
      </Card>

      <div className="cols">
        <div className="col-main stack">
          <Card title="How your typing grade is calculated" subtitle="Updated after every run. No surprises.">
            <div>
              {[
                { n: 'Accuracy', d: `Average of your last 3 finished runs: ${g.accuracyAvg ?? '—'}%. Target ${target.accuracy}%.`, m: `${g.accuracyScore} × ${w.accuracy}%`, p: part(w.accuracy, g.accuracyScore) },
                { n: 'Speed', d: `Best WPM: ${g.bestWpm ?? '—'}. Target ${target.wpm}.`, m: `${g.speedScore} × ${w.speed}%`, p: part(w.speed, g.speedScore) },
                { n: 'Activities completed', d: `${g.completion.done} of the ${g.completion.total} activities assigned through Day ${current}.`, m: `${g.completionScore} × ${w.completion}%`, p: part(w.completion, g.completionScore) },
              ].map((r) => (
                <div className="row row-between" key={r.n} style={{ padding: '11px 0', borderTop: '1px solid var(--line-soft)', alignItems: 'baseline' }}>
                  <div style={{ flex: '1 1 220px' }}><div style={{ fontWeight: 700 }}>{r.n}</div><div className="muted" style={{ fontSize: 13.5 }}>{r.d}</div></div>
                  <div className="num muted" style={{ fontSize: 14 }}>{r.m}</div><div className="num" style={{ fontWeight: 600, fontSize: 16, width: 60, textAlign: 'right' }}>{r.p}</div>
                </div>
              ))}
              <div className="row row-between" style={{ paddingTop: 12, borderTop: '2px solid var(--ink)', fontWeight: 700 }}><span>Typing grade</span><span className="num" style={{ fontSize: 18 }}>{g.computed == null ? '—' : `${g.computed}%`}</span></div>
            </div>
          </Card>
          <Card title="Your other grades are in Blackboard" subtitle="Computer applications work and your overall course grade live in Blackboard.">
            {settings.blackboardUrl ? <a className="btn btn-secondary" href={settings.blackboardUrl} target="_blank" rel="noreferrer">Open Blackboard →</a> : <p className="muted" style={{ fontSize: 14 }}>Ask your instructor for the Blackboard link for your course.</p>}
          </Card>
          <Card title="Recent runs">
            {recent.length === 0 ? <p className="empty">No runs yet. Start from the Today page.</p> : (
              <div className="table"><div className="table-in">
                <div className="tr head cols-runs"><div>When</div><div>Activity</div><div>WPM</div><div>Accuracy</div><div>Errors left</div><div>Result</div></div>
                {recent.map((a) => (
                  <div className="tr cols-runs" key={a.id}>
                    <div className="muted" style={{ fontSize: 12.5 }}>{fmtDate(a.createdAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                    <div>{a.kind === 'sprint' ? 'Warm-up sprint' : `${a.drillId} · passage ${a.passage + 1}`}</div>
                    <div><b>{a.wpm}</b></div><div><b>{a.accuracy}%</b></div><div>{a.errorsLeft}</div>
                    <div>{a.clean ? <Tag tone="good">Clean</Tag> : a.completed ? <Tag tone="warn">Fixed</Tag> : <Tag tone="bad">Errors left</Tag>}</div>
                  </div>
                ))}
              </div></div>
            )}
          </Card>
        </div>
        <aside className="col-side stack">
          <div className="card" style={{ background: 'var(--warn-soft)', borderColor: 'var(--warn-line)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--warn-ink)' }}>WHAT TO WORK ON</div>
            <h2 className="card-title" style={{ color: 'var(--warn-ink)', marginBottom: 10 }}>Your next wins</h2>
            <div className="stack" style={{ gap: 12 }}>
              {work.map((x) => (
                <div key={x.title} style={{ background: 'var(--surface)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontWeight: 700 }}>{x.title}</div>
                  <p className="muted" style={{ fontSize: 14, margin: '2px 0 8px' }}>{x.why}</p>
                  <Link to={x.to} style={{ fontWeight: 600, fontSize: 14 }}>{x.cta} →</Link>
                </div>
              ))}
            </div>
          </div>
          <Card title="Time on task">
            <div className="kv"><span>Typing time today</span><b className="num">{mmss(todaySec)}</b></div>
            <div className="kv"><span>Typing time in total</span><b className="num">{mmss(totalSeconds(attempts))}</b></div>
            <ProgressBar value={Math.min(100, (todaySec / (175 * 60)) * 100)} label="Share of today's 2 hour 55 minute typing block" />
          </Card>
        </aside>
      </div>
    </>
  );
}
