import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, ProgressBar, Tag } from '../../components/ui';
import { PatientBanner } from '../../components/PatientBanner';
import { useStudent } from '../../components/Layouts';
import { newSeed, parseSeed } from '../../content';
import { CATEGORY_LABELS, makeRound, ROUND_SIZE, type FlashCard } from '../../content/generate/flashcards';
import { todayISO } from '../../lib/dates';
import { answerCard, betterRound, flashBestKey, isRoundBest, maxScore, newGame, type GameState, type RoundBest } from '../../lib/flashcardGame';
import { browserStore, readBest, writeBest } from '../../lib/localBest';

/** "Is this correct?": ten cards, each right or with exactly one planted mistake. Keys: Y = correct, N = has an error. */
export function FlashCards() {
  const { me } = useStudent();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const seed = parseSeed(params.get('seed'));
  const chartDate = useMemo(() => todayISO(), []);
  const round = useMemo(() => (seed == null ? [] : makeRound(seed, me.track, chartDate)), [seed, me.track, chartDate]);
  if (seed == null) return <Navigate replace to={`/flashcards?seed=${newSeed()}`} />;
  return <Game key={seed} round={round} studentId={me.id} onAgain={() => nav(`/flashcards?seed=${newSeed()}`)} />;
}

function Highlighted({ line, wrong, show }: { line: string; wrong?: string; show: boolean }) {
  const at = show && wrong ? line.indexOf(wrong) : -1;
  if (at < 0) return <>{line}</>;
  return (
    <>
      {line.slice(0, at)}
      <mark style={{ background: 'var(--bad-soft)', color: 'var(--bad-ink)', borderRadius: 3, padding: '0 3px', outline: '2px solid var(--bad)' }}>{wrong}</mark>
      {line.slice(at + wrong!.length)}
    </>
  );
}

function Game({ round, studentId, onAgain }: { round: FlashCard[]; studentId: string; onAgain: () => void }) {
  const store = useMemo(() => browserStore(), []);
  const [game, setGame] = useState<GameState>(newGame);
  const [index, setIndex] = useState(0);
  /** What the student said about the current card: true = "has an error". Null until they answer. */
  const [saidError, setSaidError] = useState<boolean | null>(null);
  const [points, setPoints] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const saved = useRef(false);
  const nextRef = useRef<HTMLButtonElement>(null);
  const done = index >= round.length;
  const card = round[index];
  const answered = saidError !== null;

  const answer = (error: boolean) => {
    if (answered || done) return;
    const right = error === (card.error !== null);
    const r = answerCard(game, right);
    setGame(r.state);
    setPoints(r.points);
    setSaidError(error);
  };
  const next = () => { setIndex((i) => i + 1); setSaidError(null); };

  // Keyboard: Y says "correct", N says "has an error". After an answer the Next button has the focus, so Enter works as usual.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || answered || done) return;
      const t = e.target as HTMLElement | null;
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); answer(false); }
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); answer(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  useEffect(() => { if (answered) nextRef.current?.focus(); }, [answered]);

  // Save the best once, when the last card has been answered and the score is shown.
  const summary: RoundBest = { score: game.score, correct: game.correct, size: round.length, bestStreak: game.bestStreak };
  const before = useMemo(() => readBest(store, flashBestKey(studentId), isRoundBest), [store, studentId]);
  useEffect(() => {
    if (!done || saved.current) return;
    saved.current = true;
    if (betterRound(before, summary, ROUND_SIZE)) setNewBest(writeBest(store, flashBestKey(studentId), summary));
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (done) {
    const missed = round.map((c, i) => ({ c, i })).filter(({ i }) => !game.results[i]);
    return (
      <>
        <div className="row row-between"><div className="row"><Link to="/drills" className="btn btn-secondary btn-sm">← All drills</Link><h1 style={{ fontSize: 22, fontWeight: 700 }}>Flash cards</h1></div></div>
        <Card className={`result ${game.correct < round.length / 2 ? 'warn' : ''}`}>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>{game.correct === round.length ? 'Perfect round' : game.correct >= round.length * 0.8 ? 'Sharp eyes' : game.correct >= round.length / 2 ? 'Getting there' : 'Slow down and look closer'}</h2>
          <p className="muted">{game.correct === round.length ? 'Every card right. That is how errors get caught before they go out.' : 'Read the cards you missed below. Each one is a mistake that really happens.'}</p>
          <div className="result-stats num">
            <div><span>Score</span><b>{game.score}</b></div>
            <div><span>Right</span><b>{game.correct} of {round.length}</b></div>
            <div><span>Longest streak</span><b>{game.bestStreak}</b></div>
            <div><span>Top score</span><b>{maxScore(round.length)}</b></div>
          </div>
          {newBest && <div className="note note-good" role="status" style={{ marginBottom: 12 }}>New personal best: {game.score} points.</div>}
          {!newBest && before && <p className="hint" style={{ marginBottom: 12 }}>Your best on this device: <b>{before.score} points</b> ({before.correct} of {before.size})</p>}
          <div className="row">
            <Button variant="primary" onClick={onAgain}>Play another round →</Button>
            <Link to="/drills" className="btn btn-secondary">Back to all drills</Link>
          </div>
        </Card>
        {missed.length > 0 && (
          <Card title={`Cards to review (${missed.length})`}>
            <div className="stack">
              {missed.map(({ c, i }) => (
                <div key={i} className="dx-box">
                  <h3>Card {i + 1}: {c.title}{c.error ? ` · ${CATEGORY_LABELS[c.error.category]}` : ' · was correct'}</h3>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14.5, overflowWrap: 'anywhere' }}>
                    {c.lines.map((l, k) => <div key={k}><Highlighted line={l} wrong={c.error?.wrong} show /></div>)}
                  </div>
                  <p style={{ marginTop: 6, fontSize: 14.5 }}>{c.explanation}</p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </>
    );
  }

  const right = answered && saidError === (card.error !== null);
  return (
    <>
      <div className="row row-between">
        <div className="row"><Link to="/drills" className="btn btn-secondary btn-sm">← All drills</Link><h1 style={{ fontSize: 22, fontWeight: 700 }}>Flash cards</h1></div>
        <span className="muted" style={{ fontSize: 14 }}>Card {index + 1} of {round.length}</span>
      </div>
      <ProgressBar value={(index / round.length) * 100} label="Round progress" />
      <div className="grid-tiles">
        <div className="stat"><div className="stat-label">Score</div><div className="stat-value num">{game.score}</div></div>
        <div className="stat"><div className="stat-label">Streak</div><div className="stat-value num">{game.streak}</div></div>
        <div className="stat"><div className="stat-label">Right so far</div><div className="stat-value num">{game.correct} of {game.answered}</div></div>
      </div>

      {card.patient && <PatientBanner patient={card.patient} task={card.title} />}

      <Card title={card.title} action={<Tag tone="info">Is this correct?</Tag>}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(1rem, 2.2vw, 1.2rem)', lineHeight: 1.9, overflowWrap: 'anywhere' }} aria-label={`Card text: ${card.lines.join('. ')}`}>
          {card.lines.map((l, k) => <div key={k}><Highlighted line={l} wrong={card.error?.wrong} show={answered} /></div>)}
        </div>
        <p className="hint" style={{ marginTop: 10 }}>Check the spelling, capital letters, abbreviations, numbers, units and the allergy line. There is at most one mistake.</p>
      </Card>

      {!answered ? (
        <div className="row">
          <Button variant="primary" onClick={() => answer(false)} aria-keyshortcuts="Y">Correct <span className="hint" style={{ color: 'inherit', opacity: 0.85 }}>(Y)</span></Button>
          <Button variant="danger" onClick={() => answer(true)} aria-keyshortcuts="N">Has an error <span style={{ opacity: 0.85, fontSize: 13.5 }}>(N)</span></Button>
        </div>
      ) : (
        <div className="stack">
          <div className={`note ${right ? 'note-good' : 'note-bad'}`} role="status" style={{ fontSize: 15.5 }}>
            <b>{right ? `Right! +${points} points` : 'Not quite.'}</b>{' '}
            {card.error ? <Tag tone="warn">{CATEGORY_LABELS[card.error.category]}</Tag> : <Tag tone="good">No error</Tag>}
            <p style={{ marginTop: 6 }}>{card.explanation}</p>
            {card.error && <p style={{ marginTop: 6 }}><b>{card.error.category === 'allergy' ? 'What to do: ' : 'Should say: '}</b>{card.error.right}</p>}
          </div>
          <div className="row">
            <Button ref={nextRef} variant="primary" onClick={next}>{index === round.length - 1 ? 'See my score' : 'Next card →'}</Button>
          </div>
        </div>
      )}
    </>
  );
}
