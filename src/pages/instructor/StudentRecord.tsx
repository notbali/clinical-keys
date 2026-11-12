import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, ErrorNote, Field, Stat, Tag, TrackTag, ago, fmtDate } from '../../components/ui';
import { LineChart } from '../../components/Charts';
import { useApi, useAsync } from '../../data/context';
import { useRoster } from '../../data/useRoster';
import { dateOfProgramDay } from '../../lib/dates';
import { byProgramDay } from '../../lib/stats';
import { getDrill } from '../../content';

export function StudentRecordPage() {
  const { id = '' } = useParams();
  const api = useApi();
  const nav = useNavigate();
  const { metrics, classes, settings, loading, error, reload } = useRoster();
  const m = metrics.find((x) => x.student.id === id);
  const notes = useAsync(() => api.listNotes(id), [api, id]);
  const audit = useAsync(() => api.listAudit(), [api]);

  const [noteText, setNoteText] = useState('');
  const [ovValue, setOvValue] = useState('');
  const [ovReason, setOvReason] = useState('');
  const [ext, setExt] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (loading) return <p className="empty">Loading…</p>;
  if (!m) return <ErrorNote>That student wasn’t found. <Link to="/hub">Back to the room</Link></ErrorNote>;

  const { student, grade } = m;
  const target = settings.targets[student.track];
  const w = settings.weights;
  const klass = classes.find((c) => c.id === student.classId);
  const points = byProgramDay(m.attempts);
  const exitDate = student.enrollment ? dateOfProgramDay(student.enrollment.startDate, 10, new Set(settings.closedDays)) : null;
  const fullName = `${student.firstName} ${student.lastName}`;
  const log = (audit.data ?? []).filter((a) => a.subject === fullName).slice(0, 5);
  const recent = [...m.attempts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10);
  const wsum = w.accuracy + w.speed + w.completion || 1;

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ tone: 'good', text: ok }); reload(); notes.reload(); audit.reload(); }
    catch (e) { setMsg({ tone: 'bad', text: e instanceof Error ? e.message : 'Something went wrong.' }); }
    setBusy(false);
  };

  return (
    <>
      <div className="muted" style={{ fontSize: 14 }}><Link to="/hub" style={{ fontWeight: 600, textDecoration: 'none' }}>Today’s room</Link> / Students / {fullName}</div>
      <div className="row row-between">
        <div className="row" style={{ gap: 16 }}>
          <div className="avatar" style={{ width: 64, height: 64, fontSize: 24 }} aria-hidden="true">{student.firstName[0]}{student.lastName[0]}</div>
          <div>
            <h1 className="page-title" style={{ fontSize: 32 }} translate="no">{fullName}</h1>
            <div className="row" style={{ gap: 8, marginTop: 6, fontSize: 13.5 }}>
              <span className="mono muted" translate="no">{student.username}</span><TrackTag track={student.track} />
              {klass && <Tag>{klass.name}</Tag>}
              <Tag>{m.day > 10 ? 'Past Day 10' : `Day ${Math.max(m.day, 1)} of 10`}{exitDate ? ` · exits ${fmtDate(exitDate)}` : ''}</Tag>
              {student.status === 'archived' && <Tag tone="warn">Archived</Tag>}
            </div>
          </div>
        </div>
        <div className="row"><Button onClick={() => window.print()}>Print progress report</Button>
          {student.status === 'active'
            ? <Button variant="dark" onClick={() => void run(async () => { await api.exitStudent(student.id); }, `${fullName} was exited and archived.`)} busy={busy}>Exit and archive</Button>
            : <Button variant="dark" onClick={() => void run(() => api.restoreStudent(student.id), `${fullName} was restored.`)} busy={busy}>Restore student</Button>}
        </div>
      </div>
      {msg && <div className={`note note-${msg.tone}`} role="status">{msg.text}</div>}
      {m.flags.length > 0 && <div className="row">{m.flags.map((f) => <Tag key={f.kind} tone={f.tone}>{f.text}</Tag>)}</div>}

      <div className="grid-tiles">
        <Stat label="Typing grade" value={grade.total == null ? '—' : `${grade.total}%`} note={grade.override ? 'Set by you' : 'Automatic, live'} tone="info" />
        <Stat label="Accuracy" value={grade.accuracyAvg == null ? '—' : `${grade.accuracyAvg}%`} note={`Target ${target.accuracy}%`} tone={grade.accuracyScore >= 100 ? 'good' : undefined} />
        <Stat label="Speed" value={grade.bestWpm == null ? '—' : `${grade.bestWpm} WPM`} note={`Target ${target.wpm}`} />
        <Stat label="Activities done" value={`${grade.completion.done} of ${grade.completion.total}`} note={`Through Day ${Math.min(Math.max(m.day, 1), 10)}`} />
        <Stat label="Last active" value={<span style={{ fontSize: 22 }}>{ago(m.lastActive)}</span>} note={`${m.attempts.length} runs in total`} />
      </div>

      <div className="cols">
        <div className="col-main stack" style={{ flexBasis: 640 }}>
          <Card title="Typing grade" subtitle="Computed after every run. Locked unless you override it with a reason, which is logged.">
            <div className="table"><div className="table-in" style={{ minWidth: 560 }}>
              <div className="tr head cols-grades"><div>Part</div><div>Weight</div><div>Score</div><div>How</div><div>Status</div></div>
              {[
                ['Accuracy', w.accuracy, grade.accuracyScore, `Last 3 clean runs average ${grade.accuracyAvg ?? '—'}%, target ${target.accuracy}%`],
                ['Speed', w.speed, grade.speedScore, `${grade.bestWpm ?? '—'} WPM against a ${target.wpm} WPM target`],
                ['Activities completed', w.completion, grade.completionScore, `${grade.completion.done} of ${grade.completion.total} assigned through today`],
              ].map(([n, wt, sc, how]) => (
                <div className="tr cols-grades" key={String(n)}><div style={{ fontWeight: 600 }}>{n}</div><div>{Math.round((Number(wt) / wsum) * 100)}%</div><div><b>{sc}</b> <span className="muted">/ 100</span></div><div className="muted" style={{ fontSize: 13 }}>{how}</div><div><Tag tone="info">Automatic</Tag></div></div>
              ))}
              <div className="tr cols-grades" style={{ borderTop: '2px solid var(--ink)' }}><div style={{ fontWeight: 700 }}>Typing grade</div><div>Total</div><div><b>{grade.computed ?? '—'}</b> <span className="muted">/ 100</span></div><div className="muted" style={{ fontSize: 13 }}>{grade.override ? `Overridden to ${grade.override.value}: ${grade.override.reason}` : 'Not overridden'}</div><div>{grade.override ? <Tag tone="warn">Overridden</Tag> : <Tag tone="info">Automatic</Tag>}</div></div>
            </div></div>
            <form className="row" style={{ marginTop: 14, alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); void run(async () => { await api.setOverride(student.id, Number(ovValue), ovReason); setOvValue(''); setOvReason(''); }, 'Typing grade overridden.'); }}>
              <Field label="Override to (0–100)">{({ id }) => <input id={id} name="override" type="number" inputMode="numeric" min={0} max={100} className="input" style={{ width: 120 }} value={ovValue} onChange={(e) => setOvValue(e.target.value)} />}</Field>
              <div style={{ flex: '1 1 260px' }}><Field label="Reason (required, saved to the change log)">{({ id }) => <input id={id} name="override-reason" className="input" autoComplete="off" value={ovReason} onChange={(e) => setOvReason(e.target.value)} placeholder="e.g. Missed two days for a medical appointment…" />}</Field></div>
              <Button variant="dark" type="submit" disabled={ovValue === '' || !ovReason.trim()} busy={busy}>Override typing grade</Button>
              {grade.override && <Button onClick={() => void run(() => api.clearOverride(student.id), 'Override removed.')}>Remove override</Button>}
            </form>
            <p className="hint" style={{ marginTop: 8 }}>The student sees this number as soon as it changes. There is no posting step.</p>
          </Card>

          <Card title="Growth since Day 1" subtitle="Best speed and average accuracy per program day.">
            <div className="cols" style={{ gap: 20 }}>
              <div style={{ flex: '1 1 300px', minWidth: 0 }}><b style={{ fontSize: 14.5 }}>Speed (WPM)</b>
                <LineChart variant="solid" label="Words per minute by program day" points={points.map((p) => ({ x: p.day, y: p.wpm! }))} xMax={10} yMin={0} yMax={Math.max(45, target.wpm + 10)} yTicks={[0, 10, 20, 30, 40]} target={target.wpm} /></div>
              <div style={{ flex: '1 1 300px', minWidth: 0 }}><b style={{ fontSize: 14.5 }}>Accuracy</b>
                <LineChart variant="dashed" unit="%" label="Accuracy by program day" points={points.map((p) => ({ x: p.day, y: p.accuracy! }))} xMax={10} yMin={80} yMax={100} yTicks={[80, 85, 90, 95, 100]} target={target.accuracy} /></div>
            </div>
          </Card>

          <Card title="Recent runs">
            {recent.length === 0 ? <p className="empty">No runs yet.</p> : (
              <div className="table"><div className="table-in" style={{ minWidth: 560 }}>
                <div className="tr head cols-runs"><div>When</div><div>Activity</div><div>WPM</div><div>Accuracy</div><div>Errors left</div><div>Result</div></div>
                {recent.map((a) => (
                  <div className="tr cols-runs" key={a.id}>
                    <div className="mono muted" style={{ fontSize: 12 }}>{fmtDate(a.createdAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                    <div>{a.kind === 'sprint' ? 'Warm-up sprint' : `${getDrill(a.drillId ?? '')?.title ?? a.drillId}, passage ${a.passage + 1}`}</div>
                    <div><b>{a.wpm}</b></div><div><b>{a.accuracy}%</b></div><div>{a.errorsLeft}</div>
                    <div>{a.clean ? <Tag tone="good">Clean</Tag> : a.completed ? <Tag tone="warn">Fixed</Tag> : <Tag tone="bad">Errors left</Tag>}</div>
                  </div>
                ))}
              </div></div>
            )}
          </Card>
        </div>

        <aside className="col-side stack">
          <Card title="Private notes" subtitle="Only instructors can see these.">
            <div className="stack" style={{ gap: 10 }}>
              {(notes.data ?? []).length === 0 && <p className="empty">No notes yet.</p>}
              {(notes.data ?? []).map((n) => <div key={n.id} style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}><div className="mono muted" style={{ fontSize: 11.5 }}>{fmtDate(n.at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div><div style={{ fontSize: 14 }}>{n.text}</div></div>)}
              <form onSubmit={(e) => { e.preventDefault(); void run(async () => { await api.addNote(student.id, noteText); setNoteText(''); }, 'Note added.'); }} className="stack" style={{ gap: 8 }}>
                <label className="visually-hidden" htmlFor="note">Add a note</label>
                <textarea id="note" name="note" className="textarea" rows={2} autoComplete="off" placeholder="Add a note…" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
                <Button type="submit" disabled={!noteText.trim()} busy={busy}>Add note</Button>
              </form>
            </div>
          </Card>

          <Card title="Details">
            <div className="stack">
              <Field label="Track">{({ id }) => <select id={id} name="track" className="select" value={student.track} onChange={(e) => void run(() => api.updateStudent(student.id, { track: e.target.value as 'ma' | 'rx' }), 'Track changed.')}><option value="ma">Medical Assistant</option><option value="rx">Pharmacy Tech</option></select>}</Field>
              <Field label="Class">{({ id }) => <select id={id} name="class" className="select" value={student.classId ?? ''} onChange={(e) => void run(() => api.updateStudent(student.id, { classId: e.target.value }), 'Moved to another class.')}>{classes.filter((c) => c.status === 'active' || c.id === student.classId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</Field>
              <Field label="Start date" hint="Day 1 is the first school day on or after this date.">{({ id }) => <input id={id} name="start" type="date" className="input" defaultValue={student.enrollment?.startDate} onBlur={(e) => { if (e.target.value && e.target.value !== student.enrollment?.startDate) void run(() => api.updateStudent(student.id, { startDate: e.target.value }), 'Start date changed.'); }} />}</Field>
              <Field label="Blackboard username" hint="Optional. Lines this student up in the Blackboard export.">{({ id }) => (
                <div className="row" style={{ flexWrap: 'nowrap' }}><input id={id} name="external-id" className="input" autoComplete="off" spellCheck={false} value={ext ?? student.externalId ?? ''} onChange={(e) => setExt(e.target.value)} />
                  <Button onClick={() => void run(() => api.updateStudent(student.id, { externalId: (ext ?? '').trim() || undefined }), 'Blackboard username saved.')} disabled={ext === null} busy={busy}>Save</Button></div>
              )}</Field>
            </div>
          </Card>

          <Card title="Change log">
            {log.length === 0 ? <p className="empty">No changes recorded.</p> : <div className="stack" style={{ gap: 8, fontSize: 13 }}>{log.map((a) => <div key={a.id} className="row" style={{ flexWrap: 'nowrap', gap: 10 }}><span className="mono muted" style={{ flex: '0 0 78px', fontSize: 11.5 }}>{fmtDate(a.at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span><span>{a.detail}</span></div>)}</div>}
          </Card>
        </aside>
      </div>
      <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => nav(-1)}>← Back</button>
    </>
  );
}
