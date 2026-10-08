// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import MissingElevenPage from './page';
import { fetchRandomMatch, fetchFilterOptions, fetchReveal } from '@/lib/api';
import type { GameResponse, LineupPlayer, FilterOptionsResponse } from '@/types';

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(),
  useRouter: vi.fn(),
  usePathname: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  fetchRandomMatch: vi.fn(),
  fetchFilterOptions: vi.fn(),
  submitGuess: vi.fn(),
  fetchReveal: vi.fn(),
  revealOnePlayer: vi.fn(),
}));

const mockUseSearchParams = vi.mocked(useSearchParams);
const mockUsePathname = vi.mocked(usePathname);
const mockUseRouter = vi.mocked(useRouter);
const mockFetchRandomMatch = vi.mocked(fetchRandomMatch);
const mockFetchFilterOptions = vi.mocked(fetchFilterOptions);
const mockFetchReveal = vi.mocked(fetchReveal);
const mockReplace = vi.fn();
const mockPush = vi.fn();

function setUrl(query: string) {
  mockUseSearchParams.mockReturnValue(new URLSearchParams(query) as never);
  // The gate reads window.location.search on mount, so the test location
  // must mirror the mocked params — in the real app the two are one thing.
  window.history.replaceState(null, '', query ? `/missing-eleven?${query}` : '/missing-eleven');
}

// Keep window.location (and the useSearchParams mock) in step with what
// router.replace writes, exactly as the real router does — the Start test
// asserts the D4-class ordering this produces.
function mirrorReplace() {
  mockReplace.mockImplementation((href: string) => {
    const url = new URL(href, 'http://localhost');
    setUrl(url.search.replace(/^\?/, ''));
  });
}

function player(token: string, nameLength = 5): LineupPlayer {
  return {
    token,
    nameLength,
    wordBoundaries: [],
    shirtNumber: 10,
    position: 'ST',
    coords: { x: 50, y: 50 },
    goals: 0,
    assists: 0,
    redCards: 0,
    isCaptain: false,
  };
}

function makeMatch(): GameResponse {
  return {
    game: {
      gameId: 1,
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
    homeLineup: [player('home-1'), player('home-2')],
    awayLineup: [player('away-1')],
  };
}

const emptyOptions: FilterOptionsResponse = {
  teams: [],
  opponents: [],
  competitions: [],
  seasons: [],
  total: 0,
};

// Shared by the panel and pre-screen describes: options with real counts.
const clubOptions: FilterOptionsResponse = {
  teams: [
    { id: 31, name: 'FC Porto', isNationalTeam: false, count: 7 },
    { id: 294, name: 'SL Benfica', isNationalTeam: false, count: 42 },
  ],
  opponents: [{ id: 5, name: 'Nacional', isNationalTeam: true, count: 3 }],
  competitions: [],
  seasons: [],
  total: 101,
};

beforeEach(() => {
  vi.clearAllMocks();
  setUrl('');
  mockUsePathname.mockReturnValue('/missing-eleven');
  mockUseRouter.mockReturnValue({ replace: mockReplace, push: mockPush, prefetch: vi.fn() } as never);
  mockFetchRandomMatch.mockResolvedValue(makeMatch());
  mockFetchFilterOptions.mockResolvedValue(emptyOptions);
});

async function renderAndSettle() {
  const utils = render(<MissingElevenPage />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'New puzzle' })).toBeTruthy());
  return utils;
}

/** Section headers read "Team" or "Team (2)" depending on the draft count. */
function sectionHeader(name: 'Team' | 'Opponent') {
  return screen.getByRole('button', { name: new RegExp(`^${name}( \\(\\d+\\))?$`) });
}

async function expandSection(
  user: ReturnType<typeof userEvent.setup>,
  ...names: Array<'Team' | 'Opponent'>
) {
  for (const name of names) {
    const header = sectionHeader(name);
    if (header.getAttribute('aria-expanded') !== 'true') await user.click(header);
  }
}

describe('missing-eleven page filter wiring', () => {
  it('loads a match for the filters in the URL on mount', async () => {
    setUrl('teamIds=7');
    render(<MissingElevenPage />);

    await waitFor(() =>
      expect(mockFetchRandomMatch).toHaveBeenLastCalledWith(
        expect.objectContaining({ teamIds: [7] }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'New puzzle' })).toBeTruthy(),
    );
  });

  it('fetches a new match when the applied filters change', async () => {
    setUrl('teamIds=7');
    const { rerender } = render(<MissingElevenPage />);
    await waitFor(() =>
      expect(mockFetchRandomMatch).toHaveBeenLastCalledWith(
        expect.objectContaining({ teamIds: [7] }),
      ),
    );

    setUrl('teamIds=9');
    rerender(<MissingElevenPage />);

    await waitFor(() =>
      expect(mockFetchRandomMatch).toHaveBeenLastCalledWith(
        expect.objectContaining({ teamIds: [9] }),
      ),
    );
  });

  it('does not fetch again when an equal filter set is re-dispatched', async () => {
    setUrl('teamIds=7');
    const { rerender } = render(<MissingElevenPage />);
    await waitFor(() =>
      expect(mockFetchRandomMatch).toHaveBeenLastCalledWith(
        expect.objectContaining({ teamIds: [7] }),
      ),
    );
    const callsAfterMount = mockFetchRandomMatch.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThan(0);

    // 'daily=1' is not a filter key: 'teamIds=7&daily=1' parses to the same
    // filter set — the reducer no-op keeps the canonical key, and therefore
    // the fetch, unchanged.
    setUrl('teamIds=7&daily=1');
    rerender(<MissingElevenPage />);

    expect(mockFetchRandomMatch.mock.calls.length).toBe(callsAfterMount);
  });

  it('does NOT strip a deep-linked filter from the URL on load', async () => {
    setUrl('teamIds=7');
    render(<MissingElevenPage />);

    await waitFor(() =>
      expect(mockFetchRandomMatch).toHaveBeenLastCalledWith(
        expect.objectContaining({ teamIds: [7] }),
      ),
    );
    // The read adopts ?teamIds=7; no write may ever drop it.
    for (const [href] of mockReplace.mock.calls) {
      expect(String(href)).toContain('teamIds=7');
    }
  });

  it('preserves an unrelated ?daily= param when rewriting', async () => {
    setUrl('teamIds=7&daily=1');
    render(<MissingElevenPage />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    const href = String(mockReplace.mock.calls[0][0]);
    expect(href).toContain('daily=1');
    expect(href).toContain('teamIds=7');
  });

  it('does not push a new history entry when filters change', async () => {
    setUrl('teamIds=7');
    const { rerender } = render(<MissingElevenPage />);
    await waitFor(() =>
      expect(mockFetchRandomMatch).toHaveBeenLastCalledWith(
        expect.objectContaining({ teamIds: [7] }),
      ),
    );

    setUrl('teamIds=9');
    rerender(<MissingElevenPage />);
    await waitFor(() =>
      expect(mockFetchRandomMatch).toHaveBeenLastCalledWith(
        expect.objectContaining({ teamIds: [9] }),
      ),
    );

    expect(mockPush).not.toHaveBeenCalled();
    for (const [, options] of mockReplace.mock.calls) {
      expect(options).toEqual({ scroll: false });
    }
  });

  it('New puzzle leaves the game for the pre-screen without fetching', async () => {
    const user = userEvent.setup();
    setUrl('teamIds=7');
    await renderAndSettle();
    // Deep links fetch twice by design of the branch layout: the gate starts
    // before FilterUrlSync's board-mount read lands the URL filters, so the
    // second (correctly filtered) fetch settles last — baseline after it.
    await waitFor(() =>
      expect(mockFetchRandomMatch).toHaveBeenLastCalledWith(
        expect.objectContaining({ teamIds: [7] }),
      ),
    );
    const callsBefore = mockFetchRandomMatch.mock.calls.length;

    await user.click(screen.getByRole('button', { name: 'New puzzle' }));

    // Back at the gate: URL cleared, no new match requested, and the panel
    // returns with the previous selection still applied, sections collapsed.
    expect(screen.getByRole('button', { name: 'Start game' })).toBeTruthy();
    expect(mockReplace).toHaveBeenCalledWith('/missing-eleven', { scroll: false });
    expect(mockFetchRandomMatch.mock.calls.length).toBe(callsBefore);
    expect(screen.getByRole('region', { name: 'Filters' })).toBeTruthy();
    expect(sectionHeader('Team')).toHaveTextContent('Team (1)');
    expect(sectionHeader('Team')).toHaveAttribute('aria-expanded', 'false');
  });

  it('passes the current filters to the match fetch on Retry', async () => {
    setUrl('teamIds=7');
    mockFetchRandomMatch.mockRejectedValueOnce(new Error('Network down'));
    render(<MissingElevenPage />);

    await waitFor(() => expect(screen.getByText('Network down')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() =>
      expect(mockFetchRandomMatch).toHaveBeenLastCalledWith(
        expect.objectContaining({ teamIds: [7] }),
      ),
    );
  });

  it('renders a neutral empty message when fetchRandomMatch resolves null', async () => {
    setUrl('teamIds=7'); // the gate needs a started URL; the contract is unchanged
    mockFetchRandomMatch.mockResolvedValue(null);
    render(<MissingElevenPage />);

    await waitFor(() =>
      expect(screen.getByText('No playable matches are available.')).toBeTruthy(),
    );
    // null must not fall through to the generic network-error message.
    expect(screen.queryByText('Something went wrong.')).toBeNull();
  });

  it('renders an error when fetchRandomMatch throws', async () => {
    setUrl('teamIds=7'); // the gate needs a started URL; the contract is unchanged
    mockFetchRandomMatch.mockRejectedValue(new Error('Network down'));
    render(<MissingElevenPage />);

    await waitFor(() => expect(screen.getByText('Network down')).toBeTruthy());
    expect(screen.queryByText('No playable matches are available.')).toBeNull();
  });
});

describe('missing-eleven page filter panel', () => {
  it('the running game has no filter panel at all', async () => {
    setUrl('daily=1');
    await renderAndSettle();
    // In-game there is no Filters toggle and no panel region: the only way
    // to the filter selection is New puzzle (or Play Again / Change filters,
    // which take the same route back to the pre-screen).
    expect(screen.queryByRole('button', { name: /^Filters/ })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Filters' })).toBeNull();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('Start after New puzzle fetches under the same filters', async () => {
    mirrorReplace();
    const user = userEvent.setup();
    setUrl('teamIds=7');
    await renderAndSettle();
    // See the wiring describe: deep links settle through two fetches (gate
    // first, FilterUrlSync's board-mount read second) — baseline after both.
    await waitFor(() =>
      expect(mockFetchRandomMatch).toHaveBeenLastCalledWith(
        expect.objectContaining({ teamIds: [7] }),
      ),
    );
    const callsBefore = mockFetchRandomMatch.mock.calls.length;

    await user.click(screen.getByRole('button', { name: 'New puzzle' }));
    expect(mockFetchRandomMatch.mock.calls.length).toBe(callsBefore);
    await user.click(screen.getByRole('button', { name: 'Start game' }));

    // The return re-arms the fetch-key ref: identical filters must fetch
    // again — without the reset this start would silently show nothing.
    await waitFor(() =>
      expect(mockFetchRandomMatch.mock.calls.length).toBe(callsBefore + 1),
    );
    expect(mockFetchRandomMatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ teamIds: [7] }),
    );
    await screen.findByRole('button', { name: 'New puzzle' });
    const hrefs = mockReplace.mock.calls.map(([href]) => String(href));
    expect(hrefs.at(-1)).toContain('teamIds=7');
  });

  it('Play Again from the game-complete overlay also returns to the pre-screen', async () => {
    mirrorReplace();
    mockFetchReveal.mockResolvedValue({ players: [] } as never);
    const user = userEvent.setup();
    setUrl('teamIds=7');
    await renderAndSettle();
    await waitFor(() =>
      expect(mockFetchRandomMatch).toHaveBeenLastCalledWith(
        expect.objectContaining({ teamIds: [7] }),
      ),
    );
    const callsBefore = mockFetchRandomMatch.mock.calls.length;

    await user.click(screen.getByRole('button', { name: 'Give up?' }));
    await user.click(screen.getByRole('button', { name: 'Are you sure?' }));
    await screen.findByRole('button', { name: 'Play Again' });
    expect(mockFetchRandomMatch.mock.calls.length).toBe(callsBefore);
    await user.click(screen.getByRole('button', { name: 'Play Again' }));

    expect(screen.getByRole('button', { name: 'Start game' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'New puzzle' })).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith('/missing-eleven', { scroll: false });
    expect(mockFetchRandomMatch.mock.calls.length).toBe(callsBefore);
  });

  it('the error state offers a way back to the filters', async () => {
    mirrorReplace();
    const user = userEvent.setup();
    setUrl('teamIds=7');
    mockFetchRandomMatch.mockRejectedValueOnce(new Error('Network down'));
    render(<MissingElevenPage />);
    await screen.findByText('Network down');

    await user.click(screen.getByRole('button', { name: 'Change filters' }));

    expect(screen.getByRole('button', { name: 'Start game' })).toBeTruthy();
    expect(screen.queryByText('Network down')).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith('/missing-eleven', { scroll: false });
    expect(mockFetchRandomMatch).toHaveBeenCalledTimes(1); // returning fetches nothing
  });
});

describe('missing-eleven pre-screen gate', () => {
  beforeEach(() => {
    mockFetchFilterOptions.mockResolvedValue(clubOptions);
  });

  it('renders the pre-screen on an empty URL and fetches no match', async () => {
    render(<MissingElevenPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Missing Eleven' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Choose your match' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start game' })).not.toBeDisabled();
    expect(screen.queryByRole('button', { name: 'New puzzle' })).toBeNull();
    expect(screen.queryByText('Loading puzzle…')).toBeNull();

    // Options still load on the pre-screen (Start with a pick needs them)…
    await waitFor(() => expect(mockFetchFilterOptions).toHaveBeenCalled());
    // …but the match itself must not be requested before Start.
    expect(mockFetchRandomMatch).not.toHaveBeenCalled();
  });

  it('forces the panel open with its toggle hidden and sections collapsed', async () => {
    render(<MissingElevenPage />);

    expect(screen.queryByRole('button', { name: /^Filters/ })).toBeNull();
    const region = screen.getByRole('region', { name: 'Filters' });
    expect(region).toBeVisible();
    // Collapsed on the pre-screen too: the first screen stays quiet, and
    // the footer (Start game) sits below the sections, always reachable.
    expect(sectionHeader('Team')).toHaveAttribute('aria-expanded', 'false');
    expect(sectionHeader('Opponent')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('checkbox', { name: /FC Porto/ })).toBeNull();

    const user = userEvent.setup();
    await expandSection(user, 'Team');
    await waitFor(() =>
      expect(within(region).getByRole('checkbox', { name: /FC Porto \(7\)/ })).toBeTruthy(),
    );
  });

  it('selected clubs appear as removable chips beside the section header', async () => {
    const user = userEvent.setup();
    render(<MissingElevenPage />);
    await expandSection(user, 'Team');
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /FC Porto \(7\)/ })).toBeTruthy());
    await user.click(screen.getByRole('checkbox', { name: /FC Porto \(7\)/ }));

    // The header carries the count AND the name with an X — the selection is
    // visible and undoable without finding the checkbox again. Draft-only:
    // no fetch and no URL write until Start game commits it.
    expect(sectionHeader('Team')).toHaveTextContent('Team (1)');
    const remove = screen.getByRole('button', { name: 'Remove FC Porto from Team' });
    expect(remove).toBeVisible();
    expect(mockFetchRandomMatch).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();

    await user.click(remove);

    expect(screen.queryByRole('button', { name: /Remove FC Porto/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Team' })).toBeTruthy();
    expect(mockFetchRandomMatch).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('starts the game: URL first, exactly one fetch, pre-screen gone', async () => {
    mirrorReplace();
    const user = userEvent.setup();
    render(<MissingElevenPage />);
    await expandSection(user, 'Team');
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /FC Porto \(7\)/ })).toBeTruthy());
    await user.click(screen.getByRole('checkbox', { name: /FC Porto \(7\)/ }));
    await user.click(screen.getByRole('button', { name: 'Start game' }));

    await waitFor(() => expect(mockFetchRandomMatch).toHaveBeenCalledTimes(1));
    expect(mockFetchRandomMatch).toHaveBeenCalledWith(
      expect.objectContaining({ teamIds: [31] }),
    );
    // D4-class ordering: the URL write lands before the board's fetch.
    expect(mockReplace.mock.invocationCallOrder[0]).toBeLessThan(
      mockFetchRandomMatch.mock.invocationCallOrder[0],
    );
    expect(String(mockReplace.mock.calls[0][0])).toContain('teamIds=31');

    await screen.findByRole('button', { name: 'New puzzle' });
    // Exactly one — the board-remount FilterUrlSync read was idempotent.
    expect(mockFetchRandomMatch).toHaveBeenCalledTimes(1);
    expect(mockReplace.mock.calls).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Start game' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Filters' })).toBeNull(); // panel closed in-game
  });

  it('starts with an empty draft: URL stays empty and one fetch still fires', async () => {
    mirrorReplace();
    const user = userEvent.setup();
    render(<MissingElevenPage />);

    await user.click(screen.getByRole('button', { name: 'Start game' }));

    await waitFor(() => expect(mockFetchRandomMatch).toHaveBeenCalledTimes(1));
    expect(mockReplace).toHaveBeenCalledWith('/missing-eleven', { scroll: false });
    await screen.findByRole('button', { name: 'New puzzle' });
    expect(mockFetchRandomMatch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Start game' })).toBeNull();
  });

  it('draft edits on the pre-screen start nothing', async () => {
    const user = userEvent.setup();
    render(<MissingElevenPage />);
    await expandSection(user, 'Team');
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /FC Porto \(7\)/ })).toBeTruthy());
    await user.click(screen.getByRole('checkbox', { name: /FC Porto \(7\)/ }));

    expect(screen.getByRole('button', { name: 'Start game' })).not.toBeDisabled();
    expect(mockFetchRandomMatch).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('Clear all on the pre-screen clears the draft without starting', async () => {
    const user = userEvent.setup();
    render(<MissingElevenPage />);
    await expandSection(user, 'Team');
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /FC Porto \(7\)/ })).toBeTruthy());
    await user.click(screen.getByRole('checkbox', { name: /FC Porto \(7\)/ }));
    await user.click(screen.getByRole('button', { name: 'Clear all' }));

    await waitFor(() => expect(screen.getByRole('checkbox', { name: /FC Porto \(7\)/ })).not.toBeChecked());
    expect(screen.getByRole('button', { name: 'Start game' })).toBeTruthy();
    expect(mockFetchRandomMatch).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('auto-starts a deep-linked URL with no pre-screen', async () => {
    setUrl('teamIds=7');
    render(<MissingElevenPage />);

    await waitFor(() =>
      expect(mockFetchRandomMatch).toHaveBeenLastCalledWith(
        expect.objectContaining({ teamIds: [7] }),
      ),
    );
    expect(screen.queryByRole('button', { name: 'Start game' })).toBeNull();
    await screen.findByRole('button', { name: 'New puzzle' });
  });
});
