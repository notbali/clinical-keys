import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, ProgressBar, Tag, TrackTag, ago } from '../../components/ui';
import { useRoster } from '../../data/useRoster';
import { rollingGroups } from '../../lib/insights';
import { attentionReasons } from '../../lib/metrics';
import '../../styles/insights.css';

const dayText = (day: number, start?: string) => (day < 1 ? `Starts ${start ?? 'soon'}` : day > 10 ? 'Past Day 10' : `Day ${day} of 10`);

export function Rolling() {
  const { metrics, classes, loading, error } = useRoster();
  const groups = useMemo(
    () => rollingGroups(metrics.map((m) => ({ ...m, riskCount: m.risk.length })), classes.filter((c) => c.status === 'active' || metrics.some((m) => m.student.classId === c.id && m.student.status === 'active'))),
    [metrics, classes],
  );
  if (error) return <div className="note note-bad">{error}</div>;
  const total = groups.reduce((s, g) => s + g.rows.length, 0);
  const behind = groups.reduce((s, g) => s + g.behindCount, 0);
  const now = Date.now();

  return (
    <>
      <div>
        <div className="muted" style={{ fontSize: 13 }}><Link to="/hub" style={{ fontWeight: 600, textDecoration: 'none' }}>Today’s room</Link> / Rolling start</div>
        <h1 className="page-title">Rolling start</h1>
        <p className="muted">Everyone’s current program day, by class and track. Students who are behind come first. {total} active · {behind} behind.</p>
      </div>
      {loading && <p className="empty">Loading…</p>}
      {!loading && total === 0 && <p className="empty">No active students yet.</p>}
      {groups.map((g) => (
        <Card key={`${g.classId}-${g.track}`} title={<>{g.className} <TrackTag track={g.track} /></>} subtitle={`${g.rows.length} students · ${g.behindCount} behind`}>
          <div className="table-scroll">
            <table className="data-table">
              <caption className="visually-hidden">{g.className}, {g.track === 'ma' ? 'Medical Assistant' : 'Pharmacy Tech'}: current program day</caption>
              <thead><tr><th scope="col">Student</th><th scope="col">Program day</th><th scope="col">Earlier work</th><th scope="col">Today</th><th scope="col">Last active</th><th scope="col">Needs attention</th></tr></thead>
              <tbody>
                {g.rows.map((m) => {
                  const reasons = attentionReasons(m);
                  return (
                    <tr key={m.student.id}>
                      <th scope="row"><Link to={`/students/${m.student.id}`} translate="no">{m.student.firstName} {m.student.lastName}</Link></th>
                      <td style={{ minWidth: 130 }}>
                        <div style={{ fontWeight: 600 }}>{dayText(m.day, m.student.enrollment?.startDate)}</div>
                        <ProgressBar value={Math.min(Math.max(m.day, 0), 10) * 10} tone="ink" label={`Program day ${m.day}`} />
                      </td>
                      <td>{m.behindBy > 0 ? <Tag tone="warn">Behind by {m.behindBy}</Tag> : m.day < 1 ? <span className="muted">Not started</span> : <Tag tone="good">On track</Tag>}</td>
                      <td>{m.day >= 1 && m.day <= 10 ? `${m.todayDone} of ${m.todayTotal}` : '—'}</td>
                      <td className="muted">{ago(m.lastActive, now)}</td>
                      <td>{reasons.length ? reasons.map((r) => <div key={r} className="risk-line">{r}</div>) : <span className="muted">None</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </>
  );
}
