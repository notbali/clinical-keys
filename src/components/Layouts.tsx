import { useEffect } from 'react';
import { Link, NavLink, Navigate, Outlet, useOutletContext } from 'react-router-dom';
import { useApi, useAsync, useSession } from '../data/context';
import type { StudentRecord } from '../data/api';
import type { Attempt, GradeOverride, Settings } from '../data/types';
import { programDay, todayISO, type ISODate } from '../lib/dates';
import { ErrorNote, TopLink } from './ui';

export function DemoBanner() {
  const api = useApi();
  if (api.mode !== 'demo') return null;
  return <div className="demo-banner">Demo mode: this data lives only in this browser and is all fictional.</div>;
}

export function RequireRole({ role, children }: { role: 'student' | 'instructor'; children: React.ReactNode }) {
  const { session } = useSession();
  if (session === undefined) return <p className="empty" style={{ padding: 24 }}>Loading…</p>;
  if (!session) return <Navigate to={role === 'student' ? '/signin' : '/instructor/signin'} replace />;
  if (session.role !== role) return <Navigate to={session.role === 'student' ? '/today' : '/hub'} replace />;
  return <>{children}</>;
}

export interface StudentCtx {
  me: StudentRecord;
  attempts: Attempt[];
  settings: Settings;
  override?: GradeOverride;
  today: ISODate;
  /** True when the student screens use the training EHR look. */
  ehr: boolean;
  /** Raw program day, 0 if the start date is in the future. */
  day: number;
  reload: () => void;
}
export const useStudent = () => useOutletContext<StudentCtx>();

export function StudentLayout() {
  const api = useApi();
  const { settings, signOut } = useSession();
  const loaded = useAsync(async () => {
    const [me, attempts, overrides] = await Promise.all([api.getMe(), api.listAttempts(), api.listOverrides()]);
    return { me, attempts, override: overrides[0] };
  }, [api]);

  const track = loaded.data?.me.track ?? 'ma';
  const ehr = settings.uiStyle !== 'standard';
  useEffect(() => {
    document.body.dataset.track = track;
    document.body.dataset.style = ehr ? 'ehr' : 'standard';
    return () => { delete document.body.dataset.track; delete document.body.dataset.style; };
  }, [track, ehr]);

  if (loaded.error) return <div className="page"><ErrorNote>{loaded.error}</ErrorNote></div>;
  if (!loaded.data) return <p className="empty" style={{ padding: 24 }}>Loading…</p>;
  const { me, attempts, override } = loaded.data;
  const today = todayISO();
  const day = me.enrollment ? programDay(me.enrollment.startDate, today, new Set(settings.closedDays)) : 1;
  const ctx: StudentCtx = { me, attempts, settings, override, today, ehr, day, reload: loaded.reload };

  if (ehr) {
    const stamp = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date());
    return (
      <>
        <a className="skip" href="#main">Skip to content</a>
        <DemoBanner />
        <header className="ehr-bar">
          <Link to="/today" className="ehr-brand"><span className="mark" aria-hidden="true">Rx</span>Clinical Keys<span className="ehr-env">TRAINING</span></Link>
          <div className="ehr-bar-mid">{stamp}</div>
          <div className="ehr-user">
            <span translate="no">{me.lastName.toUpperCase()}, {me.firstName} · <span className="mono">{me.username}</span></span>
            <button className="btn btn-sm" onClick={() => void signOut()}>Sign out</button>
          </div>
        </header>
        <div className="ehr-body">
          <nav className="ehr-nav" aria-label="Main">
            <div className="ehr-nav-h">Activities</div>
            <NavLink to="/today" className={({ isActive }) => (isActive ? 'on' : '')}>Worklist<small>Today’s activities</small></NavLink>
            <NavLink to="/gradebook" className={({ isActive }) => (isActive ? 'on' : '')}>My results<small>Grades and progress</small></NavLink>
            <NavLink to="/drills" className={({ isActive }) => (isActive ? 'on' : '')}>Practice library<small>All drills</small></NavLink>
          </nav>
          <main id="main" className="page ehr-main"><Outlet context={ctx} /></main>
        </div>
      </>
    );
  }

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <DemoBanner />
      <header className="topbar">
        <div className="topbar-in">
          <Link to="/today" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}><span className="mark" aria-hidden="true">Rx</span>Clinical Keys</Link>
          <nav className="toplinks" aria-label="Main">
            <TopLink to="/today">Today</TopLink>
            <TopLink to="/gradebook">My gradebook</TopLink>
            <TopLink to="/drills">All drills</TopLink>
          </nav>
          <div className="row">
            <div className="who"><b translate="no">{me.firstName} {me.lastName}</b><span className="mono" translate="no">{me.username}</span></div>
            <button className="btn btn-secondary btn-sm" onClick={() => void signOut()}>Sign out</button>
          </div>
        </div>
      </header>
      <main id="main" className="page"><Outlet context={ctx} /></main>
    </>
  );
}

export function InstructorLayout() {
  const { session, signOut } = useSession();
  const email = session?.role === 'instructor' ? session.email : '';
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <DemoBanner />
      <div className="shell">
        <nav className="side" aria-label="Main">
          <Link to="/hub" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}><span className="mark" aria-hidden="true">Rx</span>Clinical Keys</Link>
          <div className="side-nav">
            <NavLink to="/hub" className={({ isActive }) => (isActive ? 'on' : '')}>Today’s room</NavLink>
            <NavLink to="/classes" className={({ isActive }) => (isActive ? 'on' : '')}>Classes</NavLink>
            <NavLink to="/settings" className={({ isActive }) => (isActive ? 'on' : '')}>Program &amp; settings</NavLink>
          </div>
          <div className="side-foot">
            <div><div style={{ fontWeight: 600 }}>Instructor</div><div style={{ fontSize: 12.5, color: 'var(--on-chrome-muted)' }} translate="no">{email}</div></div>
            <button onClick={() => void signOut()}>Sign out</button>
          </div>
        </nav>
        <main id="main" className="main"><Outlet /></main>
      </div>
    </>
  );
}
