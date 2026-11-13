import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, ErrorNote, Field, Tag } from '../../components/ui';
import { useApi } from '../../data/context';
import { useRoster } from '../../data/useRoster';
import { parseRoster } from '../../lib/roster';
import { defaultPlan, isDefaultPlan, programLength } from '../../lib/plan';
import { PlanEditor } from './PlanEditor';
import { dateOfProgramDay, todayISO } from '../../lib/dates';
import { download, gradesCsv } from '../../lib/exports';
import type { ClassGroup } from '../../data/types';
import type { StudentMetrics } from '../../lib/metrics';

type Pending = { kind: 'archive' | 'delete'; cls: ClassGroup } | null;

export function Classes() {
  const api = useApi();
  const { metrics, classes, plans, loading, error, reload, settings } = useRoster();
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const today = todayISO();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [paste, setPaste] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [confirmed, setConfirmed] = useState<Set<number>>(new Set());
  const [pending, setPending] = useState<Pending>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  const byClass = (id: string): StudentMetrics[] => metrics.filter((m) => m.student.classId === id);
  const active = classes.filter((c) => c.status === 'active');
  const archived = classes.filter((c) => c.status === 'archived');
  const target = selected && classes.some((c) => c.id === selected) ? selected : active[0]?.id ?? null;
  const targetName = classes.find((c) => c.id === target)?.name;

  const rows = useMemo(
    () => parseRoster(paste, metrics.map((m) => m.student), startDate, today),
    [paste, metrics, startDate, today],
  );
  const ready = rows.filter((r) => r.status === 'ready' || (r.status === 'confirm' && confirmed.has(r.line)));
  const blocked = rows.length - ready.length;

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ tone: 'good', text: ok }); reload(); }
    catch (e) { setMsg({ tone: 'bad', text: e instanceof Error ? e.message : 'Something went wrong.' }); }
    setBusy(false);
  };

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    void run(async () => { const c = await api.createClass(name); setSelected(c.id); setName(''); }, `Created “${name.trim()}”.`);
  };
  const enroll = () => {
    if (!target) return;
    void run(async () => {
      await api.enroll(target, ready.map((r) => ({ firstName: r.firstName, lastName: r.lastName, track: r.track!, startDate: r.startDate })));
      setPaste(''); setConfirmed(new Set());
    }, `Enrolled ${ready.length} student${ready.length === 1 ? '' : 's'} in ${targetName}.`);
  };
  const exportClass = (c: ClassGroup) => download(`${c.name.replace(/\W+/g, '-').toLowerCase()}-${today}.csv`, gradesCsv(byClass(c.id)));
  const confirmPending = () => {
    if (!pending) return;
    const { kind, cls } = pending;
    void run(async () => {
      if (kind === 'archive') { exportClass(cls); await api.archiveClass(cls.id); } else await api.deleteClass(cls.id);
      setPending(null); setTyped('');
    }, kind === 'archive' ? `Exported and archived “${cls.name}”.` : `Permanently deleted “${cls.name}”.`);
  };

  const status = (c: ClassGroup): { tone: 'good' | 'info' | 'warn' | 'neutral'; text: string } => {
    const list = byClass(c.id);
    if (c.status === 'archived') return { tone: 'neutral', text: 'Archived' };
    if (list.length && list.every((m) => m.position > m.programLength)) return { tone: 'warn', text: 'Ready to archive' };
    if (list.some((m) => m.position >= m.programLength)) return { tone: 'info', text: 'Finishing' };
    return { tone: 'good', text: 'Active' };
  };

  const card = (c: ClassGroup) => {
    const list = byClass(c.id);
    const st = status(c);
    const plan = plans[c.id] ?? defaultPlan();
    const custom = !isDefaultPlan(plan);
    const length = programLength(plan);
    const last = list.length ? list.map((m) => dateOfProgramDay(m.student.enrollment!.startDate, length, new Set(settings.closedDays))).sort().pop() : null;
    return (
      <Card key={c.id} className="" >
        <div className="row row-between"><div className="row"><h2 className="card-title">{c.name}</h2><Tag tone={st.tone}>{st.text}</Tag>{custom && <Tag tone="info">Custom days</Tag>}</div>
          {last && <span className="muted" style={{ fontSize: 13.5 }}>{custom ? `Last student finishes (${length} days) on` : 'Last student reaches Day 10 on'} {new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${last}T12:00:00`))}</span>}</div>
        <div className="row" style={{ gap: 6, margin: '12px 0' }}>
          {list.length === 0 && <span className="muted" style={{ fontSize: 14 }}>No students yet.</span>}
          {list.map((m) => (
            <Link key={m.student.id} to={`/students/${m.student.id}`} className="chip" style={{ textDecoration: 'none', color: 'inherit' }}>
              <span className="avatar" aria-hidden="true" style={m.student.track === 'rx' ? { background: 'var(--pt-soft)', color: 'var(--pt-ink)' } : undefined}>{m.student.firstName[0]}{m.student.lastName[0]}</span>
              <span translate="no">{m.student.firstName} {m.student.lastName}</span><span className="mono muted" style={{ fontSize: 11.5 }}>D{Math.min(Math.max(m.day, 1), 10)}</span>
            </Link>
          ))}
        </div>
        <div className="row">
          {c.status === 'active' && <Button className="btn-sm" onClick={() => setSelected(c.id)}>Add students</Button>}
          {c.status === 'active' && <Button className="btn-sm" aria-expanded={adjusting === c.id} onClick={() => setAdjusting(adjusting === c.id ? null : c.id)}>Adjust days</Button>}
          <Button className="btn-sm" onClick={() => exportClass(c)} disabled={!list.length}>Export</Button>
          {c.status === 'active' && <Button className="btn-sm" variant={st.tone === 'warn' ? 'danger' : 'secondary'} onClick={() => { setPending({ kind: 'archive', cls: c }); setTyped(''); }}>{st.tone === 'warn' ? 'Export and archive' : 'Archive'}</Button>}
          {c.status === 'archived' && <Button className="btn-sm" onClick={() => void run(() => api.restoreClass(c.id), `Restored “${c.name}”.`)}>Restore</Button>}
          {c.status === 'archived' && <Button className="btn-sm" variant="danger" onClick={() => { setPending({ kind: 'delete', cls: c }); setTyped(''); }}>Delete permanently</Button>}
        </div>
        {adjusting === c.id && c.status === 'active' && (
          <PlanEditor key={`${c.id}:${plan.days.join(',')}`} className={c.name} saved={plan} busy={busy} onClose={() => setAdjusting(null)}
            onSave={(next) => void run(async () => { await api.setClassPlan(c.id, next); setAdjusting(null); },
              isDefaultPlan(next) ? `Reset ${c.name} to Day 1 through Day 10.` : `Saved the day plan for ${c.name}.`)} />
        )}
      </Card>
    );
  };

  const word = pending?.kind === 'archive' ? 'ARCHIVE' : 'DELETE';

  return (
    <>
      <div className="row row-between" style={{ alignItems: 'flex-end' }}>
        <div><h1 className="page-title">Classes and enrollment</h1><p className="page-sub" style={{ maxWidth: 640 }}>A class is a group you enroll together, like everyone who started the week of Nov 9. Each student still follows their own Day 1 to Day 10 from their own start date.</p></div>
        <form onSubmit={create} className="row"><label className="visually-hidden" htmlFor="newclass">New class name</label>
          <input id="newclass" name="class-name" className="input search" autoComplete="off" placeholder="Class name, e.g. Nov 16 group…" value={name} onChange={(e) => setName(e.target.value)} />
          <Button variant="dark" type="submit" disabled={!name.trim()} busy={busy}>+ New class</Button></form>
      </div>
      {msg && <div className={`note note-${msg.tone}`} role="status">{msg.text}</div>}
      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="cols">
        <section className="col-main stack" style={{ flexBasis: 460 }}>
          {loading && <p className="empty">Loading…</p>}
          {active.map(card)}
          {!loading && active.length === 0 && <p className="empty">No active classes. Create one above.</p>}
          {archived.length > 0 && <><h2 className="card-title" style={{ marginTop: 8 }}>Archived</h2>{archived.map(card)}</>}
        </section>

        <aside className="col-side stack" style={{ flexBasis: 440 }}>
          <Card title={target ? `Add students to ${targetName}` : 'Add students'} subtitle="Paste one student per line: name, track, start date. The app builds each username as last name then first name.">
            {!target ? <p className="empty">Create a class first.</p> : (
              <div className="stack">
                <Field label="Class">{({ id }) => <select id={id} name="class" className="select" value={target} onChange={(e) => setSelected(e.target.value)}>{active.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</Field>
                <Field label="Default start date" hint="Used for lines that don’t include a date. Day 1 is the first school day on or after it.">
                  {({ id }) => <input id={id} name="start" type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />}
                </Field>
                <Field label="Pasted list" hint="Example: Noah Bennett, PT, Nov 13">
                  {({ id }) => <textarea id={id} name="roster-paste" className="textarea mono" style={{ fontSize: 13.5 }} rows={5} spellCheck={false} autoComplete="off" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'Noah Bennett, PT, Nov 13\nSofia Alvarez, MA…'} />}
                </Field>
                {rows.length > 0 && (
                  <div className="stack" style={{ gap: 8 }} aria-label="Preview">
                    {rows.map((r) => (
                      <div key={r.line} className={`preview-row ${r.status}`}>
                        <div className="row row-between"><span><b translate="no">{r.firstName} {r.lastName}</b>{r.username && <span className="mono"> → {r.username}</span>}</span><span className="muted" style={{ fontSize: 12.5 }}>{r.track ? (r.track === 'ma' ? 'MA' : 'PT') : 'No track'} · starts {r.startDate}</span></div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: r.status === 'ready' ? 'var(--good-ink)' : r.status === 'confirm' ? 'var(--warn-ink)' : 'var(--bad-ink)' }}>{r.message}</div>
                        {r.status === 'confirm' && <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}><input type="checkbox" name={`confirm-${r.line}`} checked={confirmed.has(r.line)} onChange={(e) => setConfirmed((s) => { const n = new Set(s); if (e.target.checked) n.add(r.line); else n.delete(r.line); return n; })} /> This is a different person</label>}
                      </div>
                    ))}
                  </div>
                )}
                <div className="row row-between"><span className="hint">{rows.length ? `${ready.length} ready, ${blocked} need a look.` : 'Nothing pasted yet.'}</span>
                  <Button variant="dark" onClick={enroll} disabled={!ready.length} busy={busy}>Enroll {ready.length || ''} {ready.length === 1 ? 'student' : 'students'}</Button></div>
              </div>
            )}
          </Card>

          {pending && (
            <div className="dialog" role="dialog" aria-labelledby="dlg-title">
              <h2 id="dlg-title" style={{ fontSize: 22, fontWeight: 700 }}>{pending.kind === 'archive' ? `Archive “${pending.cls.name}”?` : `Delete “${pending.cls.name}” permanently?`}</h2>
              <p className="muted" style={{ fontSize: 14.5 }}>{byClass(pending.cls.id).length} students are in this class.</p>
              <ol className="steps">
                {pending.kind === 'archive' ? (<>
                  <li><b>A grades export downloads first.</b> Keep it for your records and Blackboard.</li>
                  <li><b>The class moves to Archived.</b> Students can no longer sign in and leave your roster.</li>
                  <li><b>You can restore it</b> from the Archived list at any time.</li>
                </>) : (<>
                  <li><b>This cannot be undone.</b> The class, its students, their runs, notes and grade overrides are deleted.</li>
                  <li>Export the class first if you need a record.</li>
                </>)}
              </ol>
              <Field label={`Type ${word} to confirm`}>{({ id }) => <input id={id} name="confirm" className="input mono" autoComplete="off" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={`${word}…`} />}</Field>
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <Button onClick={() => { setPending(null); setTyped(''); }}>Cancel</Button>
                <Button variant="danger" onClick={confirmPending} disabled={typed !== word} busy={busy}>{pending.kind === 'archive' ? 'Export and archive' : 'Delete permanently'}</Button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
