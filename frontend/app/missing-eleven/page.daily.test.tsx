// @vitest-environment jsdom
//
// Daily-mode wiring for the missing-eleven page, adapted to the real page
// architecture: an empty URL is the pre-screen (no fetch), any params start
// the board, and FilterUrlSync is the only URL reader. The page must not load
// a random match on the first commit of a ?daily= deep link — it waits for
// FilterUrlSync's onReady so the daily mode is known before the single
// mode-aware load effect runs.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MissingElevenPage from './page';
import { toDailyKey } from '@/lib/daily';
import type { GameResponse, LineupPlayer } from '@/types';

// Today is frozen so `?daily=<today>` is a fixed string and the suite cannot
// flake across a real 00:00:00 UTC rollover. `shouldAdvanceTime` keeps real
// time flowing underneath, so RTL's waitFor and React's scheduler both work
// while `Date` is pinned.
const TODAY = '2026-01-01';
const EXPIRED = '2020-01-01';

const search = vi.hoisted(() => ({ current: '' }));
const randomMock = vi.hoisted(() => vi.fn());
const dailyMock = vi.hoisted(() => vi.fn());
const lineupMock = vi.hoisted(() => vi.fn());
const optionsMock = vi.hoisted(() => vi.fn());
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search.current),
  useRouter: () => router,
  usePathname: () => '/missing-eleven',
}));

vi.mock('@/lib/api', () => ({
  fetchRandomMatch: randomMock,
  fetchDailyMatch: dailyMock,
  fetchLineup: lineupMock,
  fetchFilterOptions: optionsMock,
  submitGuess: vi.fn(),
  fetchReveal: vi.fn().mockResolvedValue({ players: [] }),
  revealOnePlayer: vi.fn().mockResolvedValue({ name: 'Someone' }),
}));

// The board and the score counter are irrelevant to every assertion here and
// would each need a full shirt fixture; the match *id* is the only thing the
// tests care about, so MatchInfo surfaces it and the rest render nothing.
vi.mock('@/components/MatchInfo', () => ({
  default: ({ match }: { match: { gameId: number } }) => <p>game {match.gameId}</p>,
}));
vi.mock('@/components/TacticBoard', () => ({ default: () => <p>tactic board</p> }));
vi.mock('@/components/WordleModal', () => ({ default: () => null }));
vi.mock('@/components/ScoreCounter', () => ({ default: () => null }));
vi.mock('@/components/GameComplete', () => ({
  default: ({ onPlayAgain }: { onPlayAgain: () => void }) => (
    <div>
      <p>complete</p>
      <button type="button" onClick={onPlayAgain}>Play Again</button>
    </div>
  ),
}));

function player(token: string): LineupPlayer {
  return {
    token,
    nameLength: 5,
    wordBoundaries: [],
    shirtNumber: 10,
    position: 'ST',
    coords: { x: 50, y: 50 },
    goals: 0,
    assists: 0,
    redCards: 0,
    isCaptain: false,
    hasFirstLetter: true,
  };
}

function matchResponse(gameId: number): GameResponse {
  return {
    game: {
      gameId,
      date: '2024-01-01',
      season: '2023/24',
      competition: 'Test League',
      homeClub: { clubId: 294, name: 'SL Benfica' },
      awayClub: { clubId: 999, name: 'Unknown FC' },
      homeScore: 0,
      awayScore: 0,
      homeFormation: '4-3-3',
      awayFormation: '4-4-2',
    },
    homeLineup: [player('home-1')],
    awayLineup: [player('away-1')],
  };
}

function elevenPlayers(prefix: string): LineupPlayer[] {
  return Array.from({ length: 11 }, (_, index) => player(`${prefix}-${index + 1}`));
}

function preview(prefix: string): LineupPlayer[] {
  return elevenPlayers(prefix).map(({ position, coords, shirtNumber }) => ({
    ...player(`${prefix}-preview`),
    position,
    coords,
    shirtNumber,
  }));
}

function dailyPreviewResponse(gameId: number): GameResponse {
  return {
    ...matchResponse(gameId),
    homeLineup: [],
    awayLineup: [],
    homePreview: preview('home'),
    awayPreview: preview('away'),
  };
}

const options = {
  teams: [],
  competitions: [],
  seasons: [],
  total: 5,
};

/** Keep the mocked URL and window.location in step, as the real app does. */
function setSearch(query: string) {
  search.current = query;
  window.history.replaceState(null, '', query ? `/missing-eleven?${query}` : '/missing-eleven');
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
  setSearch('');
  randomMock.mockReset();
  dailyMock.mockReset();
  lineupMock.mockReset();
  optionsMock.mockReset();
  router.replace.mockReset();
  router.push.mockReset();
  // Every test that does not care about the fetch path still needs it to settle.
  randomMock.mockResolvedValue(matchResponse(7));
  dailyMock.mockResolvedValue(dailyPreviewResponse(104));
  lineupMock.mockImplementation((_gameId: number, side: 'home' | 'away') =>
    Promise.resolve(elevenPlayers(side)),
  );
  optionsMock.mockResolvedValue(options);
});

afterEach(() => {
  vi.useRealTimers();
});

// A guard on the guard: if the frozen clock ever drifts from the real
// `toDailyKey` contract these tests are testing the wrong thing.
it('the frozen clock really is the day key the page will compute', () => {
  expect(toDailyKey(new Date())).toBe(TODAY);
});

describe('daily mode', () => {
  it('loads the daily puzzle for ?daily=<today> and does NOT call fetchRandomMatch', async () => {
    setSearch(`daily=${TODAY}`);
    render(<MissingElevenPage />);

    await waitFor(() => expect(dailyMock).toHaveBeenCalledTimes(1));
    expect(dailyMock).toHaveBeenCalledWith(TODAY);
    expect(randomMock).not.toHaveBeenCalled();
    expect(await screen.findByText('game 104')).toBeInTheDocument();
  });

  it('loads only the target XI with Normal clues and defers the opponent', async () => {
    setSearch(`daily=${TODAY}`);
    render(<MissingElevenPage />);

    await waitFor(() => expect(lineupMock).toHaveBeenCalledWith(104, 'home', 'normal'));
    expect(await screen.findByText('game 104')).toBeInTheDocument();
    expect(lineupMock).not.toHaveBeenCalledWith(104, 'away', expect.anything());
  });

  it('starts the daily in Normal even when Expert was selected on the pre-screen', async () => {
    render(<MissingElevenPage />);
    await screen.findByRole('button', { name: /daily puzzle/i });

    fireEvent.click(screen.getByRole('button', { name: /expert/i }));
    fireEvent.click(screen.getByRole('button', { name: /daily puzzle/i }));

    await waitFor(() => expect(lineupMock).toHaveBeenCalledWith(104, 'home', 'normal'));
    expect(lineupMock).not.toHaveBeenCalledWith(104, 'home', 'expert');
  });

  it('does not fetch a random match first on a ?daily= deep link (no flash of the wrong puzzle)', async () => {
    setSearch(`daily=${TODAY}`);
    render(<MissingElevenPage />);

    // The urlReady gate is what prevents the first commit from seeing
    // `isDaily === false` and fetching a random match. RTL flushes effects, so
    // the daily fetch may already have settled here; the random fetch must
    // never happen at all.
    expect(randomMock).not.toHaveBeenCalled();

    await waitFor(() => expect(dailyMock).toHaveBeenCalledTimes(1));
    expect(randomMock).not.toHaveBeenCalled();
  });

  it('ignores filter params when in daily mode (§6.2)', async () => {
    setSearch(`daily=${TODAY}`);
    const view = render(<MissingElevenPage />);
    await screen.findByText('game 104');

    setSearch(`daily=${TODAY}&seasonFrom=2020`);
    view.rerender(<MissingElevenPage />);

    // The filter change is reported by FilterUrlSync; nothing may refetch.
    await waitFor(() => expect(screen.getByText('game 104')).toBeInTheDocument());
    expect(randomMock).not.toHaveBeenCalled();
    expect(dailyMock).toHaveBeenCalledTimes(1);
  });

  it('renders the error branch for an expired daily link and never calls fetchDailyMatch', async () => {
    setSearch(`daily=${EXPIRED}`);
    render(<MissingElevenPage />);

    expect(await screen.findByText(/no longer available/i)).toBeInTheDocument();
    expect(screen.queryByText('tactic board')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(dailyMock).not.toHaveBeenCalled();
  });

  it('Try again on an expired ?daily= link leaves daily mode and loads a random match', async () => {
    setSearch(`daily=${EXPIRED}`);
    render(<MissingElevenPage />);
    await screen.findByText(/no longer available/i);

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => expect(randomMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('game 7')).toBeInTheDocument();
    expect(dailyMock).not.toHaveBeenCalled();
  });

  it('Try again after a daily fetch failure retries the SAME daily game', async () => {
    setSearch(`daily=${TODAY}`);
    dailyMock.mockReset();
    dailyMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(matchResponse(104));
    render(<MissingElevenPage />);

    expect(await screen.findByText('boom')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => expect(screen.getByText('game 104')).toBeInTheDocument());
    expect(dailyMock).toHaveBeenCalledTimes(2);
    expect(dailyMock).toHaveBeenNthCalledWith(1, TODAY);
    expect(dailyMock).toHaveBeenNthCalledWith(2, TODAY);
  });

  it('renders the daily entry on the pre-screen once today is known', async () => {
    // The first-paint absence is covered by page.hydration.test.tsx, which
    // renders the server HTML before any effect has run.
    render(<MissingElevenPage />);
    expect(await screen.findByRole('button', { name: /daily puzzle/i })).toBeInTheDocument();
  });

  it('starts the daily puzzle from the pre-screen entry button', async () => {
    render(<MissingElevenPage />);
    const entry = await screen.findByRole('button', { name: /daily puzzle/i });

    fireEvent.click(entry);

    await waitFor(() => expect(dailyMock).toHaveBeenCalledWith(TODAY));
    expect(await screen.findByText('game 104')).toBeInTheDocument();
    expect(randomMock).not.toHaveBeenCalled();
    const hrefs = router.replace.mock.calls.map(([href]) => String(href));
    expect(hrefs.some((href) => href.includes(`daily=${TODAY}`))).toBe(true);
  });

  it('"New puzzle" from daily returns to the pre-screen and clears daily mode', async () => {
    setSearch(`daily=${TODAY}`);
    render(<MissingElevenPage />);
    await screen.findByText('game 104');

    fireEvent.click(screen.getByRole('button', { name: /new puzzle/i }));

    // Back at the gate: the daily is gone, no ordinary match was fetched.
    expect(await screen.findByRole('button', { name: 'Start game' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new puzzle/i })).not.toBeInTheDocument();
    expect(dailyMock).toHaveBeenCalledTimes(1);
    expect(randomMock).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/missing-eleven', { scroll: false });
  });
});
