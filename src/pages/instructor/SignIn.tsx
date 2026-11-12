import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, ErrorNote, Field } from '../../components/ui';
import { useApi, useSession } from '../../data/context';

export function InstructorSignIn() {
  const api = useApi();
  const { refresh } = useSession();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await api.signInInstructor(email, password);
    if (!r.ok) { setError(r.error); setBusy(false); return; }
    await refresh();
    nav('/hub', { replace: true });
  };

  return (
    <div className="signin">
      <div className="signin-form">
        <div className="signin-box">
          <div className="row"><span className="brand"><span className="mark mark-dark" aria-hidden="true">Rx</span>Clinical Keys</span><span className="tag" style={{ background: 'var(--chrome)', color: '#fff' }}>INSTRUCTOR</span></div>
          <div><h1 style={{ fontSize: 32, fontWeight: 800 }}>Instructor sign in</h1><p className="muted" style={{ marginTop: 4 }}>Manage classes, students and grades.</p></div>
          {api.mode === 'demo' && <div className="note note-warn"><b>Demo mode.</b> Enter any email and password to look around. Sign-in with school accounts and two-step verification arrives with the live back end.</div>}
          <form onSubmit={submit} className="stack" noValidate>
            <Field label="Email">{({ id }) => <input id={id} name="email" type="email" inputMode="email" spellCheck={false} autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.example…" />}</Field>
            <Field label="Password" error={error}>{({ id, describedBy, invalid }) => <input id={id} name="password" type="password" autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={invalid} aria-describedby={describedBy} />}</Field>
            <Button variant="dark" type="submit" busy={busy}>Sign in</Button>
          </form>
          <div className="muted" style={{ fontSize: 14, borderTop: '1px solid var(--line)', paddingTop: 16 }}>Are you a student? <Link to="/signin" style={{ fontWeight: 600 }}>Student sign in</Link></div>
          {error && !password && <ErrorNote>{error}</ErrorNote>}
        </div>
      </div>
      <div className="signin-art dark" style={{ justifyContent: 'center' }}>
        <h1>Your whole room, at a glance.</h1>
        <div className="stack" style={{ maxWidth: 460, gap: 18 }}>
          {[
            ['See every student by program day', 'Students join and leave daily. The hub groups them by where each one is in Day 1 to Day 10.'],
            ['Typing grades, automatically', 'Scores arrive after every run, ready to export for your Blackboard gradebook.'],
            ['Know who needs you', 'Flags for low accuracy and falling behind, before it shows up on a final test.'],
            ['Clean exits', 'Export, archive and delete in a few clicks when a student rotates out.'],
          ].map(([t, d], i) => (
            <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }} key={t}>
              <div style={{ flex: '0 0 28px', height: 28, borderRadius: 99, border: '1px solid var(--chrome-line)', display: 'grid', placeItems: 'center', fontSize: 13 }}>{i + 1}</div>
              <div><div style={{ fontWeight: 700 }}>{t}</div><div style={{ fontSize: 14.5, color: 'var(--on-chrome)' }}>{d}</div></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
