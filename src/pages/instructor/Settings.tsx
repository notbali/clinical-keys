import { useState } from 'react';
import { Button, Card, Empty, Field, fmtDate } from '../../components/ui';
import { useApi, useAsync, useSession } from '../../data/context';
import { DEFAULT_SETTINGS, type Settings as SettingsType } from '../../data/types';

export function Settings() {
  const api = useApi();
  const { settings, refresh } = useSession();
  const [draft, setDraft] = useState<SettingsType>(settings);
  const [day, setDay] = useState('');
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const audit = useAsync(() => api.listAudit(), [api]);

  const wsum = draft.weights.accuracy + draft.weights.speed + draft.weights.completion;
  const num = (v: string) => (v === '' ? 0 : Number(v));
  const save = async () => {
    if (wsum !== 100) { setMsg({ tone: 'bad', text: `The three weights add up to ${wsum}. They need to add up to 100.` }); return; }
    setBusy(true);
    try { await api.saveSettings(draft); await refresh(); audit.reload(); setMsg({ tone: 'good', text: 'Settings saved. Every student’s grade now uses them.' }); }
    catch (e) { setMsg({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not save.' }); }
    setBusy(false);
  };
  const reset = (api as { reset?: () => void }).reset;

  return (
    <>
      <div><h1 className="page-title">Program and settings</h1><p className="page-sub">Targets, grade weights and school closings apply to the whole program.</p></div>
      {msg && <div className={`note note-${msg.tone}`} role="status">{msg.text}</div>}
      <div className="cols">
        <div className="col-main stack" style={{ flexBasis: 520 }}>
          <Card title="Typing targets" subtitle="Students are scored against these.">
            {(['ma', 'rx'] as const).map((t) => (
              <div className="row" key={t} style={{ alignItems: 'flex-end', marginBottom: 12 }}>
                <b style={{ flex: '0 0 150px' }}>{t === 'ma' ? 'Medical Assistant' : 'Pharmacy Tech'}</b>
                <Field label="Speed (WPM)">{({ id }) => <input id={id} name={`${t}-wpm`} type="number" inputMode="numeric" className="input" style={{ width: 110 }} value={draft.targets[t].wpm} onChange={(e) => setDraft({ ...draft, targets: { ...draft.targets, [t]: { ...draft.targets[t], wpm: num(e.target.value) } } })} />}</Field>
                <Field label="Accuracy (%)">{({ id }) => <input id={id} name={`${t}-acc`} type="number" inputMode="numeric" className="input" style={{ width: 110 }} value={draft.targets[t].accuracy} onChange={(e) => setDraft({ ...draft, targets: { ...draft.targets, [t]: { ...draft.targets[t], accuracy: num(e.target.value) } } })} />}</Field>
              </div>
            ))}
          </Card>
          <Card title="Typing grade weights" subtitle={`They must add up to 100. Now: ${wsum}.`}>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              {(['accuracy', 'speed', 'completion'] as const).map((k) => (
                <Field key={k} label={k === 'completion' ? 'Activities completed' : k[0].toUpperCase() + k.slice(1)}>{({ id }) => <input id={id} name={`w-${k}`} type="number" inputMode="numeric" className="input" style={{ width: 130 }} value={draft.weights[k]} onChange={(e) => setDraft({ ...draft, weights: { ...draft.weights, [k]: num(e.target.value) } })} />}</Field>
              ))}
            </div>
          </Card>
          <Card title="School closings" subtitle="Weekends are skipped automatically. Add holidays so they don’t count as a program day.">
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <Field label="Closed date">{({ id }) => <input id={id} name="closed" type="date" className="input" value={day} onChange={(e) => setDay(e.target.value)} />}</Field>
              <Button onClick={() => { if (day && !draft.closedDays.includes(day)) setDraft({ ...draft, closedDays: [...draft.closedDays, day].sort() }); setDay(''); }} disabled={!day}>Add</Button>
            </div>
            <div className="row" style={{ marginTop: 12, gap: 8 }}>
              {draft.closedDays.length === 0 && <Empty>No closings added.</Empty>}
              {draft.closedDays.map((d) => <span className="chip" key={d} style={{ padding: '4px 4px 4px 10px' }}>{fmtDate(d, { weekday: 'short', month: 'short', day: 'numeric' })}<button className="btn btn-ghost btn-sm" aria-label={`Remove ${d}`} onClick={() => setDraft({ ...draft, closedDays: draft.closedDays.filter((x) => x !== d) })}>✕</button></span>)}
            </div>
          </Card>
          <Card title="Blackboard link" subtitle="Students see an Open Blackboard button that goes here.">
            <Field label="Blackboard course URL">{({ id }) => <input id={id} name="bb" type="url" inputMode="url" spellCheck={false} autoComplete="off" className="input" value={draft.blackboardUrl ?? ''} onChange={(e) => setDraft({ ...draft, blackboardUrl: e.target.value.trim() || undefined })} placeholder="https://…" />}</Field>
          </Card>
          <div className="row"><Button variant="dark" onClick={() => void save()} busy={busy}>Save settings</Button><Button onClick={() => setDraft(DEFAULT_SETTINGS)}>Reset to defaults</Button></div>
        </div>
        <aside className="col-side stack">
          <Card title="Change log" subtitle="Recent changes across the program.">
            {(audit.data ?? []).length === 0 ? <Empty>Nothing yet.</Empty> : (
              <div className="stack" style={{ gap: 8, fontSize: 13 }}>
                {(audit.data ?? []).slice(0, 15).map((a) => <div key={a.id}><div className="mono muted" style={{ fontSize: 11.5 }}>{fmtDate(a.at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {a.action}</div><div><b>{a.subject}</b>: {a.detail}</div></div>)}
              </div>
            )}
          </Card>
          {api.mode === 'demo' && reset && (
            <Card title="Demo data" subtitle="Demo mode keeps everything in this browser.">
              <Button variant="danger" onClick={() => { if (window.confirm('Reset all demo data to the starting roster?')) { reset(); window.location.assign('/'); } }}>Reset demo data</Button>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
