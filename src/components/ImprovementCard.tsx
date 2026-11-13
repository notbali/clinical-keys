import { Link } from 'react-router-dom';
import { Card } from './ui';
import { improvement, improvementPhrase } from '../lib/progress';
import { certificateSummary } from '../lib/certificate';
import { useStudent } from './Layouts';

/** "Up 8 WPM and 2.1 accuracy points since Day 1", or a gentle prompt when there is no baseline yet. Shown on Today and the gradebook. */
export function ImprovementCard() {
  const { attempts, me, day, today } = useStudent();
  const imp = improvement(attempts);
  const phrase = improvementPhrase(imp);
  const cert = certificateSummary({ attempts, track: me.track, day, today, firstName: me.firstName, lastName: me.lastName });

  return (
    <Card title="Since Day 1">
      {!imp.baseline ? (
        <p className="empty">Finish the Day 1 baseline typing test and your growth shows up here.</p>
      ) : !imp.latest || phrase == null ? (
        <>
          <p><b className="num">{imp.baseline.wpm} WPM</b> at <b className="num">{imp.baseline.accuracy}%</b> on your Day 1 baseline.</p>
          <p className="hint" style={{ marginTop: 6 }}>Finish a clean run or the Day 5 test to see how far you’ve come.</p>
        </>
      ) : (
        <>
          <p style={{ fontSize: 17, fontWeight: 700 }} data-testid="improvement">{phrase}.</p>
          <div className="kv"><span>Day 1 baseline</span><b className="num">{imp.baseline.wpm} WPM · {imp.baseline.accuracy}%</b></div>
          <div className="kv"><span>{imp.latest.source === 'test' ? `Day ${imp.latest.day} test` : 'Best clean run'}</span><b className="num">{imp.latest.wpm} WPM · {imp.latest.accuracy}%</b></div>
        </>
      )}
      {cert.eligible && <p style={{ marginTop: 10 }}><Link to="/certificate" className="btn btn-primary btn-sm">View my certificate</Link></p>}
    </Card>
  );
}
