import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, ErrorNote, Field } from '../../components/ui';
import { useApi, useSession } from '../../data/context';
import type { StudentPreview } from '../../data/api';

export function StudentSignIn() {
  const api = useApi();
  const { refresh } = useSession();
  const nav = useNavigate();
  const [typed, setTyped] = useState('');
  const [found, setFound] = useState<StudentPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lookup = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const p = await api.lookupStudent(typed);
      if (p) setFound(p); else setError("We can't find that username. Check the spelling, or ask your instructor.");
    } catch { setError('Something went wrong. Check your connection and try again.'); }
    setBusy(false);
  };
  const confirm = async () => {
    setBusy(true);
    const r = await api.signInStudent(typed);
    if (!r.ok) { setError(r.error); setFound(null); setBusy(false); return; }
    await refresh();
    nav('/today', { replace: true });
  };

  return (
    <div className="signin">
      <div className="signin-art">
        <div className="brand"><span className="mark" aria-hidden="true">Rx</span>Clinical Keys</div>
        <div><h1>Typing practice that sounds like the job.</h1><p>Charting, sig codes, labels, phone messages. Sign in to see today’s assignment and how you’re doing.</p></div>
        <div className="row"><span className="tag tag-neutral" style={{ background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,.4)' }}>Medical Assistant</span><span className="tag tag-neutral" style={{ background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,.4)' }}>Pharmacy Tech</span></div>
      </div>
      <div className="signin-form">
        <div className="signin-box">
          <div><h2 style={{ fontSize: 30, fontWeight: 800 }}>Sign in</h2><p className="muted" style={{ marginTop: 4 }}>Use your username: last name, then first name. No password.</p></div>

          {!found ? (
            <form onSubmit={lookup} className="stack" noValidate>
              <Field label="Username" error={error} hint={<>Example: Maya Santos is <b className="mono" translate="no">santosmaya</b>.</>}>
                {({ id, describedBy, invalid }) => (
                  <input id={id} name="username" className="input input-mono" value={typed} onChange={(e) => setTyped(e.target.value)}
                    autoComplete="off" autoCapitalize="off" spellCheck={false} autoFocus aria-invalid={invalid} aria-describedby={describedBy} placeholder="lastnamefirstname…" />
                )}
              </Field>
              <Button variant="primary" type="submit" busy={busy} disabled={!typed.trim()}>Continue</Button>
            </form>
          ) : (
            <div className="card confirm">
              <div className="row"><div className="avatar" aria-hidden="true">{found.firstName[0]}{found.lastInitial}</div>
                <div><div style={{ fontWeight: 700, fontSize: 18 }} translate="no">Hi {found.firstName} {found.lastInitial}., is this you?</div><div className="muted" style={{ fontSize: 14 }}>{found.track === 'ma' ? 'Medical Assistant' : 'Pharmacy Tech'} track</div></div></div>
              {error && <ErrorNote>{error}</ErrorNote>}
              <div className="row"><Button variant="primary" onClick={confirm} busy={busy}>Yes, that’s me</Button><Button onClick={() => { setFound(null); setError(null); }}>Not me</Button></div>
            </div>
          )}

          <div className="note note-info"><b>Working from home?</b> Your username works from anywhere. Signing in through your Blackboard course is coming.</div>
          <div className="muted" style={{ fontSize: 14, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
            <p>Using a shared computer? Sign out when you finish.</p>
            <p style={{ marginTop: 6 }}>Can’t sign in? Ask your instructor to check that you’re enrolled.</p>
            <p style={{ marginTop: 6 }}><Link to="/instructor/signin" style={{ fontWeight: 600 }}>Instructor sign in</Link></p>
          </div>
        </div>
      </div>
    </div>
  );
}
