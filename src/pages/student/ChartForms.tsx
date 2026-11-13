import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, ErrorNote, Tag, mmss } from '../../components/ui';
import { useStudent } from '../../components/Layouts';
import { useApi } from '../../data/context';
import type { NewAttempt } from '../../data/api';
import { newSeed, parseSeed } from '../../content';
import { FORM_DRILL_IDS, makeFormTask } from '../../content/generate/forms';
import { formAttempt } from '../../forms/attempt';
import { entryKeyAction, gradeForm, summarizeFormRun, type FieldResult, type FormRunResult } from '../../forms/grade';
import type { FormTask } from '../../forms/types';
import { windowTitle } from '../../lib/ehrLabels';
import { todayISO } from '../../lib/dates';
import '../../forms/forms.css';

/** Chart entry forms: copy a paper document into an EHR-style form, Tab between boxes, press Check. */
export function ChartForms() {
  const { me } = useStudent();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const seed = parseSeed(params.get('seed'));
  const chartDate = useMemo(() => todayISO(), []);
  const task = useMemo(() => (seed == null ? null : makeFormTask(me.track, seed, chartDate)), [me.track, seed, chartDate]);
  if (!task) return <Navigate replace to={`/forms?seed=${newSeed()}`} />;
  return <FormRunner key={`${task.drillId}-${task.seed}`} task={task} onNew={() => nav(`/forms?seed=${newSeed()}`)} />;
}

function summaryMessage(r: FormRunResult): { title: string; text: string; warn: boolean } {
  if (!r.completed) return { warn: true, title: 'Not ready to file', text: `${r.errorsLeft} field${r.errorsLeft === 1 ? '' : 's'} still wrong. On the job a record with errors gets fixed before it is saved. Try this form again, accuracy first.` };
  if (r.clean) return { warn: false, title: 'Filed clean', text: 'Every field right, and almost all of it right on the first check.' };
  return { warn: false, title: 'Filed after corrections', text: `Every field is right now, but the first check was ${r.accuracy}% accurate. Slow down and compare each box to the paper before you Check.` };
}

function FormRunner({ task, onNew }: { task: FormTask; onNew: () => void }) {
  const api = useApi();
  const { me, reload } = useStudent();
  const rx = task.track === 'rx';
  const [values, setValues] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, FieldResult>>({});
  const [checks, setChecks] = useState(0);
  const [summary, setSummary] = useState<string | null>(null);
  const [final, setFinal] = useState<FormRunResult | null>(null);
  const [pasteMsg, setPasteMsg] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<NewAttempt | null>(null);
  const [round, setRound] = useState(0);
  const startAt = useRef<number | null>(null);
  const firstValues = useRef<Record<string, string> | null>(null);

  const save = useCallback(async (a: NewAttempt) => {
    setSaving(true); setSaveError(null);
    try { await api.saveAttempt(a); setPending(null); reload(); }
    catch { setPending(a); setSaveError('We couldn’t save this run. Check your connection, then try saving again.'); }
    setSaving(false);
  }, [api, reload]);

  const finish = (vals: Record<string, string>) => {
    const seconds = startAt.current == null ? 0 : (performance.now() - startAt.current) / 1000;
    const r = summarizeFormRun(task.fields, firstValues.current ?? vals, vals, seconds);
    setFinal(r);
    void save(formAttempt(task, r));
  };

  const check = () => {
    const g = gradeForm(task.fields, values);
    firstValues.current ??= { ...values };
    setChecks((n) => n + 1);
    setResults(Object.fromEntries(g.results.map((r) => [r.id, r])));
    setSummary(g.allCorrect ? `All ${g.total} fields are correct.` : `${g.correctCount} of ${g.total} fields correct. Fix the red boxes, then Check again.`);
    if (g.allCorrect) finish(values);
  };

  const restart = () => {
    startAt.current = null; firstValues.current = null;
    setValues({}); setResults({}); setChecks(0); setSummary(null); setFinal(null); setSaveError(null); setPending(null); setPasteMsg('');
    setRound((n) => n + 1);
  };

  const onChange = (id: string, v: string) => {
    if (final) return;
    startAt.current ??= performance.now();
    setValues((cur) => ({ ...cur, [id]: v }));
    // An edited box no longer shows the old verdict.
    setResults((cur) => { if (!cur[id]) return cur; const { [id]: _gone, ...rest } = cur; return rest; });
  };

  const msg = final ? summaryMessage(final) : null;
  const filled = task.fields.filter((f) => (values[f.id] ?? '').trim() !== '').length;
  const wrongNow = Object.values(results).some((r) => !r.correct);

  return (
    <>
      <div className="row row-between">
        <div className="row"><Link to="/today" className="btn btn-secondary btn-sm">← Today</Link><h1 style={{ fontSize: 22, fontWeight: 700 }}>{rx ? 'Prescription entry' : 'Chart entry form'}</h1></div>
        <span className="muted" style={{ fontSize: 14 }}>New every time</span>
      </div>

      <div className="scenario"><div dangerouslySetInnerHTML={{ __html: task.ctx }} /></div>

      <div className="forms-grid">
        <section className="paper" aria-label={task.source.title}>
          <h2>{task.source.title}</h2>
          <p className="paper-sub">{task.source.subtitle}</p>
          <dl>
            {task.source.rows.map((r) => (
              <div className="paper-row" key={r.label}><dt>{r.label}</dt><dd translate="no">{r.value}</dd></div>
            ))}
          </dl>
        </section>

        <div className="note-window">
          <div className="note-title">
            <b>{windowTitle('drill', FORM_DRILL_IDS[task.track])}</b>
            <Tag tone={!final ? 'neutral' : final.completed ? 'good' : 'bad'}>{!final ? (rx ? 'Entry in progress' : 'Unsigned draft') : final.completed ? (rx ? 'Ready for pharmacist check' : 'Signed') : (rx ? 'Not ready: errors remain' : 'Not signed: errors remain')}</Tag>
            <span className="note-meta">Author: <span translate="no">{me.firstName} {me.lastName}</span> · {filled} of {task.fields.length} filled</span>
          </div>
          {/* Not a <form>: nothing here can be submitted, so Enter has nothing to do. */}
          <div
            className="note-body"
            role="group"
            aria-label="Entry form"
            onKeyDown={(e) => { if (entryKeyAction(e.key) === 'block') e.preventDefault(); }}
          >
            <div className="entry" key={round}>
              {task.fields.map((f) => {
                const r = results[f.id];
                return (
                  <div key={f.id} className={`entry-field ${r ? (r.correct ? 'ok' : 'no') : ''} ${f.kind === 'directions' || f.id === 'complaint' || f.id === 'medication' || f.id === 'allergies' ? 'wide' : ''}`}>
                    <label htmlFor={`f-${f.id}`}>{f.label}</label>
                    <input
                      id={`f-${f.id}`}
                      name={`chart-${f.id}`}
                      className="entry-input"
                      type="text"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      readOnly={!!final}
                      value={values[f.id] ?? ''}
                      aria-invalid={r ? !r.correct : undefined}
                      aria-describedby={`h-${f.id}`}
                      onChange={(e) => onChange(f.id, e.target.value)}
                      onPaste={(e) => { e.preventDefault(); setPasteMsg('Pasting is off. Type it out!'); }}
                      onDrop={(e) => e.preventDefault()}
                    />
                    <span className="entry-hint" id={`h-${f.id}`}>{r ? undefined : f.hint}</span>
                    {r && <span className="entry-msg" id={`h-${f.id}`}>{r.correct ? 'Correct' : r.message}</span>}
                  </div>
                );
              })}
            </div>
            <div className="row">
              <Button variant="primary" type="button" onClick={check} disabled={!!final || filled === 0}>Check</Button>
              {!final && checks > 0 && wrongNow && <Button type="button" onClick={() => finish(values)}>Finish with errors</Button>}
              <Button type="button" onClick={restart}>Start over</Button>
              <span className="tone-bad" style={{ fontWeight: 600, fontSize: 14 }} role="status">{pasteMsg}</span>
              <span className="hint" style={{ marginLeft: 'auto' }}>Tab = next box · Enter does nothing · Pasting is off</span>
            </div>
            <div role="status" aria-live="polite" style={{ fontWeight: 600 }}>{summary}</div>
          </div>
          <div className="note-foot"><span>{rx ? 'Enter it exactly as shown. An entry with errors cannot go to the pharmacist.' : 'Copy the sheet exactly. A chart with errors cannot be signed.'}</span><span className="spacer" /><span>Training record, fictional patient</span></div>
        </div>
      </div>

      {final && msg && (
        <Card className={`result ${msg.warn ? 'warn' : ''}`}>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>{msg.title}</h2>
          <p className="muted">{msg.text}{final.clean ? ' This run counts toward your personal best.' : ''}</p>
          <div className="result-stats num">
            <div><span>Fields right</span><b>{final.fieldsCorrect}/{final.fieldsTotal}</b></div><div><span>Accuracy</span><b>{final.accuracy}%</b></div>
            <div><span>WPM</span><b>{final.wpm}</b></div><div><span>Time</span><b>{mmss(final.seconds)}</b></div>
          </div>
          {saveError && <div style={{ marginBottom: 12 }}><ErrorNote>{saveError}</ErrorNote></div>}
          <div className="row">
            <Button variant="primary" onClick={onNew}>New form →</Button>
            <Button onClick={restart}>Try this one again</Button>
            {pending && <Button onClick={() => void save(pending)} busy={saving}>Save this run</Button>}
            <Link to="/today" className="btn btn-secondary">Back to Today</Link>
            {saving && <span className="hint" role="status">Saving…</span>}
            {!saving && !saveError && <span className="hint" role="status">Saved</span>}
          </div>
        </Card>
      )}

      <div className="why">
        <b>Why it matters:</b> {rx
          ? 'Order entry is where a prescription becomes a label. A swapped digit, a lowercase Tall Man letter or a “QD” in the directions can reach a patient. Check each box against the paper before you press Check.'
          : 'Intake data goes straight into the chart. A transposed digit in a blood pressure or a swapped first and last name creates a record someone else has to untangle. Compare each box to the sheet before you press Check.'}
      </div>
    </>
  );
}
