import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, TrackTag } from '../../components/ui';
import { useRoster } from '../../data/useRoster';
import { CELL_INFO, heatmapRow, type CellStatus } from '../../lib/insights';
import '../../styles/insights.css';

const DAYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function Heatmap() {
  const { metrics, classes, settings, loading, error } = useRoster();
  const active = metrics.filter((m) => m.student.status === 'active');
  const activeClasses = classes.filter((c) => c.status === 'active' && active.some((m) => m.student.classId === c.id));
  const [picked, setPicked] = useState('');
  const classId = activeClasses.some((c) => c.id === picked) ? picked : activeClasses[0]?.id ?? '';
  const klass = activeClasses.find((c) => c.id === classId);

  const rows = useMemo(
    () => active.filter((m) => m.student.classId === classId)
      .sort((a, b) => a.student.track.localeCompare(b.student.track) || a.student.lastName.localeCompare(b.student.lastName) || a.student.firstName.localeCompare(b.student.firstName))
      .map((m) => ({ m, cells: heatmapRow({ track: m.student.track, day: m.day, attempts: m.attempts }) })),
    [active, classId],
  );

  if (error) return <div className="note note-bad">{error}</div>;

  return (
    <>
      <div className="row row-between" style={{ alignItems: 'flex-end' }}>
        <div>
          <div className="muted" style={{ fontSize: 13 }}><Link to="/hub" style={{ fontWeight: 600, textDecoration: 'none' }}>Today’s room</Link> / Class heatmap</div>
          <h1 className="page-title">Class heatmap</h1>
        </div>
        {activeClasses.length > 0 && (
          <div className="row">
            <label htmlFor="heat-class" className="muted" style={{ fontSize: 14 }}>Class</label>
            <select id="heat-class" name="class" className="select" style={{ width: 'auto' }} value={classId} onChange={(e) => setPicked(e.target.value)}>
              {activeClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
      </div>

      <Card title={klass?.name ?? 'Class'} subtitle="Each row is a student on their own schedule. Each column is a program day.">
        {loading && <p className="empty">Loading…</p>}
        {!loading && rows.length === 0 && <p className="empty">No active students in a class yet. <Link to="/classes">Add students</Link>.</p>}
        {rows.length > 0 && (
          <div className="table-scroll">
            <table className="heat">
              <caption className="visually-hidden">Program progress by student and day for {klass?.name}</caption>
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  {DAYS.map((d) => <th key={d} scope="col">Day {d}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ m, cells }) => {
                  const target = settings.targets[m.student.track].accuracy;
                  return (
                    <tr key={m.student.id}>
                      <th scope="row">
                        <Link to={`/students/${m.student.id}`} translate="no">{m.student.firstName} {m.student.lastName}</Link>{' '}
                        <TrackTag track={m.student.track} />
                      </th>
                      {cells.map((c) => {
                        const info = CELL_INFO[c.status];
                        const low = c.accuracy != null && c.accuracy < target;
                        return (
                          <td key={c.day} className={`heat-cell heat-${c.status}`}>
                            <span className="visually-hidden">{info.label}, {c.done} of {c.total} activities{c.accuracy != null ? `, accuracy ${c.accuracy}%${low ? ', below target' : ''}` : ''}</span>
                            <span aria-hidden="true">
                              <span className="sym">{info.symbol}</span>{c.status === 'upcoming' && c.done === 0 ? '' : `${c.done}/${c.total}`}
                              {c.accuracy != null && <small>{Math.round(c.accuracy)}%{low ? ' ↓' : ''}</small>}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <h2 className="card-title" style={{ fontSize: 15, marginTop: 18, marginBottom: 8 }}>Key</h2>
        <ul className="heat-legend">
          {(Object.keys(CELL_INFO) as CellStatus[]).map((s) => (
            <li key={s}><span className={`heat-cell heat-${s}`}><span className="sym" aria-hidden="true">{CELL_INFO[s].symbol}</span>{CELL_INFO[s].label}</span> <span className="muted">{CELL_INFO[s].help}</span></li>
          ))}
        </ul>
        <p className="hint" style={{ marginTop: 8 }}>The fraction is activities finished out of the day’s activities. The percent is average accuracy on that day’s finished runs; ↓ means under the track target.</p>
      </Card>
    </>
  );
}
