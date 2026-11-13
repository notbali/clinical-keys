import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, ProgressBar, Stat, Tag, TrackTag, ago, pct } from '../../components/ui';
import { useRoster } from '../../data/useRoster';
import { download, gradesCsv } from '../../lib/exports';
import { todayISO } from '../../lib/dates';
import '../../styles/insights.css';
import { attentionReasons, needsAttention, uncoveredFlags, type StudentMetrics } from '../../lib/metrics';

const GROUPS: { title: string; test: (d: number) => boolean }[] = [
  { title: 'Day 9 and up · finishing', test: (d) => d >= 9 },
  { title: 'Day 4 to 8 · mid-program', test: (d) => d >= 4 && d <= 8 },
  { title: 'Day 1 to 3 · new', test: (d) => d <= 3 },
];

export function Hub() {
  const { metrics, loading, error, settings } = useRoster();
  const [q, setQ] = useState('');
  const active = metrics.filter((m) => m.student.status === 'active');
  const shown = active.filter((m) => `${m.student.firstName} ${m.student.lastName} ${m.student.username}`.toLowerCase().includes(q.trim().toLowerCase()));

  const kpi = useMemo(() => {
    const withRuns = active.filter((m) => m.latestWpm != null);
    const avg = (f: (m: StudentMetrics) => number) => (withRuns.length ? Math.round(withRuns.reduce((s, m) => s + f(m), 0) / withRuns.length) : null);
    return {
      count: active.length, ma: active.filter((m) => m.student.track === 'ma').length,
      wpm: avg((m) => m.latestWpm!), acc: avg((m) => m.latestAccuracy!),
      attention: active.filter(needsAttention),
      exiting: active.filter((m) => m.day >= 10),
    };
  }, [active]);

  const trackAvg = (t: 'ma' | 'rx') => {
    const list = active.filter((m) => m.student.track === t && m.latestWpm != null);
    return list.length ? { wpm: Math.round(list.reduce((s, m) => s + m.latestWpm!, 0) / list.length), acc: Math.round(list.reduce((s, m) => s + m.latestAccuracy!, 0) / list.length) } : null;
  };

  if (error) return <div className="note note-bad">{error}</div>;
  const now = Date.now();

  return (
    <>
      <div className="row row-between" style={{ alignItems: 'flex-end' }}>
        <div>
          <div className="muted num" style={{ fontSize: 13 }}>{new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}</div>
          <h1 className="page-title">Today’s room</h1>
        </div>
        <div className="row">
          <label className="visually-hidden" htmlFor="q">Search students</label>
          <input id="q" name="search" type="search" autoComplete="off" spellCheck={false} className="input search" placeholder="Search students…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button onClick={() => download(`typing-grades-${todayISO()}.csv`, gradesCsv(active))} disabled={!active.length}>Export for Blackboard</Button>
          <Link to="/heatmap" className="btn btn-secondary">Class heatmap</Link>
          <Link to="/rolling" className="btn btn-secondary">Rolling start</Link>
          <Link to="/classes" className="btn btn-dark">+ Add students</Link>
        </div>
      </div>

      <div className="grid-tiles">
        <Stat label="Active students" value={kpi.count} note={`${kpi.ma} MA · ${kpi.count - kpi.ma} PT`} />
        <Stat label="Average accuracy" value={kpi.acc == null ? '—' : `${kpi.acc}%`} note={`Target ${settings.targets.ma.accuracy}%`} tone={kpi.acc != null && kpi.acc >= settings.targets.ma.accuracy ? 'good' : undefined} />
        <Stat label="Average WPM" value={kpi.wpm ?? '—'} note={`Target ${settings.targets.ma.wpm}`} />
        <Stat label="Needs attention" value={kpi.attention.length} note="See the list" tone={kpi.attention.length ? 'bad' : undefined} />
        <Stat label="At Day 10" value={kpi.exiting.length} note="Ready to exit" tone="info" />
      </div>

      <div className="stack-lg">
        <Card title="Everyone in the room" action={<span className="muted" style={{ fontSize: 13 }}>Grouped by program day</span>}>
          {loading && <p className="empty">Loading…</p>}
          {!loading && active.length === 0 && <p className="empty">No active students yet. <Link to="/classes">Add students</Link> to get started.</p>}
          {!loading && active.length > 0 && shown.length === 0 && <p className="empty">No one matches “{q}”.</p>}
          <div className="table"><div className="table-in">
            <div className="tr head cols-roster"><div>Student</div><div>Track</div><div>Program day</div><div>Today</div><div>WPM</div><div>Accuracy</div><div>Typing grade</div><div>Last active</div></div>
            {GROUPS.map((g) => {
              const rows = shown.filter((m) => g.test(Math.max(m.day, 1))).sort((a, b) => b.day - a.day);
              if (!rows.length) return null;
              return (
                <div key={g.title}>
                  <div className="group-head">{g.title}</div>
                  {rows.map((m) => {
                    const lowAcc = m.latestAccuracy != null && m.latestAccuracy < settings.targets[m.student.track].accuracy;
                    return (
                      <div className="tr cols-roster" key={m.student.id}>
                        <div className="cell-name">
                          <Link to={`/students/${m.student.id}`} translate="no">{m.student.firstName} {m.student.lastName}</Link>
                          <div className="cell-sub" translate="no">{m.student.username}</div>
                          {m.risk.length > 0 && <div style={{ marginTop: 2 }}><Tag tone="bad">At risk</Tag></div>}
                          {m.risk.map((r) => <div key={r.kind} className="risk-line">{r.text}</div>)}
                          {uncoveredFlags(m).map((f) => <div key={f.kind} className="cell-flag" style={{ color: f.tone === 'bad' ? 'var(--bad)' : f.tone === 'warn' ? 'var(--warn)' : 'var(--link)' }}>{f.text}</div>)}
                        </div>
                        <div><TrackTag track={m.student.track} /></div>
                        <div><div style={{ fontSize: 13, fontWeight: 600 }}>Day {Math.min(Math.max(m.day, 1), 10)} of 10</div><ProgressBar value={Math.min(m.day, 10) * 10} tone="ink" label={`Program day ${m.day}`} /></div>
                        <div>{m.todayDone} of {m.todayTotal}</div>
                        <div><b>{m.latestWpm ?? '—'}</b></div>
                        <div><b style={{ color: lowAcc ? 'var(--bad)' : undefined }}>{m.latestAccuracy == null ? '—' : `${m.latestAccuracy}%`}</b></div>
                        <div><b>{m.grade.total == null ? '—' : `${m.grade.total}%`}</b>{m.grade.override && <span className="muted" style={{ fontSize: 11 }}> set</span>}</div>
                        <div className="muted" style={{ fontSize: 13 }}>{ago(m.lastActive, now)}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div></div>
          <p className="hint" style={{ marginTop: 8 }}>WPM and accuracy are each student’s most recent day. Accuracy under target shows in red.</p>
        </Card>

        <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
          <Card title="Needs attention" className="" >
            {kpi.attention.length === 0 ? <p className="empty">Nobody is flagged right now.</p> : (
              <div className="stack" style={{ gap: 10 }}>
                {kpi.attention.map((m) => (
                  <div key={m.student.id} style={{ border: '1px solid var(--line-soft)', borderLeft: `5px solid ${m.risk.length || m.flags[0]?.tone === 'bad' ? 'var(--bad)' : 'var(--warn)'}`, borderRadius: 8, padding: '10px 14px' }}>
                    <div className="row row-between"><Link to={`/students/${m.student.id}`} style={{ fontWeight: 700, color: 'var(--ink)', textDecoration: 'none' }}>{m.student.firstName} {m.student.lastName}</Link><span className="muted" style={{ fontSize: 12 }}>Day {Math.min(Math.max(m.day, 1), 10)} · {m.student.track === 'ma' ? 'MA' : 'PT'}</span></div>
                    {attentionReasons(m).map((t) => <div key={t} style={{ fontSize: 13.5 }} className="muted">{t}</div>)}
                    <Link to={`/students/${m.student.id}`} style={{ fontSize: 13, fontWeight: 600 }}>Open record →</Link>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title="Rotating out soon" subtitle="Students on Day 9 or later.">
            {active.filter((m) => m.day >= 9).length === 0 ? <p className="empty">No one is near the end of the program.</p> : (
              <div className="stack" style={{ gap: 8 }}>
                {active.filter((m) => m.day >= 9).map((m) => (
                  <div key={m.student.id} className="row row-between" style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px' }}>
                    <div><b>{m.student.firstName} {m.student.lastName}</b><div className="muted" style={{ fontSize: 12.5 }}>Day {Math.min(m.day, 10)} of 10</div></div>
                    <Link to={`/students/${m.student.id}`} style={{ fontSize: 13, fontWeight: 600 }}>Prepare exit</Link>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title="Room average" subtitle="By track, most recent day.">
            {(['ma', 'rx'] as const).map((t) => {
              const a = trackAvg(t);
              return (
                <div key={t} style={{ marginBottom: 10 }}>
                  <div className="row row-between" style={{ fontSize: 14 }}><b>{t === 'ma' ? 'Medical Assistant' : 'Pharmacy Tech'}</b><span className="num">{a ? `${a.wpm} WPM · ${pct(a.acc)}` : '—'}</span></div>
                  <ProgressBar value={a ? (a.wpm / settings.targets[t].wpm) * 100 : 0} label={`${t} speed against target`} />
                </div>
              );
            })}
            <p className="hint">Bar shows average WPM against the target.</p>
          </Card>
        </div>
      </div>
      <Tag tone="neutral">{active.length} active · {metrics.length - active.length} archived</Tag>
    </>
  );
}
