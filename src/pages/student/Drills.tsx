import { Link } from 'react-router-dom';
import { Tag } from '../../components/ui';
import { generatedDrillsForTrack, libraryDrills, SPRINT } from '../../content';
import { useStudent } from '../../components/Layouts';
import { WeakWordsCard } from '../../components/WeakWords';

/** Every drill for the student's track, outside the 10-day program. Runs here are saved but do not count toward activity progress. */
export function Drills() {
  const { me, attempts } = useStudent();
  const best = (id: string) => attempts.filter((a) => a.clean && a.drillId === id).sort((a, b) => b.wpm - a.wpm)[0];
  /** Error hunts have no speed, so they show how many notes were fixed completely. */
  const cleared = (id: string) => new Set(attempts.filter((a) => a.completed && a.drillId === id).map((a) => a.passage)).size;
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
        <WeakWordsCard />
        {libraryDrills(me.track).map((d) => {
          const b = best(d.id);
          return (
            <Link key={d.id} to={`/practice?kind=drill&drill=${d.id}&passage=0`} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="row row-between"><Tag tone={d.mode === 'hidden' ? 'warn' : d.mode === 'hunt' ? 'info' : 'neutral'}>{d.mode === 'hidden' ? 'Translate' : d.mode === 'hunt' ? 'Proofread' : 'Copy'}</Tag><span className="muted" style={{ fontSize: 13 }}>{d.items.length} passages</span></div>
              <h2 className="card-title" style={{ marginTop: 8 }}>{d.title}</h2>
              <p className="muted" style={{ fontSize: 14.5, margin: '4px 0 10px' }}>{d.blurb}</p>
              <div className="hint">{d.mode === 'hunt' ? <>{cleared(d.id)} of {d.items.length} notes cleared</> : b ? <>Best: <b>{b.wpm} WPM</b> · {b.accuracy}%</> : 'No clean run yet'}</div>
            </Link>
          );
        })}
      </div>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>Generated practice</h2>
        <p className="page-sub">A new passage every time, so you never retype the same text. Run results are saved like any other.</p>
      </div>
      <div className="grid-tiles">
        {generatedDrillsForTrack(me.track).map((d) => {
          const b = best(d.id);
          return (
            <Link key={d.id} to={`/practice?kind=drill&drill=${d.id}`} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="row row-between"><Tag tone={d.mode === 'hidden' ? 'warn' : d.mode === 'hunt' ? 'info' : 'neutral'}>{d.mode === 'hidden' ? (d.glossary ? 'Translate' : 'From memory') : d.mode === 'hunt' ? 'Proofread' : 'Copy'}</Tag><span className="muted" style={{ fontSize: 13 }}>New every time</span></div>
              <h2 className="card-title" style={{ marginTop: 8 }}>{d.title}</h2>
              <p className="muted" style={{ fontSize: 14.5, margin: '4px 0 10px' }}>{d.blurb}</p>
              <div className="hint">{d.mode === 'hunt' ? <>{cleared(d.id)} {cleared(d.id) === 1 ? 'note' : 'notes'} cleared</> : b ? <>Best: <b>{b.wpm} WPM</b> · {b.accuracy}%</> : 'No clean run yet'}</div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
