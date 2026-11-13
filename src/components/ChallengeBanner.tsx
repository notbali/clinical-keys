import { Link } from 'react-router-dom';
import { useApi } from '../data/context';
import { usePoll } from '../data/usePoll';
import { POLL_MS, passageFor } from '../lib/challenge';
import type { Track } from '../content/types';
import '../styles/challenge.css';

/** Shown on a student's Today page while their class has an open challenge round with a passage for their track. */
export function ChallengeBanner({ track }: { track: Track }) {
  const api = useApi();
  const active = usePoll(() => api.getActiveChallenge(), POLL_MS * 2, [api]);
  const round = active.data;
  if (!round || !passageFor(round, track)) return null;
  return (
    <div className="chal-banner" role="status">
      <div><b>A class challenge is open.</b> Everyone types the same passage. Accuracy first.</div>
      <Link to="/challenge" className="btn">Join the challenge →</Link>
    </div>
  );
}
