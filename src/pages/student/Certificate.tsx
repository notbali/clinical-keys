import { Link } from 'react-router-dom';
import { Card } from '../../components/ui';
import { useStudent } from '../../components/Layouts';
import { certificateSummary } from '../../lib/certificate';
import { toUTC } from '../../lib/dates';

/** Print rules: only the certificate prints. The app chrome (top bars, nav, banners, buttons) is hidden. */
const PRINT_CSS = `
@media print {
  .skip, .demo-banner, .topbar, .ehr-bar, .ehr-nav, .no-print { display: none !important; }
  body { background: #fff !important; }
  .ehr-body { display: block !important; }
  .page { max-width: none !important; padding: 0 !important; }
  .certificate { border-width: 3px !important; box-shadow: none !important; break-inside: avoid; }
  @page { margin: 0.6in; }
}`;

const fmt = (iso: string) => new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(toUTC(iso)));

/** Day 10 completion certificate. Available once the final test is done (or the student is past Day 10). */
export function Certificate() {
  const { me, attempts, day, today } = useStudent();
  const c = certificateSummary({ attempts, track: me.track, day, today, firstName: me.firstName, lastName: me.lastName });

  if (!c.eligible) {
    return (
      <>
        <h1 className="page-title">Certificate</h1>
        <Card title="Not available yet"><p className="muted">{c.reason}</p><p style={{ marginTop: 12 }}><Link to="/today" className="btn btn-primary">Back to Today</Link></p></Card>
      </>
    );
  }

  const gain = (n: number | null, unit: string) => (n == null ? '—' : `${n > 0 ? '+' : ''}${n}${unit}`);
  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="row row-between no-print">
        <h1 className="page-title">Your certificate</h1>
        <div className="row"><Link to="/gradebook" className="btn btn-secondary">Back to my results</Link><button className="btn btn-primary" onClick={() => window.print()}>Print certificate</button></div>
      </div>

      <section className="certificate card" aria-label="Certificate of completion" style={{ border: '2px solid var(--accent)', padding: '40px 32px', textAlign: 'center', maxWidth: 820, margin: '0 auto', width: '100%' }}>
        <div style={{ fontSize: 13, letterSpacing: '0.12em', fontWeight: 700, color: 'var(--accent)' }}>CLINICAL KEYS · TYPING COURSE</div>
        <h2 style={{ fontSize: 32, fontWeight: 800, margin: '10px 0 4px' }}>Certificate of Completion</h2>
        <p className="muted">This certifies that</p>
        <p translate="no" style={{ fontSize: 36, fontWeight: 800, margin: '8px 0', borderBottom: '1px solid var(--line-strong)', display: 'inline-block', padding: '0 24px 6px' }}>{c.name}</p>
        <p style={{ fontSize: 17, margin: '8px 0 24px' }}>completed the 10-day <b>{c.trackLabel}</b> typing program.</p>

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 16, margin: '0 auto 24px', maxWidth: 640 }}>
          <div style={{ flex: '1 1 160px', border: '1px solid var(--line)', borderRadius: 8, padding: 14 }}>
            <div className="muted" style={{ fontSize: 13 }}>Day 1 baseline</div>
            <div className="num" style={{ fontSize: 24, fontWeight: 700 }}>{c.day1 ? `${c.day1.wpm} WPM` : '—'}</div>
            <div className="num muted">{c.day1 ? `${c.day1.accuracy}% accuracy` : 'No baseline recorded'}</div>
          </div>
          <div style={{ flex: '1 1 160px', border: '1px solid var(--line)', borderRadius: 8, padding: 14 }}>
            <div className="muted" style={{ fontSize: 13 }}>{c.final?.source === 'test' ? `Day ${c.final.day} test` : 'Best clean run'}</div>
            <div className="num" style={{ fontSize: 24, fontWeight: 700 }}>{c.final ? `${c.final.wpm} WPM` : '—'}</div>
            <div className="num muted">{c.final ? `${c.final.accuracy}% accuracy` : 'No result recorded'}</div>
          </div>
          <div style={{ flex: '1 1 160px', border: '1px solid var(--line)', borderRadius: 8, padding: 14 }}>
            <div className="muted" style={{ fontSize: 13 }}>Change</div>
            <div className="num" style={{ fontSize: 24, fontWeight: 700 }}>{gain(c.wpmGain, ' WPM')}</div>
            <div className="num muted">{gain(c.accuracyGain, ' accuracy points')}</div>
          </div>
        </div>

        <p style={{ fontSize: 15 }}>Date: <b>{fmt(c.date)}</b></p>
        <p className="muted" style={{ fontSize: 13, marginTop: 20, maxWidth: 560, marginInline: 'auto' }}>{c.notice}</p>
      </section>
    </>
  );
}
