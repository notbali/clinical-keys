import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, ErrorNote, Field, Tag } from '../../components/ui';
import { useApi, useAsync } from '../../data/context';
import { usePoll } from '../../data/usePoll';
import type { Challenge, ChallengePassage } from '../../data/challengeTypes';
import { GENERATED_DRILLS, generatedDrillsForTrack, newSeed } from '../../content';
import type { Track } from '../../content/types';
import { POLL_MS, rankResults, resolveChallengePassage, summarize, validateNewChallenge } from '../../lib/challenge';
import { todayISO } from '../../lib/dates';
import '../../styles/challenge.css';

const TRACKS: { id: Track; label: string }[] = [{ id: 'ma', label: 'Medical Assistant' }, { id: 'rx', label: 'Pharmacy Tech' }];
type Pick = { drillId: string; seed: number } | null;

/** The instructor's page for the class challenge: choose a passage per track, open a round, watch it, end it. */
export function Host() {
  const api = useApi();
  const classes = useAsync(async () => (await api.listClasses()).filter((c) => c.status === 'active'), [api]);
  const [classId, setClassId] = useState('');
  const chosen = classId || classes.data?.[0]?.id || '';
  const [ended, setEnded] = useState<Challenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chartDate = useMemo(() => todayISO(), []);
  // Default: the first generated drill of each track, so a round can open with one click.
  const [picks, setPicks] = useState<Record<Track, Pick>>(() => ({
    ma: { drillId: generatedDrillsForTrack('ma')[0].id, seed: newSeed() },
    rx: { drillId: generatedDrillsForTrack('rx')[0].id, seed: newSeed() },
  }));

  const active = usePoll(() => (chosen ? api.getActiveChallenge(chosen) : Promise.resolve(null)), POLL_MS, [api, chosen], !!chosen);
  const round = active.data ?? null;
  const live = usePoll(async () => (round ? rankResults(await api.listChallengeResults(round.id)) : []), POLL_MS, [api, round?.id], !!round);
  const sum = summarize(live.data ?? []);

  const passages = useMemo(() => {
    const out: Partial<Record<Track, ChallengePassage>> = {};
    for (const t of TRACKS) { const p = picks[t.id]; if (p) out[t.id] = { ...p, chartDate }; }
    return out;
  }, [picks, chartDate]);
  const problem = validateNewChallenge(passages);

  const setPick = (t: Track, patch: Partial<NonNullable<Pick>> | null) =>
    setPicks((cur) => ({ ...cur, [t]: patch === null ? null : { ...(cur[t] ?? { drillId: generatedDrillsForTrack(t)[0].id, seed: newSeed() }), ...patch } }));

  const open = async () => {
    setBusy(true); setError(null); setEnded(null);
    try { await api.createChallenge(chosen, passages); active.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not open the round.'); }
    setBusy(false);
  };
  const end = async () => {
    if (!round) return;
    setBusy(true); setError(null);
    try { await api.endChallenge(round.id); setEnded({ ...round, status: 'ended' }); active.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not end the round.'); }
    setBusy(false);
  };

  if (classes.error) return <ErrorNote>{classes.error}</ErrorNote>;
  if (!classes.data) return <p className="empty">Loading…</p>;
  if (!classes.data.length) return <><h1 className="page-title">Class challenge</h1><p className="empty">Add a class first. <Link to="/classes">Go to Classes</Link></p></>;

  const screenLink = (id: string) => `/challenge/screen/${id}`;

  return (
    <>
      <div>
        <h1 className="page-title">Class challenge</h1>
        <p className="page-sub">Everyone in a class types the same passage. Put the screen page on the projector: it shows only first names and last initials, and clean runs rank above any run with errors.</p>
      </div>

      <Card title="Class">
        <Field label="Which class">
          {({ id }) => (
            <select id={id} className="select" value={chosen} onChange={(e) => { setClassId(e.target.value); setEnded(null); }}>
              {classes.data!.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </Field>
      </Card>

      {error && <ErrorNote>{error}</ErrorNote>}

      {round ? (
        <Card title="Round open" subtitle="Students in this class see a Join the challenge banner on their Today page.">
          <div className="stack">
            <div className="row">
              <Tag tone="good">Open</Tag>
              <span className="num">{sum.finished} finished · {sum.clean} clean</span>
              {live.error && <span className="hint" role="status">Can’t reach the server. Showing the last count.</span>}
            </div>
            <div className="row">
              <a className="btn btn-primary" href={screenLink(round.id)} target="_blank" rel="noreferrer">Open the projector screen ↗</a>
              <Button variant="danger" onClick={() => void end()} busy={busy}>End the round</Button>
            </div>
            <p className="hint">Tip: students can also go to /challenge. Ending the round stops new results; the screen then shows the final board.</p>
          </div>
        </Card>
      ) : (
        <>
          {ended && (
            <Card title="Round ended" subtitle="The final results stay on the screen page.">
              <div className="row"><a className="btn btn-secondary" href={screenLink(ended.id)} target="_blank" rel="noreferrer">Open the final results ↗</a></div>
            </Card>
          )}
          <div className="chal-pick">
            {TRACKS.map((t) => {
              const pick = picks[t.id];
              const drills = generatedDrillsForTrack(t.id);
              const sample = pick ? resolveChallengePassage({ ...pick, chartDate }) : undefined;
              return (
                <Card key={t.id} title={t.label} subtitle={pick ? undefined : 'No passage: this track sits this round out.'}>
                  <div className="stack">
                    <Field label="Passage type">
                      {({ id }) => (
                        <select id={id} className="select" value={pick?.drillId ?? ''} onChange={(e) => setPick(t.id, e.target.value ? { drillId: e.target.value } : null)}>
                          <option value="">No {t.id === 'ma' ? 'MA' : 'PT'} passage this round</option>
                          {drills.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                        </select>
                      )}
                    </Field>
                    {pick && (
                      <>
                        <div className="chal-sample" aria-label={`${t.label} passage preview`} translate="no">{sample?.text}</div>
                        <div className="row"><Button onClick={() => setPick(t.id, { seed: newSeed() })}>Another passage</Button></div>
                      </>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
          {problem && <ErrorNote>{problem}</ErrorNote>}
          <div className="row"><Button variant="primary" onClick={() => void open()} busy={busy} disabled={!!problem || !chosen}>Open the round</Button></div>
          <p className="hint">{GENERATED_DRILLS.length} generated drills to choose from. Opening a new round ends any round still open for this class.</p>
        </>
      )}
    </>
  );
}
