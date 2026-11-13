import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, ErrorNote, Tag, mmss } from '../../components/ui';
import { useStudent } from '../../components/Layouts';
import { useApi } from '../../data/context';
import { getDrill, GLOSSARY, SPRINT } from '../../content';
import { programFor, resolveActivity } from '../../lib/program';
import { TypingPlayer } from '../../typing/TypingPlayer';
import { ErrorHuntPlayer } from '../../typing/ErrorHuntPlayer';
import { PatientBanner } from '../../components/PatientBanner';
import { windowTitle } from '../../lib/ehrLabels';
import type { RunResult } from '../../typing/engine';
import type { NewAttempt } from '../../data/api';

function huntMessage(r: RunResult): { title: string; text: string; warn: boolean } {
  if (r.revealed) return { warn: false, title: 'Answers shown', text: 'Good practice. Read why each one was wrong, then try the next note without the answers.' };
  if (r.errorsLeft > 0) return { warn: true, title: 'Not clear yet', text: `${r.errorsLeft} problem${r.errorsLeft > 1 ? 's' : ''} left in the note: errors you missed, or new ones you added. The review below shows each one. A note with errors cannot go out, so try it again.` };
  return { warn: false, title: 'Every error found', text: `A clean note with no new mistakes.${r.peeks ? ` (${r.peeks} hint${r.peeks > 1 ? 's' : ''} used.)` : ''}` };
}

function messageFor(r: RunResult, sprint: boolean, hidden: boolean): { title: string; text: string; warn: boolean } {
  if (sprint && r.errorsLeft > 0) return { warn: true, title: 'Time! Errors left behind', text: `${r.errorsLeft} wrong character${r.errorsLeft > 1 ? 's' : ''} still in what you typed. On the job those get fixed before anything goes out. Next sprint, fix them as you go and keep your accuracy up.` };
  if (sprint) return r.accuracy >= 98 ? { warn: false, title: 'Warmed up and accurate', text: 'Fast and clean. That is the combination that counts.' }
    : r.accuracy >= 95 ? { warn: false, title: 'Clean sprint', text: 'Nothing left behind. Push for 98% accuracy: fewer backspaces makes you faster and safer.' }
    : { warn: false, title: 'Fixed, but bumpy', text: `You caught every mistake, but accuracy was ${r.accuracy}%. Slow down a little. Steady beats fast-and-fix.` };
  if (r.errorsLeft > 0) return { warn: true, title: 'Not ready to send', text: `${r.errorsLeft} error${r.errorsLeft > 1 ? 's' : ''} left in the text. In a chart or on a label, every error has to be fixed before it goes out. Try again: accuracy first, speed second.` };
  if (r.revealed) return { warn: false, title: 'Done, with the answer showing', text: 'Good practice. Try the next one without the answer to lock in the abbreviations.' };
  if (r.accuracy >= 98) return { warn: false, title: hidden ? 'Label-ready' : 'Chart-ready', text: `Clean and accurate.${r.peeks ? ` (Peeked ${r.peeks}x.)` : ''}` };
  if (r.accuracy >= 95) return { warn: false, title: 'Clean copy', text: 'No errors left behind. Push for 98% accuracy. Fewer backspaces makes you faster and safer.' };
  return { warn: false, title: 'Fixed, but bumpy', text: `You caught every mistake, which is good. Accuracy was ${r.accuracy}%, so slow down a little. Steady beats fast-and-fix.` };
}

export function Practice() {
  const api = useApi();
  const nav = useNavigate();
  const { me, attempts, reload, ehr } = useStudent();
  const [params] = useSearchParams();
  const kind = params.get('kind') === 'sprint' ? 'sprint' : 'drill';
  const drill = kind === 'drill' ? getDrill(params.get('drill') ?? '') : undefined;
  const passage = Number(params.get('passage') ?? 0);
  const day = params.get('day') ? Number(params.get('day')) : undefined;
  const act = params.get('act') ? Number(params.get('act')) : undefined;

  const [round, setRound] = useState(0);
  const [result, setResult] = useState<RunResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<NewAttempt | null>(null);

  // Which passages belong to this program activity (for "Next passage").
  const list = useMemo(() => {
    if (!drill) return [0];
    if (day != null && act != null) {
      const a = programFor(me.track).find((d) => d.n === day)?.acts[act];
      const r = a ? resolveActivity(a) : null;
      if (r && r.kind === 'drill') return r.passages;
    }
    return drill.items.map((_, i) => i);
  }, [drill, day, act, me.track]);

  const sprintText = useMemo(() => SPRINT.build(me.track), [me.track, round]); // eslint-disable-line react-hooks/exhaustive-deps
  const target = kind === 'sprint' ? sprintText : drill?.items[passage]?.text ?? '';

  const save = useCallback(async (a: NewAttempt) => {
    setSaving(true); setSaveError(null);
    try { await api.saveAttempt(a); setPending(null); reload(); }
    catch { setPending(a); setSaveError('We couldn’t save this run. Check your connection, then try saving again.'); }
    setSaving(false);
  }, [api, reload]);

  const onFinish = useCallback((r: RunResult) => {
    setResult(r);
    void save({
      kind, track: me.track, drillId: drill?.id, passage: kind === 'sprint' ? 0 : passage, day, act,
      wpm: r.wpm, accuracy: r.accuracy, errorsLeft: r.errorsLeft, seconds: r.seconds, completed: r.completed, clean: r.clean, revealed: r.revealed,
    });
  }, [save, kind, me.track, drill?.id, passage, day, act]);

  if (kind === 'drill' && (!drill || !drill.items[passage])) return <ErrorNote>That drill wasn’t found. <Link to="/today">Back to Today</Link></ErrorNote>;

  const restart = () => { setResult(null); setSaveError(null); setPending(null); setRound((n) => n + 1); };
  const goNext = () => {
    if (kind === 'sprint') return restart();
    const done = new Set(attempts.filter((a) => a.completed && a.day === day && a.act === act).map((a) => a.passage));
    const after = list[(list.indexOf(passage) + 1) % list.length];
    const next = list.find((p) => !done.has(p) && p !== passage) ?? after;
    nav(`/practice?kind=drill&drill=${drill!.id}&passage=${next}${day != null ? `&day=${day}&act=${act}` : ''}`);
    setResult(null); setSaveError(null); setPending(null); setRound((n) => n + 1);
  };

  const title = kind === 'sprint' ? 'Warm-up Sprint' : drill!.title;
  const rx = me.track === 'rx';
  const hunt = drill?.mode === 'hunt';
  const msg = result ? (hunt ? huntMessage(result) : messageFor(result, kind === 'sprint', drill?.mode === 'hidden')) : null;
  const pos = list.indexOf(passage) + 1;

  const scenario = (
    <div className="scenario">
      <div dangerouslySetInnerHTML={{ __html: kind === 'sprint' ? SPRINT.intro : drill!.items[passage].ctx }} />
      <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>
        {kind === 'sprint' ? SPRINT.note : hunt ? 'Proofread the note. Edit the text to fix every error, then press Check my note. Stuck? Use a hint.' : drill!.mode === 'hidden' ? 'Type the label directions in full. Letters appear as you get them right, and red means wrong. Use the cheat sheet below if you’re stuck.' : 'Type it exactly as shown. Capitals, numbers, spacing and punctuation all count.'}
      </p>
    </div>
  );
  const playerKey = `${kind}-${drill?.id}-${passage}-${round}`;
  const current = drill?.items[passage];
  const player = hunt && current?.flawed && current.errors ? (
    <ErrorHuntPlayer key={playerKey} flawed={current.flawed} fixed={current.text} errors={current.errors} onFinish={onFinish} onRestart={restart} />
  ) : (
    <TypingPlayer key={playerKey} target={target} mode={drill?.mode === 'hidden' ? 'hidden' : 'copy'} limit={kind === 'sprint' ? SPRINT.limit : undefined} onFinish={onFinish} onRestart={restart} />
  );

  return (
    <>
      <div className="row row-between">
        <div className="row"><Link to="/today" className="btn btn-secondary btn-sm">← Today</Link><h1 style={{ fontSize: 22, fontWeight: 700 }}>{title}</h1></div>
        <span className="muted" style={{ fontSize: 14 }}>{kind === 'sprint' ? `${SPRINT.limit}-second sprint` : `Passage ${pos} of ${list.length}`}</span>
      </div>

      {ehr && <PatientBanner patient={drill?.items[passage]?.patient} task={title} />}

      {ehr ? (
        <div className="note-window">
          <div className="note-title">
            <b>{windowTitle(kind, drill?.id)}</b>
            {kind === 'sprint'
              ? <Tag tone={result ? 'good' : 'info'}>{result ? 'Finished' : 'Timed'}</Tag>
              : <Tag tone={!result ? 'neutral' : result.completed ? 'good' : 'bad'}>{!result ? (rx ? 'Entry in progress' : 'Unsigned draft') : result.completed ? (rx ? 'Ready for pharmacist check' : 'Signed') : (rx ? 'Not ready: errors remain' : 'Not signed: errors remain')}</Tag>}
            <span className="note-meta">Author: <span translate="no">{me.firstName} {me.lastName}</span> · {kind === 'sprint' ? `${SPRINT.limit}-second sprint` : `Passage ${pos} of ${list.length}`}</span>
          </div>
          <div className="note-body">{scenario}{player}</div>
          <div className="note-foot"><span>{kind === 'sprint' ? 'The clock starts on your first keystroke.' : hunt ? (rx ? 'Proofread before it goes to the pharmacist. An entry with errors cannot go out.' : 'Proofread before it is signed. A note with errors cannot be signed.') : rx ? 'Enter it exactly as shown. An entry with errors cannot go to the pharmacist.' : 'Type the note exactly as shown. A note with errors cannot be signed.'}</span><span className="spacer" /><span>Training record, fictional patient</span></div>
        </div>
      ) : (<>{scenario}{player}</>)}

      {result && msg && (
        <Card className={`result ${msg.warn ? 'warn' : ''}`}>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>{msg.title}</h2>
          <p className="muted">{msg.text}{result.clean ? ' This run counts toward your personal best.' : ''}</p>
          <div className="result-stats num">
            <div><span>{hunt ? 'Hints' : 'WPM'}</span><b>{hunt ? result.peeks : result.wpm}</b></div><div><span>Accuracy</span><b>{result.accuracy}%</b></div>
            <div><span>Time</span><b>{mmss(result.seconds)}</b></div><div><span>Errors left</span><b>{result.errorsLeft}</b></div>
          </div>
          {saveError && <div style={{ marginBottom: 12 }}><ErrorNote>{saveError}</ErrorNote></div>}
          <div className="row">
            <Button variant="primary" onClick={goNext}>{kind === 'sprint' ? 'Another sprint →' : 'Next passage →'}</Button>
            {kind === 'drill' && <Button onClick={restart}>Try again</Button>}
            {pending && <Button onClick={() => void save(pending)} busy={saving}>Save this run</Button>}
            <Link to="/today" className="btn btn-secondary">Back to Today</Link>
            {saving && <span className="hint" role="status">Saving…</span>}
            {!saving && !saveError && <span className="hint" role="status">Saved</span>}
          </div>
        </Card>
      )}

      {drill && <div className="why" dangerouslySetInnerHTML={{ __html: drill.why }} />}
      {kind === 'sprint' && <div className="why" dangerouslySetInnerHTML={{ __html: SPRINT.why }} />}
      {drill?.glossary && (
        <Card title="Sig code cheat sheet">
          <div className="glossary">{GLOSSARY.map(([k, v]) => <div key={k}><b>{k}</b>{v}</div>)}</div>
          <p className="hint" style={{ marginTop: 10 }}>OD, OS, OU, AD, AS and AU are on ISMP’s list of error-prone abbreviations, and many pharmacies require them spelled out. You still need to be able to read them.</p>
        </Card>
      )}
    </>
  );
}
