import { useParams } from 'react-router-dom';
import { useApi } from '../../data/context';
import { usePoll } from '../../data/usePoll';
import { POLL_MS, leaderboardRows, rankResults, summarize } from '../../lib/challenge';
import '../../styles/challenge.css';

const ROWS = 8;

/**
 * The projector page: very large type, high contrast, first name and last initial only. It asks for new results about
 * every two seconds and keeps showing the last ones if a poll fails.
 */
export function ChallengeScreen() {
  const api = useApi();
  const { id = '' } = useParams();
  const round = usePoll(async () => {
    const [challenge, results] = await Promise.all([api.getChallenge(id), api.listChallengeResults(id)]);
    return { challenge, ranked: rankResults(results) };
  }, POLL_MS, [api, id]);

  const challenge = round.data?.challenge;
  const ranked = round.data?.ranked ?? [];
  const { rows, hidden } = leaderboardRows(ranked, ROWS);
  const sum = summarize(ranked);
  const open = challenge?.status === 'open';

  return (
    <main className="chal-screen" aria-live="polite">
      <header className="chal-screen-head">
        <h1>Class challenge</h1>
        {challenge && <span className={`chal-screen-state ${open ? 'live' : ''}`}>{open ? 'Round open' : 'Final results'}</span>}
      </header>
      {round.data && !challenge && <p className="chal-screen-empty">That round was not found.</p>}
      {!round.data && !round.error && <p className="chal-screen-empty">Loading…</p>}
      {challenge && (
        <>
          <p className="chal-screen-sub">
            {sum.finished === 0 ? 'Waiting for the first finisher…' : `${sum.finished} finished · ${sum.clean} clean`}
            {' · '}Accuracy first: clean runs rank above every run with errors.
          </p>
          <ol className="chal-screen-list">
            {rows.map((r) => (
              <li key={r.studentId} className={`chal-screen-row ${r.rank === 1 && r.clean ? 'first' : ''} ${r.clean ? '' : 'dim'}`}>
                <span className="chal-screen-rank">{r.rank}</span>
                <span className="chal-screen-name" translate="no"><span className={`tk ${r.track}`}>{r.track === 'ma' ? 'MA' : 'PT'}</span>{r.displayName}</span>
                <span className="chal-screen-stat">{r.wpm}<small>WPM</small></span>
                <span className="chal-screen-acc">{r.accuracy}%{!r.clean && <span className="chal-screen-note">{r.errorsLeft > 0 ? `${r.errorsLeft} error${r.errorsLeft > 1 ? 's' : ''} left` : r.revealed ? 'answer shown' : 'under 95%'}</span>}</span>
              </li>
            ))}
          </ol>
          {hidden > 0 && <p className="chal-screen-more">+ {hidden} more finished</p>}
        </>
      )}
      {round.error && <p className="chal-screen-err" role="status">Can’t reach the server. Showing the last results.</p>}
    </main>
  );
}
