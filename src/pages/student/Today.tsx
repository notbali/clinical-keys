import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, ProgressBar, Tag } from '../../components/ui';
import { useStudent } from '../../components/Layouts';
import { programFor, resolveActivity, doneCount, assignedThrough } from '../../lib/program';
import { streak } from '../../lib/stats';
import { computeTypingGrade } from '../../lib/grades';
import { getDrill } from '../../content';

const BLOCK: { time: string; name: string; mins: string; built: boolean }[] = [
  { time: '12:35', name: 'Warm-up sprint', mins: '10 min', built: true },
  { time: '12:45', name: 'Today’s skill drill', mins: '35 min', built: true },
  { time: '1:20', name: 'Dictation', mins: '25 min', built: false },
  { time: '1:45', name: 'Stretch break', mins: '10 min', built: false },
  { time: '1:55', name: 'Shift simulation', mins: '30 min', built: false },
  { time: '2:25', name: 'Error hunt', mins: '25 min', built: false },
  { time: '2:50', name: 'Chart entry forms', mins: '25 min', built: false },
  { time: '3:15', name: 'Class challenge', mins: '15 min', built: false },
];

export function Today() {
  const { me, attempts, settings, today, day, override } = useStudent();
  const program = programFor(me.track);
  const current = Math.min(Math.max(day, 1), 10);
  const [viewDay, setViewDay] = useState<number>(current);
  const shown = program.find((d) => d.n === viewDay)!;
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const target = settings.targets[me.track];
  const grade = computeTypingGrade({ attempts, track: me.track, day: current, settings, override });
  const sk = streak(attempts, today, new Set(settings.closedDays));

  const dayDone = (n: number) => {
    const d = program.find((x) => x.n === n)!;
    const real = d.acts.map((a, i) => ({ r: resolveActivity(a), i })).filter((x) => x.r.kind !== 'soon');
    return real.length > 0 && real.every(({ r, i }) => doneCount(attempts, n, i, r.kind === 'soon' ? [] : r.passages) >= (r.kind === 'soon' ? 0 : r.passages.length));
  };
  const bests = [
    ...new Map(attempts.filter((a) => a.clean).sort((a, b) => b.wpm - a.wpm).map((a) => [a.kind === 'sprint' ? 'Warm-up sprint' : a.drillId ?? '', a])).entries(),
  ].slice(0, 4);
  const behind = assignedThrough(me.track, current).length - grade.completion.done;

  return (
    <>
      <div className="row row-between" style={{ alignItems: 'flex-end' }}>
        <div>
          <div className="muted num" style={{ fontSize: 13 }}>{new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}</div>
          <h1 className="page-title">{hello}, <span translate="no">{me.firstName}</span>.</h1>
          <p className="page-sub">{day === 0 ? <>Your program starts soon.</> : day > 10 ? <>You’ve finished the 10-day program. Keep practicing anytime.</> : <>You’re on <b style={{ color: 'var(--ink)' }}>Day {day} of 10</b>.</>}</p>
        </div>
        <div className="card row" style={{ padding: '10px 16px' }}><span className="num" style={{ fontSize: 26, fontWeight: 700, color: 'var(--accent)' }}>{sk}</span><div style={{ fontSize: 14, lineHeight: 1.3 }}><b>day streak</b><br /><span className="muted">{sk ? 'Keep it going' : 'Finish a run to start one'}</span></div></div>
      </div>

      <div className="days" role="group" aria-label="Your 10-day program">
        {program.map((d) => {
          const state = d.n === current ? 'now' : dayDone(d.n) ? 'done' : '';
          return (
            <button key={d.n} className={`day ${state}`} style={{ font: 'inherit', textAlign: 'left', cursor: 'pointer', outline: d.n === viewDay ? '2px solid var(--ink)' : undefined, outlineOffset: 1 }}
              onClick={() => setViewDay(d.n)} aria-pressed={d.n === viewDay}>
              <b>Day {d.n}</b><span>{d.title}</span>
            </button>
          );
        })}
      </div>

      <div className="cols">
        <div className="col-main stack">
          {settings.blackboardUrl && (
            <Card title="Morning work" subtitle="9:00 to 11:55 · Computer applications">
              <a className="btn btn-secondary" href={settings.blackboardUrl} target="_blank" rel="noreferrer">Open Blackboard →</a>
            </Card>
          )}
          <Card title={`Day ${shown.n}: ${shown.title}`} subtitle={shown.blurb}>
            <div className="act-list">
              {shown.acts.map((a, i) => {
                const r = resolveActivity(a);
                if (r.kind === 'soon') {
                  return (
                    <div className="act" key={i}><div className="act-dot" aria-hidden="true">·</div><div className="act-main"><b>{r.label}</b><span>Coming soon</span></div><Tag>Coming soon</Tag></div>
                  );
                }
                const done = doneCount(attempts, shown.n, i, r.passages);
                const finished = done >= r.passages.length;
                const first = r.passages.find((p) => !attempts.some((x) => x.completed && x.day === shown.n && x.act === i && x.passage === p)) ?? r.passages[0];
                const link = r.kind === 'sprint'
                  ? `/practice?kind=sprint&day=${shown.n}&act=${i}`
                  : `/practice?kind=drill&drill=${r.drill.id}&passage=${first}&day=${shown.n}&act=${i}`;
                return (
                  <div className={`act ${finished ? 'done' : shown.n === current && done === 0 && i === 0 ? '' : ''}`} key={i}>
                    <div className="act-dot" aria-hidden="true">{finished ? '✓' : '▶'}</div>
                    <div className="act-main"><b>{r.label}</b><span>{r.kind === 'sprint' ? '60 seconds, timed' : `${r.passages.length} ${r.passages.length === 1 ? 'passage' : 'passages'}`}</span></div>
                    <div className="act-stat num">{finished ? 'Done' : done ? `${done}/${r.passages.length}` : ''}</div>
                    <Link to={link} className={`btn btn-sm ${finished ? 'btn-secondary' : 'btn-primary'}`}>{finished ? 'Practice again' : done ? 'Continue' : 'Start'}</Link>
                  </div>
                );
              })}
            </div>
          </Card>
          {behind >= 2 && day > 1 && <div className="note note-warn">You have {behind} unfinished activities from earlier days. Tap an earlier day above to catch up.</div>}
          <Card title="The typing block" subtitle="12:35 to 3:30 · a new activity every 10 to 35 minutes">
            <div className="stack" style={{ gap: 6 }}>
              {BLOCK.map((b) => (
                <div key={b.time} className="row" style={{ fontSize: 14, gap: 10, flexWrap: 'nowrap' }}>
                  <span className="num muted" style={{ width: 52 }}>{b.time}</span>
                  <span style={{ flex: 1, fontWeight: 500 }}>{b.name}</span>
                  <span className="muted num">{b.mins}</span>
                  <Tag tone={b.built ? 'good' : 'info'}>{b.built ? 'Available' : 'Planned'}</Tag>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <aside className="col-side stack">
          <Card title="Your targets">
            <div className="stack">
              <div><div className="row row-between" style={{ fontSize: 14 }}><b>Accuracy</b><span className="num">{grade.accuracyAvg != null ? `${grade.accuracyAvg}%` : '—'} / {target.accuracy}%</span></div>
                <ProgressBar value={grade.accuracyScore} tone="good" label="Accuracy toward target" />
                <div className="hint">{grade.accuracyAvg == null ? 'Finish a run to see this.' : grade.accuracyScore >= 100 ? 'Target met. Hold it while you speed up.' : `${(target.accuracy - grade.accuracyAvg).toFixed(1)} points to go.`}</div></div>
              <div><div className="row row-between" style={{ fontSize: 14 }}><b>Speed</b><span className="num">{grade.bestWpm ?? '—'} WPM / {target.wpm} WPM</span></div>
                <ProgressBar value={grade.speedScore} label="Speed toward target" />
                <div className="hint">{grade.bestWpm == null ? 'Finish a run to see this.' : grade.speedScore >= 100 ? 'Target met.' : `${target.wpm - grade.bestWpm} WPM to go.`}</div></div>
            </div>
          </Card>
          <Card title="Personal bests">
            {bests.length === 0 ? <p className="empty">No clean runs yet. Finish one with no errors left and 95% accuracy or better.</p> : (
              <div>{bests.map(([k, a]) => <div className="kv" key={k}><span>{a.kind === 'sprint' ? 'Warm-up sprint' : getDrill(k)?.title ?? k}</span><b className="num">{a.wpm} WPM · {a.accuracy}%</b></div>)}</div>
            )}
            <p className="hint" style={{ marginTop: 8 }}>Only clean runs count: no errors left, 95% accuracy or better.</p>
          </Card>
          <Link to="/gradebook" className="btn btn-secondary">See my gradebook</Link>
        </aside>
      </div>
    </>
  );
}
