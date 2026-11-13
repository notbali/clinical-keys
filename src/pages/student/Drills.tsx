import { Link } from 'react-router-dom';
import { Tag } from '../../components/ui';
import { libraryDrills, SPRINT } from '../../content';
import { useStudent } from '../../components/Layouts';

/** Every drill for the student's track, outside the 10-day program. Runs here are saved but do not count toward activity progress. */
export function Drills() {
  const { me, attempts } = useStudent();
  const best = (id: string) => attempts.filter((a) => a.clean && a.drillId === id).sort((a, b) => b.wpm - a.wpm)[0];
  const bestSprint = attempts.filter((a) => a.clean && a.kind === 'sprint').sort((a, b) => b.wpm - a.wpm)[0];
  return (
    <>
      <div><h1 className="page-title">All drills</h1><p className="page-sub">Extra practice for your track. Your program activities are on the Today page.</p></div>
      <div className="grid-tiles">
        <Link to="/practice?kind=sprint" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="row row-between"><Tag tone="info">Sprint</Tag><span className="muted" style={{ fontSize: 13 }}>{SPRINT.limit} seconds</span></div>
          <h2 className="card-title" style={{ marginTop: 8 }}>Warm-up sprint</h2>
          <p className="muted" style={{ fontSize: 14.5, margin: '4px 0 10px' }}>A fresh {SPRINT.limit}-second run of short, job-style lines.</p>
          <div className="hint">{bestSprint ? <>Best: <b>{bestSprint.wpm} WPM</b> · {bestSprint.accuracy}%</> : 'No clean run yet'}</div>
        </Link>
        {libraryDrills(me.track).map((d) => {
          const b = best(d.id);
          return (
            <Link key={d.id} to={`/practice?kind=drill&drill=${d.id}&passage=0`} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="row row-between"><Tag tone={d.mode === 'hidden' ? 'warn' : 'neutral'}>{d.mode === 'hidden' ? 'Translate' : 'Copy'}</Tag><span className="muted" style={{ fontSize: 13 }}>{d.items.length} passages</span></div>
              <h2 className="card-title" style={{ marginTop: 8 }}>{d.title}</h2>
              <p className="muted" style={{ fontSize: 14.5, margin: '4px 0 10px' }}>{d.blurb}</p>
              <div className="hint">{b ? <>Best: <b>{b.wpm} WPM</b> · {b.accuracy}%</> : 'No clean run yet'}</div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
