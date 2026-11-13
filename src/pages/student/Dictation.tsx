import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Tag, mmss } from '../../components/ui';
import { useStudent } from '../../components/Layouts';
import { generatePassage, getGeneratedDrill, newSeed, parseSeed } from '../../content';
import { todayISO } from '../../lib/dates';
import {
  betterDictation, DICTATION_RATE_KEY, DICTATION_VOICE_KEY, dictationBestKey, dictationResult, dictationSources, isDictationBest,
  speechChunks, speechScript, speechSupported, type DictationResult,
} from '../../lib/dictation';
import { browserStore, readBest, writeBest } from '../../lib/localBest';

const SPEEDS: { value: number; label: string }[] = [
  { value: 0.7, label: 'Slow' }, { value: 0.85, label: 'A little slow' }, { value: 1, label: 'Normal' }, { value: 1.15, label: 'A little fast' }, { value: 1.3, label: 'Fast' },
];

const isString = (v: unknown): v is string => typeof v === 'string';
const isRate = (v: unknown): v is number => typeof v === 'number' && SPEEDS.some((s) => s.value === v);

/** Dictation is optional and silent until the student agrees to sound. It needs a browser that can read text aloud. */
export function Dictation() {
  const { me } = useStudent();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const sources = dictationSources(me.track);
  const typeId = sources.find((s) => s.id === params.get('type'))?.id ?? sources[0].id;
  const seed = parseSeed(params.get('seed'));
  const chartDate = useMemo(() => todayISO(), []);
  const [soundOk, setSoundOk] = useState(false);
  const supported = speechSupported(typeof window === 'undefined' ? undefined : window);
  const target = useMemo(() => (seed == null ? '' : generatePassage(getGeneratedDrill(typeId)!, seed, chartDate).text), [typeId, seed, chartDate]);

  if (seed == null) return <Navigate replace to={`/dictation?type=${typeId}&seed=${newSeed()}`} />;
  const go = (type: string, nextSeed: number) => nav(`/dictation?type=${type}&seed=${nextSeed}`);

  return (
    <>
      <div className="row row-between">
        <div className="row"><Link to="/drills" className="btn btn-secondary btn-sm">← All drills</Link><h1 style={{ fontSize: 22, fontWeight: 700 }}>Dictation</h1><Tag tone="warn">Optional · uses sound</Tag></div>
        <span className="muted" style={{ fontSize: 14 }}>New every time</span>
      </div>

      {!supported ? (
        <Card title="Dictation isn’t available in this browser">
          <p>This browser can’t read text aloud, so there is nothing to listen to. Try the newest Chrome or Edge, or use the silent drills instead. Nothing is lost: dictation is extra practice.</p>
          <div className="row" style={{ marginTop: 12 }}><Link to="/drills" className="btn btn-primary">Back to all drills</Link></div>
        </Card>
      ) : !soundOk ? (
        <HeadphoneGate onAgree={() => setSoundOk(true)} />
      ) : (
        <Session
          key={`${typeId}-${seed}`}
          studentId={me.id}
          target={target}
          sources={sources}
          typeId={typeId}
          track={me.track}
          onType={(t) => go(t, newSeed())}
          onNew={() => go(typeId, newSeed())}
        />
      )}
    </>
  );
}

function HeadphoneGate({ onAgree }: { onAgree: () => void }) {
  const [checked, setChecked] = useState(false);
  return (
    <Card title="Use headphones for this one">
      <div className="stack">
        <p>Dictation reads a note out loud and you type what you hear. Everyone else in the room is working too, so <b>put on headphones before you start</b>. No headphones? Skip this one: the other drills are silent.</p>
        <label className="row" style={{ gap: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} style={{ width: 20, height: 20 }} />
          <span>I have headphones on, or my teacher said sound is fine.</span>
        </label>
        <div className="row">
          <Button variant="primary" disabled={!checked} onClick={onAgree}>Start dictation</Button>
          <Link to="/drills" className="btn btn-secondary">No thanks, back to drills</Link>
        </div>
        <p className="hint">Nothing plays until you press Play on the next screen.</p>
      </div>
    </Card>
  );
}

type Status = 'idle' | 'playing' | 'paused';

/** English voices the browser has. They load a moment after the page does, so this listens for them. */
function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    const synth = window.speechSynthesis;
    const load = () => setVoices(synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en')));
    load();
    synth.addEventListener?.('voiceschanged', load);
    return () => synth.removeEventListener?.('voiceschanged', load);
  }, []);
  return voices;
}

function Session({ studentId, target, sources, typeId, track, onType, onNew }: {
  studentId: string; target: string; sources: { id: string; label: string }[]; typeId: string; track: 'ma' | 'rx'; onType: (id: string) => void; onNew: () => void;
}) {
  const store = useMemo(() => browserStore(), []);
  const chunks = useMemo(() => speechChunks(speechScript(target)), [target]);
  const voices = useVoices();
  const [voiceName, setVoiceName] = useState(() => readBest(store, DICTATION_VOICE_KEY, isString) ?? '');
  const [rate, setRate] = useState(() => readBest(store, DICTATION_RATE_KEY, isRate) ?? 1);
  const voice = voices.find((v) => v.name === voiceName) ?? voices.find((v) => v.lang === 'en-US' && v.localService) ?? voices[0] ?? null;

  const [status, setStatus] = useState<Status>('idle');
  const [heard, setHeard] = useState(0);
  const [replays, setReplays] = useState(0);
  const [played, setPlayed] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState<DictationResult | null>(null);
  const [newBest, setNewBest] = useState(false);
  const best = useMemo(() => readBest(store, dictationBestKey(studentId), isDictationBest), [store, studentId, result]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = useRef(0);
  const token = useRef(0);
  const keyTimes = useRef<number[]>([]);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const speakFrom = useCallback((from: number, over: { rate?: number } = {}) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const mine = ++token.current;
    setStatus('playing');
    setPlayed(true);
    chunks.slice(from).forEach((text, i) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = voice?.lang ?? 'en-US';
      if (voice) u.voice = voice;
      u.rate = over.rate ?? rate;
      u.onstart = () => { if (token.current === mine) { current.current = from + i; setHeard(from + i + 1); } };
      u.onend = () => { if (token.current === mine && from + i === chunks.length - 1) setStatus('idle'); };
      u.onerror = (e) => { if (token.current === mine && e.error !== 'interrupted' && e.error !== 'canceled') setStatus('idle'); };
      synth.speak(u);
    });
  }, [chunks, voice, rate]);

  const stopSpeaking = useCallback(() => { token.current++; window.speechSynthesis.cancel(); }, []);
  useEffect(() => stopSpeaking, [stopSpeaking]);

  const play = () => { if (played) setReplays((n) => n + 1); current.current = 0; setHeard(0); speakFrom(0); taRef.current?.focus(); };
  const pause = () => { stopSpeaking(); setStatus('paused'); taRef.current?.focus(); };
  const resume = () => { speakFrom(current.current); taRef.current?.focus(); };
  const again = () => { setReplays((n) => n + 1); speakFrom(current.current); taRef.current?.focus(); };
  const togglePause = () => { if (status === 'playing') pause(); else if (status === 'paused') resume(); };

  const chooseRate = (r: number) => { setRate(r); writeBest(store, DICTATION_RATE_KEY, r); if (status === 'playing') speakFrom(current.current, { rate: r }); };
  const chooseVoice = (name: string) => { setVoiceName(name); writeBest(store, DICTATION_VOICE_KEY, name); stopSpeaking(); setStatus('idle'); };

  const finish = () => {
    if (result) return;
    stopSpeaking();
    setStatus('idle');
    const r = dictationResult({ typed, target, keyTimes: keyTimes.current, replays, revealed });
    setResult(r);
    if (betterDictation(readBest(store, dictationBestKey(studentId), isDictationBest), r)) {
      setNewBest(writeBest(store, dictationBestKey(studentId), { wpm: r.wpm, accuracy: r.accuracy }));
    }
  };

  const wordsTyped = typed.split(/\s+/).filter(Boolean).length;
  const sourceLabel = sources.find((s) => s.id === typeId)?.label ?? 'note';

  return (
    <div className="stack">
      <div className="scenario">
        <b>Listen, then type what you hear.</b> Write it the way a chart would: numbers as digits, and abbreviations such as “BP 128/84 mmHg”, “10 mg”, “11/17” and “y/o”.
        {track === 'rx' && ' Drug names use Tall Man capital letters where the FDA lists them.'}
        <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>Capitals and punctuation count. Line breaks don’t. Pasting is off.</p>
      </div>

      <Card title="Controls" action={<span className="hint">Esc pauses and resumes</span>}>
        <div className="stack">
          <div className="row" role="group" aria-label="Playback">
            <Button variant="primary" onClick={play} disabled={!!result}>{played ? '↺ Replay from the start' : '▶ Play'}</Button>
            {status === 'playing' && <Button onClick={pause}>❚❚ Pause</Button>}
            {status === 'paused' && <Button onClick={resume}>▶ Resume</Button>}
            <Button onClick={again} disabled={!played || !!result}>↩ Repeat this sentence</Button>
            <span className="hint" role="status" aria-live="polite">
              {status === 'playing' ? `Playing sentence ${Math.max(heard, 1)} of ${chunks.length}` : status === 'paused' ? 'Paused' : played ? 'Finished playing' : 'Not started'}
              {replays > 0 && ` · ${replays} replay${replays > 1 ? 's' : ''}`}
            </span>
          </div>
          <div className="row">
            <label className="row" style={{ gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14.5 }}>Speed</span>
              <select className="select" style={{ width: 'auto' }} value={rate} onChange={(e) => chooseRate(Number(e.target.value))}>
                {SPEEDS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            <label className="row" style={{ gap: 8, flex: '1 1 260px' }}>
              <span style={{ fontWeight: 600, fontSize: 14.5 }}>Voice</span>
              <select className="select" value={voice?.name ?? ''} onChange={(e) => chooseVoice(e.target.value)} disabled={voices.length === 0}>
                {voices.length === 0 && <option value="">Default voice</option>}
                {voices.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
              </select>
            </label>
            <label className="row" style={{ gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14.5 }}>Passage</span>
              <select className="select" style={{ width: 'auto' }} value={typeId} onChange={(e) => onType(e.target.value)}>
                {sources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
          </div>
        </div>
      </Card>

      <div className="stack">
        <label htmlFor="dictation-input" style={{ fontWeight: 600 }}>Type the {sourceLabel.toLowerCase()} here</label>
        <textarea
          id="dictation-input"
          ref={taRef}
          className="hunt-input"
          value={typed}
          readOnly={!!result}
          onChange={(e) => {
            if (e.target.value.length !== typed.length) keyTimes.current.push(performance.now());
            setTyped(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); togglePause(); }
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); finish(); }
          }}
          onPaste={(e) => { e.preventDefault(); setNote('Pasting is off. Type what you hear.'); }}
          onDrop={(e) => e.preventDefault()}
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} name="dictation"
        />
        {!result && (
          <div className="row">
            <Button variant="primary" onClick={finish} disabled={wordsTyped === 0}>I’m done</Button>
            <Button onClick={() => setRevealed(true)} disabled={revealed}>Show the text</Button>
            <Button variant="ghost" onClick={onNew}>Different passage</Button>
            <span className="tone-bad" style={{ fontWeight: 600, fontSize: 14 }} role="status">{note}</span>
            <span className="hint" style={{ marginLeft: 'auto' }}>{wordsTyped} word{wordsTyped === 1 ? '' : 's'} · Ctrl+Enter finishes</span>
          </div>
        )}
        {revealed && !result && (
          <div className="note note-warn">
            <b>The text:</b>
            <pre style={{ fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>{target}</pre>
            <p className="hint" style={{ marginTop: 6 }}>You can still finish, but a run with the text showing doesn’t count toward your best.</p>
          </div>
        )}
      </div>

      {result && <Review result={result} target={target} newBest={newBest} best={best} onNew={onNew} onRetry={() => { setResult(null); setTyped(''); setNewBest(false); setRevealed(false); setReplays(0); setPlayed(false); keyTimes.current = []; setHeard(0); setStatus('idle'); }} />}

      {!result && <div className="why"><b>Why it matters:</b> Providers dictate notes and patients leave voicemails. Hearing a dose, a date or a drug name and writing it down correctly the first time is a real front-desk and pharmacy skill.</div>}
    </div>
  );
}

const MAX_ISSUES = 12;

function Review({ result, target, newBest, best, onNew, onRetry }: {
  result: DictationResult; target: string; newBest: boolean; best: { wpm: number; accuracy: number } | null; onNew: () => void; onRetry: () => void;
}) {
  const headline = result.revealed
    ? { title: 'Done, with the text showing', text: 'Good practice. Try the next one without peeking.', warn: false }
    : result.exact
      ? { title: 'Every word right', text: result.clean ? 'A clean run.' : 'Every word matched.', warn: false }
      : result.accuracy >= 90
        ? { title: 'Close', text: 'A few words are different. The review shows each one.', warn: true }
        : { title: 'Not there yet', text: 'Listen again and check each number, unit and abbreviation. The review shows what differed.', warn: true };
  return (
    <Card className={`result ${headline.warn ? 'warn' : ''}`}>
      <h2 style={{ fontSize: 22, fontWeight: 700 }}>{headline.title}</h2>
      <p className="muted">{headline.text}{result.clean ? ' This run counts toward your best.' : ''}</p>
      <div className="result-stats num">
        <div><span>Words right</span><b>{result.wordsRight} of {result.wordsTotal}</b></div>
        <div><span>Accuracy</span><b>{result.accuracy}%</b></div>
        <div><span>WPM</span><b>{result.wpm}</b></div>
        <div><span>Typing time</span><b>{mmss(result.seconds)}</b></div>
        <div><span>Replays</span><b>{result.replays}</b></div>
      </div>
      {newBest && <div className="note note-good" role="status" style={{ marginBottom: 12 }}>New personal best: {result.wpm} WPM.</div>}
      {!newBest && best && <p className="hint" style={{ marginBottom: 12 }}>Your best on this device: <b>{best.wpm} WPM</b> · {best.accuracy}%</p>}

      <div className="dx-box" style={{ marginBottom: 12 }}>
        <h3>What the note says</h3>
        <p style={{ fontFamily: 'var(--font-mono)', lineHeight: 1.9, overflowWrap: 'anywhere' }}>
          {result.ops.filter((o) => o.kind !== 'extra').map((o, i) => (
            <span key={i}>
              {i > 0 && ' '}
              {o.kind === 'ok' ? o.target : (
                <mark style={{ background: 'var(--bad-soft)', color: 'var(--bad-ink)', borderRadius: 3, padding: '0 3px' }}>{o.target}</mark>
              )}
            </span>
          ))}
        </p>
        <p className="hint">Highlighted words are ones you got wrong or left out.</p>
      </div>

      {result.issues.length > 0 && (
        <div className="dx-box" style={{ marginBottom: 12 }}>
          <h3>{result.issues.length} difference{result.issues.length > 1 ? 's' : ''}</h3>
          <ul className="hunt-list">
            {result.issues.slice(0, MAX_ISSUES).map((t, i) => <li key={i} className="miss">{t}</li>)}
            {result.issues.length > MAX_ISSUES && <li className="miss">…and {result.issues.length - MAX_ISSUES} more.</li>}
          </ul>
        </div>
      )}
      {/* The passage is only shown here, after the run, so it never gives the answer away. */}
      <div className="row">
        <Button variant="primary" onClick={onNew}>New passage →</Button>
        <Button onClick={onRetry}>Try this one again</Button>
        <Link to="/drills" className="btn btn-secondary">Back to all drills</Link>
        <span className="hint">{target.split(/\s+/).length} words</span>
      </div>
    </Card>
  );
}
