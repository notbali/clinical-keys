import { useId, type ComponentProps, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import type { Tone } from '../lib/metrics';

export function Tag({ tone = 'neutral', children }: { tone?: Tone | 'ma' | 'pt'; children: ReactNode }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

export const TrackTag = ({ track }: { track: 'ma' | 'rx' }) =>
  track === 'ma' ? <Tag tone="ma">MA</Tag> : <Tag tone="pt">PT</Tag>;

export function Card({ title, subtitle, action, children, className = '' }: { title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="card-head">
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {subtitle && <p className="card-sub">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: Tone }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone ? `tone-${tone}` : ''}`}>{value}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}

export function Field({ label, error, hint, children }: { label: string; error?: string | null; hint?: ReactNode; children: (p: { id: string; describedBy?: string; invalid: boolean }) => ReactNode }) {
  const id = useId();
  const errId = `${id}-err`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children({ id, describedBy: error ? errId : undefined, invalid: !!error })}
      {hint && !error && <div className="hint">{hint}</div>}
      {error && <div className="field-error" id={errId} role="alert">{error}</div>}
    </div>
  );
}

export function ProgressBar({ value, tone = 'accent', label }: { value: number; tone?: 'accent' | 'good' | 'ink'; label: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="bar" role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`bar-fill bar-${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <div className="note note-bad" role="alert">{children}</div>;
}

export const LinkButton = ({ to, variant = 'secondary', children }: { to: string; variant?: 'primary' | 'secondary' | 'dark' | 'danger'; children: ReactNode }) => (
  <Link to={to} className={`btn btn-${variant}`}>{children}</Link>
);

export function Button({ variant = 'secondary', busy, ...props }: ComponentProps<'button'> & { variant?: 'primary' | 'secondary' | 'dark' | 'danger' | 'ghost'; busy?: boolean }) {
  return <button {...props} className={`btn btn-${variant} ${props.className ?? ''}`} disabled={props.disabled || busy}>{busy ? 'Working…' : props.children}</button>;
}

export const TopLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <NavLink to={to} className={({ isActive }) => `toplink ${isActive ? 'on' : ''}`}>{children}</NavLink>
);

/** Relative time like "3 min ago", using the browser's locale. */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return 'Never';
  const mins = Math.round((now - new Date(iso).getTime()) / 60000);
  if (mins < 10) return 'Just now';
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (mins < 60) return rtf.format(-mins, 'minute');
  if (mins < 60 * 24) return rtf.format(-Math.round(mins / 60), 'hour');
  return rtf.format(-Math.round(mins / 1440), 'day');
}

export const pct = (n: number | null | undefined, digits = 0) => (n == null ? '—' : `${n.toFixed(digits)}%`);
export const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
export const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) =>
  new Intl.DateTimeFormat(undefined, opts).format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso));
