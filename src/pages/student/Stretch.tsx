import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, ProgressBar, Tag, mmss } from '../../components/ui';
import { STRETCH_PRESETS, STRETCH_SAFETY, buildStretchPlan, locateStretch, skipToNextStep } from '../../lib/stretch';

const TICK_MS = 250;

/** A guided break. Visual only: nothing here plays a sound. The schedule and step logic live in lib/stretch. */
export function Stretch() {
  const [minutes, setMinutes] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [ended, setEnded] = useState(false);
  const last = useRef(0);

  const plan = useMemo(() => (minutes == null ? null : buildStretchPlan(minutes)), [minutes]);
  const at = plan ? locateStretch(plan, elapsed) : null;
  const finished = ended || !!at?.done;

  useEffect(() => {
    if (!running || !plan || finished) return;
    last.current = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = (now - last.current) / 1000;
      last.current = now;
      setElapsed((e) => e + dt);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [running, plan, finished]);

  const begin = (m: number) => { setMinutes(m); setElapsed(0); setEnded(false); setRunning(true); };
  const reset = () => { setMinutes(null); setElapsed(0); setEnded(false); setRunning(false); };

  const header = (
    <div className="row row-between">
      <div className="row"><Link to="/today" className="btn btn-secondary btn-sm">← Today</Link><h1 style={{ fontSize: 22, fontWeight: 700 }}>Stretch break</h1></div>
      {plan && !finished && <span className="muted num" style={{ fontSize: 14 }}>{mmss(Math.ceil(at!.totalLeft))} left</span>}
    </div>
  );

  if (!plan || !at) {
    return (
      <>
        {header}
        <Card title="Step away from the keyboard" subtitle="A short guided break. It is all on screen, so nothing needs sound.">
          <div className="stack">
            <div className="row" role="group" aria-label="Length of the break">
              {STRETCH_PRESETS.map((p) => (
                <Button key={p.minutes} variant={p.minutes === 5 ? 'primary' : 'secondary'} onClick={() => begin(p.minutes)}>
                  {p.label} · {p.steps} steps
                </Button>
              ))}
            </div>
            <p className="hint">You will rest your eyes, stretch your wrists, hands, neck and shoulders, and stand up and walk. Skip, pause or finish whenever you like.</p>
            <div className="note note-info">{STRETCH_SAFETY}</div>
          </div>
        </Card>
      </>
    );
  }

  if (finished) {
    return (
      <>
        {header}
        <Card className="result" title="Break finished">
          <p className="muted">{ended && !at.done ? 'Finished early. Even a short break helps.' : 'Nicely done.'} Sit back down with your feet flat, your screen at eye level and your forearms relaxed, then get back to typing.</p>
          <div className="row" style={{ marginTop: 12 }}>
            <Link to="/today" className="btn btn-primary">Back to Today</Link>
            <Button onClick={() => begin(plan.minutes)}>Stretch again</Button>
            <Button variant="ghost" onClick={reset}>Choose a different length</Button>
          </div>
        </Card>
      </>
    );
  }

  const step = plan.steps[at.index];
  const stepPct = (at.into / step.seconds) * 100;
  const sideText = at.side === 'first' ? 'First side' : at.side === 'second' ? 'Switch sides now' : null;

  return (
    <>
      {header}
      <ol className="row" aria-label="Steps" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 8 }}>
        {plan.steps.map((s, i) => (
          <li key={s.id}>
            <Tag tone={i < at.index ? 'good' : i === at.index ? 'info' : 'neutral'}>{i < at.index ? '✓ ' : `${i + 1}. `}{s.area === '20-20-20' ? 'Eyes' : s.title.split(' and ')[0]}</Tag>
          </li>
        ))}
      </ol>

      <Card>
        <div className="stack" aria-live="polite">
          <div className="row row-between">
            <span className="muted" style={{ fontSize: 14, fontWeight: 600 }}>Step {at.index + 1} of {plan.steps.length}</span>
            {sideText && <Tag tone={at.side === 'second' ? 'warn' : 'info'}>{sideText}</Tag>}
          </div>
          <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.2 }}>{step.title}</h2>
          <ul style={{ margin: 0, paddingLeft: 22, fontSize: 18, lineHeight: 1.6 }}>
            {step.lines.map((l) => <li key={l}>{l}</li>)}
          </ul>
          <div className="num" style={{ fontSize: 56, fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }} aria-label={`${Math.ceil(at.left)} seconds left in this step`}>{mmss(Math.ceil(at.left))}</div>
          <ProgressBar value={stepPct} label="Progress through this step" />
        </div>
      </Card>

      <div className="row">
        <Button variant="primary" onClick={() => setRunning((r) => !r)}>{running ? 'Pause' : 'Resume'}</Button>
        <Button onClick={() => setElapsed(skipToNextStep(plan, elapsed))}>{at.index === plan.steps.length - 1 ? 'Skip to the end' : 'Skip this step →'}</Button>
        <Button onClick={() => setEnded(true)}>Finish</Button>
        {!running && <span className="hint" role="status">Paused</span>}
      </div>
      <p className="hint">{STRETCH_SAFETY}</p>
    </>
  );
}
