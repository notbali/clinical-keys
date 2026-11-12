import { useCallback, useEffect, useRef, useState } from 'react';
import { accuracy, applyInput, elapsed, finishRun, newRun, wpm, type RunResult, type RunState } from './engine';
import { Button, mmss } from '../components/ui';

interface Props {
  /** The exact text to type. */
  target: string;
  /** "hidden" shows underscores until letters are typed correctly (sig-code translation). */
  mode: 'copy' | 'hidden';
  /** Seconds for a timed sprint. The clock starts on the first keystroke. */
  limit?: number;
  onFinish: (result: RunResult) => void;
  onRestart: () => void;
  /** Hint shown under the text box. */
  hint?: string;
}

const TICK_MS = 100;

export function TypingPlayer({ target, mode, limit, onFinish, onRestart, hint }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const run = useRef<RunState>(newRun());
  const finished = useRef<RunResult | null>(null);
  const flags = useRef({ revealed: false, peeks: 0 });
  const [, bump] = useState(0);
  const [focused, setFocused] = useState(false);
  const [peeking, setPeeking] = useState(false);
  const [message, setMessage] = useState('');
  const rerender = useCallback(() => bump((n) => n + 1), []);

  // New passage: start from scratch.
  useEffect(() => {
    run.current = newRun();
    finished.current = null;
    flags.current = { revealed: false, peeks: 0 };
    setPeeking(false);
    setMessage('');
    if (taRef.current) taRef.current.value = '';
    rerender();
    taRef.current?.focus({ preventScroll: true });
  }, [target, rerender]);

  const finish = useCallback(() => {
    if (finished.current) return;
    const s = run.current;
    let end = performance.now();
    if (limit && s.start != null) end = Math.min(end, s.start + limit * 1000);
    const result = finishRun(s, target, end, { limit, revealed: flags.current.revealed, peeks: flags.current.peeks });
    finished.current = result;
    taRef.current?.blur();
    rerender();
    onFinish(result);
  }, [limit, target, onFinish, rerender]);

  // Clock: re-render while running and end a timed run when the time is up.
  const started = run.current.start != null && !finished.current;
  useEffect(() => {
    if (!started) return;
    const id = setInterval(() => {
      if (limit && run.current.start != null && performance.now() - run.current.start >= limit * 1000) finish();
      else rerender();
    }, TICK_MS);
    return () => clearInterval(id);
  }, [started, limit, finish, rerender]);

  // Sprint text is a 3-line window that follows the cursor.
  useEffect(() => {
    if (!limit) return;
    const box = textRef.current;
    const cur = box?.querySelector<HTMLElement>('.cur');
    if (box && cur) box.scrollTop = Math.max(0, cur.offsetTop - parseFloat(getComputedStyle(box).lineHeight));
  });

  const onInput = () => {
    const ta = taRef.current;
    if (!ta || finished.current) { if (ta) ta.value = run.current.typed; return; }
    if (limit && run.current.start != null && performance.now() - run.current.start >= limit * 1000) {
      ta.value = run.current.typed;
      finish();
      return;
    }
    run.current = applyInput(run.current, target, ta.value, performance.now());
    if (ta.value !== run.current.typed) ta.value = run.current.typed;
    rerender();
    if (run.current.typed.length === target.length) finish();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') { e.preventDefault(); return; }
    if (e.key === 'Escape') { e.preventDefault(); onRestart(); return; }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) e.preventDefault();
  };

  const peek = () => {
    if (finished.current || peeking) return;
    flags.current.peeks++;
    setPeeking(true);
    setTimeout(() => setPeeking(false), 3000);
    taRef.current?.focus();
  };
  const reveal = () => {
    if (finished.current) return;
    flags.current.revealed = true;
    rerender();
    taRef.current?.focus();
  };

  const s = run.current;
  const now = performance.now();
  const done = finished.current;
  const masked = mode === 'hidden' && !flags.current.revealed && !peeking;
  const el = done ? done.seconds : elapsed(s, now, limit);
  const timeText = limit ? mmss(Math.max(0, Math.ceil(limit - el))) : mmss(el);

  return (
    <div className="stack">
      <div className="grid-tiles" aria-live="off">
        <Stat2 label="WPM" value={done ? done.wpm : wpm(s, target, now, limit)} />
        <Stat2 label="Accuracy" value={`${done ? done.accuracy : accuracy(s)}%`} />
        <Stat2 label={limit ? 'Time left' : 'Time'} value={timeText} />
        <Stat2 label="Mistakes" value={s.wrong} />
      </div>
      <div className="bar" aria-hidden="true">
        <div className="bar-fill bar-accent" style={{ width: `${limit ? (el / limit) * 100 : (s.typed.length / target.length) * 100}%` }} />
      </div>

      <div className={`typebox ${limit ? 'sprint' : ''} ${focused ? 'focused' : ''} ${done ? 'done' : ''}`} onClick={() => taRef.current?.focus({ preventScroll: true })}>
        <div className="typetext" ref={textRef}>
          {[...target].map((ch, i) => {
            const val = s.typed;
            let cls = 'ch';
            let txt = ch;
            if (i < val.length) {
              const ok = val[i] === ch;
              cls += ok ? ' ok' : ' bad';
              if (!ok) { txt = masked ? val[i] : ch; if (txt === ' ') txt = '·'; }
            } else {
              cls += ' todo';
              if (masked && /[A-Za-z0-9]/.test(ch)) txt = '_';
            }
            if (ch === '\n') { cls += ' nl'; txt = '↵\n'; }
            if (i === val.length && !done) cls += ' cur';
            return <span key={i} className={cls}>{txt}</span>;
          })}
        </div>
        <textarea
          ref={taRef}
          className="type-input"
          aria-label="Type the passage here"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          name="typing"
          onInput={onInput}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onPaste={(e) => { e.preventDefault(); setMessage('Pasting is off. Type it out!'); }}
          onDrop={(e) => e.preventDefault()}
        />
        <div className="type-overlay">Click here and start typing</div>
      </div>

      <div className="row">
        <Button onClick={onRestart}>Restart</Button>
        {mode === 'hidden' && (
          <>
            <Button onClick={peek} disabled={!!done || flags.current.revealed}>Peek (3 sec)</Button>
            <Button onClick={reveal} disabled={!!done || flags.current.revealed}>Show answer</Button>
          </>
        )}
        <span className="tone-bad" style={{ fontWeight: 600, fontSize: 14 }} role="status">{message}</span>
        <span className="hint" style={{ marginLeft: 'auto' }}>{hint ?? 'Enter = new line (↵) · Esc restarts · Pasting is off'}</span>
      </div>
    </div>
  );
}

const Stat2 = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="stat"><div className="stat-label">{label}</div><div className="stat-value">{value}</div></div>
);
