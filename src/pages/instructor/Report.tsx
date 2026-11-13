import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, ErrorNote, fmtDate, mmss } from '../../components/ui';
import { useApi, useAsync } from '../../data/context';
import { useRoster } from '../../data/useRoster';
import { todayISO } from '../../lib/dates';
import { CELL_INFO } from '../../lib/insights';
import { buildReport } from '../../lib/report';
import '../../styles/insights.css';

const num = (n: number | null, suffix = '') => (n == null ? '—' : `${n}${suffix}`);
const signed = (n: number, suffix: string) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}${suffix}`;

/** Notes live in their own component so they are only fetched, and only rendered, when the toggle is on. */
function PrivateBlock({ studentId, overrideReason }: { studentId: string; overrideReason?: string }) {
  const api = useApi();
  const notes = useAsync(() => api.listNotes(studentId), [api, studentId]);
  return (
    <section className="report-private">
      <h2>Instructor-private</h2>
      {overrideReason && <p><b>Grade override reason:</b> {overrideReason}</p>}
      {(notes.data ?? []).length === 0 ? <p className="muted">No notes.</p> : (
        <ul>{(notes.data ?? []).map((n) => <li key={n.id}><span className="muted">{fmtDate(n.at)}:</span> {n.text}</li>)}</ul>
      )}
    </section>
  );
}

export function Report() {
  const { id = '' } = useParams();
  const { metrics, classes, settings, loading, error } = useRoster();
  const [priv, setPriv] = useState(false);
  const m = metrics.find((x) => x.student.id === id);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (loading) return <p className="empty">Loading…</p>;
  if (!m) return <ErrorNote>That student wasn’t found. <Link to="/hub">Back to the room</Link></ErrorNote>;

  const klass = classes.find((c) => c.id === m.student.classId);
  // Notes are fetched by PrivateBlock only; the report data itself never carries them unless the toggle is on.
  const r = buildReport({ metrics: m, settings, className: klass?.name, today: todayISO(), includePrivate: priv });

  return (
    <>
      <div className="no-print stack" style={{ gap: 12 }}>
        <div className="muted" style={{ fontSize: 14 }}><Link to={`/students/${m.student.id}`} style={{ fontWeight: 600, textDecoration: 'none' }}>← Back to {r.student.name}</Link></div>
        <div className="row">
          <Button variant="dark" onClick={() => window.print()}>Print this report</Button>
          <label className="row" style={{ gap: 8, fontSize: 14 }}>
            <input type="checkbox" name="include-private" checked={priv} onChange={(e) => setPriv(e.target.checked)} />
            Include instructor-private notes and grade-override reason
          </label>
        </div>
        <p className="hint">Off by default. Turn it on only for your own copy; leave it off for anything a student or family will see.</p>
      </div>

      <article className="report" aria-label={`Progress report for ${r.student.name}`}>
        <header>
          <div className="muted" style={{ fontSize: 13 }}>Clinical Keys · Typing progress report</div>
          <h1 translate="no">{r.student.name}</h1>
          <div className="report-meta">
            <span>{r.student.trackLabel}</span>
            {r.student.className && <span>{r.student.className}</span>}
            <span>{r.dayLabel}</span>
            {r.startDate && <span>Started {fmtDate(r.startDate, { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
            {r.exitDate && <span>Day 10 on {fmtDate(r.exitDate, { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
            <span>Printed {fmtDate(r.generatedOn, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
        </header>

        <section>
          <h2>Typing grade</h2>
          <div className="report-big">
            <div><b>{num(r.grade.total, '%')}</b><span>{r.grade.overridden ? 'Typing grade (set by instructor)' : 'Typing grade'}</span></div>
            <div><b>{num(r.grade.accuracyAvg, '%')}</b><span>Accuracy, last 3 finished runs</span></div>
            <div><b>{num(r.grade.bestWpm)}</b><span>Best speed (WPM)</span></div>
            <div><b>{r.grade.completion.done} of {r.grade.completion.total}</b><span>Activities completed</span></div>
          </div>
          <table className="data-table" style={{ marginTop: 10 }}>
            <thead><tr><th scope="col">Part</th><th scope="col">Weight</th><th scope="col">Score</th></tr></thead>
            <tbody>{r.grade.parts.map((p) => <tr key={p.name}><th scope="row">{p.name}</th><td>{p.weightPct}%</td><td>{p.score} / 100</td></tr>)}</tbody>
          </table>
        </section>

        <section>
          <h2>Program progress</h2>
          <table className="data-table">
            <thead><tr><th scope="col">Day</th><th scope="col">Topic</th><th scope="col">Status</th><th scope="col">Activities</th><th scope="col">Accuracy</th></tr></thead>
            <tbody>
              {r.program.map((p) => (
                <tr key={p.day}>
                  <th scope="row">Day {p.day}</th><td>{p.title}</td>
                  <td><span aria-hidden="true">{CELL_INFO[p.status].symbol} </span>{CELL_INFO[p.status].label}</td>
                  <td>{p.done} of {p.total}</td><td>{num(p.accuracy, '%')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2>Typing tests: Day 1 compared with latest</h2>
          <table className="data-table">
            <thead><tr><th scope="col">Test</th><th scope="col">Speed (WPM)</th><th scope="col">Accuracy</th><th scope="col">Date</th></tr></thead>
            <tbody>
              {r.tests.map((t) => (
                <tr key={t.day}><th scope="row">{t.label}</th><td>{t.taken ? t.wpm : 'Not taken'}</td><td>{t.taken ? `${t.accuracy}%` : '—'}</td><td>{t.date ? fmtDate(t.date) : '—'}</td></tr>
              ))}
            </tbody>
          </table>
          <p style={{ marginTop: 8 }}>
            {r.comparison
              ? <>From Day {r.comparison.from.day} to Day {r.comparison.to.day}: speed <b>{signed(r.comparison.wpmChange, ' WPM')}</b>, accuracy <b>{signed(r.comparison.accuracyChange, ' points')}</b>.</>
              : 'A comparison appears once the Day 1 test and a later test are both finished.'}
          </p>
        </section>

        <section>
          <h2>Run counts</h2>
          <table className="data-table">
            <tbody>
              <tr><th scope="row">Total runs</th><td>{r.runs.total}</td><th scope="row">Finished (no errors left)</th><td>{r.runs.finished}</td></tr>
              <tr><th scope="row">Warm-up sprints</th><td>{r.runs.sprints}</td><th scope="row">Clean (95% or better)</th><td>{r.runs.clean}</td></tr>
              <tr><th scope="row">Drill and test runs</th><td>{r.runs.drills}</td><th scope="row">Stopped with errors left</th><td>{r.runs.errorsLeft}</td></tr>
              <tr><th scope="row">Time typing</th><td>{mmss(r.runs.seconds)}</td><td /><td /></tr>
            </tbody>
          </table>
        </section>

        {priv && <PrivateBlock studentId={m.student.id} overrideReason={r.private?.overrideReason} />}
      </article>
    </>
  );
}
