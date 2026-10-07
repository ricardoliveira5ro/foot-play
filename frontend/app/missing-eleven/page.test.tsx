// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import MissingElevenPage from './page';
import { fetchRandomMatch, fetchFilterOptions } from '@/lib/api';
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
const mockReplace = vi.fn();
const mockPush = vi.fn();

function setUrl(query: string) {
  mockUseSearchParams.mockReturnValue(new URLSearchParams(query) as never);
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
    const { rerender } = render(<MissingElevenPage />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'New puzzle' })).toBeTruthy(),
    );
    const callsAfterMount = mockFetchRandomMatch.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThan(0);

    // 'daily=1' parses to the same empty filter set: the reducer no-op keeps
    // the canonical key — and therefore the fetch — unchanged.
    setUrl('daily=1');
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

  it('passes the current filters to the match fetch on Play again', async () => {
    setUrl('teamIds=7');
    await renderAndSettle();

    fireEvent.click(screen.getByRole('button', { name: 'New puzzle' }));

    await waitFor(() =>
      expect(mockFetchRandomMatch).toHaveBeenLastCalledWith(
        expect.objectContaining({ teamIds: [7] }),
      ),
    );
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
    mockFetchRandomMatch.mockResolvedValue(null);
    render(<MissingElevenPage />);

    await waitFor(() =>
      expect(screen.getByText('No playable matches are available.')).toBeTruthy(),
    );
    // null must not fall through to the generic network-error message.
    expect(screen.queryByText('Something went wrong.')).toBeNull();
  });

  it('renders an error when fetchRandomMatch throws', async () => {
    mockFetchRandomMatch.mockRejectedValue(new Error('Network down'));
    render(<MissingElevenPage />);

    await waitFor(() => expect(screen.getByText('Network down')).toBeTruthy());
    expect(screen.queryByText('No playable matches are available.')).toBeNull();
  });
});

describe('missing-eleven page filter panel', () => {
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

  const toggleButton = () => screen.getByRole('button', { name: /^Filters/ });
  const portoCheckbox = () => screen.getByRole('checkbox', { name: /FC Porto/ });

  beforeEach(() => {
    mockFetchFilterOptions.mockResolvedValue(clubOptions);
  });

  it('renders the filter panel toggle', async () => {
    await renderAndSettle();
    expect(toggleButton()).toHaveAttribute('aria-expanded', 'false');
    expect(toggleButton()).toHaveAttribute('aria-controls');
  });

  it('starts closed', async () => {
    await renderAndSettle();
    expect(toggleButton()).toHaveAttribute('aria-expanded', 'false');
    // The region stays mounted but hidden — queries skip hidden elements.
    expect(screen.queryByRole('region', { name: 'Filters' })).toBeNull();
  });

  it('opens and shows the Team and Opponent lists', async () => {
    const user = userEvent.setup();
    await renderAndSettle();

    await user.click(toggleButton());
    expect(toggleButton()).toHaveAttribute('aria-expanded', 'true');

    const region = screen.getByRole('region', { name: 'Filters' });
    expect(region).toBeVisible();
    expect(within(region).getByText('Team')).toBeTruthy();
    expect(within(region).getByText('Opponent')).toBeTruthy();
    await waitFor(() => {
      expect(within(region).getByRole('checkbox', { name: /FC Porto \(7\)/ })).toBeTruthy();
      expect(within(region).getByRole('checkbox', { name: /Nacional \(3\)/ })).toBeTruthy();
    });
  });

  it('applies a Team selection and refetches the match under the new filters', async () => {
    const user = userEvent.setup();
    await renderAndSettle();
    const callsBefore = mockFetchRandomMatch.mock.calls.length;

    await user.click(toggleButton());
    await waitFor(() => expect(portoCheckbox()).toBeTruthy());
    await user.click(portoCheckbox());
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    // Match the *sequence* after Apply: the URL re-sync on board remount can
    // legitimately refetch, but the new filter set must reach the match fetch.
    await waitFor(() => {
      const applied = mockFetchRandomMatch.mock.calls
        .slice(callsBefore)
        .some(([params]) => params?.teamIds?.[0] === 31);
      expect(applied).toBe(true);
    });
  });

  it('shows the new URL after applying', async () => {
    const user = userEvent.setup();
    await renderAndSettle();

    await user.click(toggleButton());
    await waitFor(() => expect(portoCheckbox()).toBeTruthy());
    await user.click(portoCheckbox());
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => {
      const hrefs = mockReplace.mock.calls.map(([href]) => String(href));
      expect(hrefs.some((href) => href.includes('teamIds=31'))).toBe(true);
    });
  });

  it('preserves the applied selection when the panel is reopened', async () => {
    const user = userEvent.setup();
    await renderAndSettle();

    await user.click(toggleButton());
    await waitFor(() => expect(portoCheckbox()).toBeTruthy());
    await user.click(portoCheckbox());
    // Keep the mocked URL in step with what router.replace will write, so the
    // board-remount read sees ?teamIds=31 instead of stripping it (in the real
    // app the router has already updated useSearchParams by then).
    setUrl('teamIds=31');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(toggleButton()).toHaveAttribute('aria-expanded', 'false'));
    await user.click(toggleButton());
    await waitFor(() => expect(portoCheckbox()).toBeChecked());
  });

  it('clears all filters and reloads the unfiltered match', async () => {
    const user = userEvent.setup();
    setUrl('teamIds=31');
    const { rerender } = await renderAndSettle();

    await user.click(toggleButton());
    await waitFor(() => expect(portoCheckbox()).toBeChecked());
    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    // router.replace('/missing-eleven') rewrote the URL; mirror it, then
    // re-render so the remounting FilterUrlSync reads the empty key.
    setUrl('');
    rerender(<MissingElevenPage />);

    await waitFor(() =>
      expect(mockFetchRandomMatch).toHaveBeenLastCalledWith(
        expect.objectContaining({ teamIds: null }),
      ),
    );
    const hrefs = mockReplace.mock.calls.map(([href]) => String(href));
    expect(hrefs).toContain('/missing-eleven');
  });

  it('does not fetch a new match when the user only edits the draft', async () => {
    const user = userEvent.setup();
    await renderAndSettle();
    const fetchesBefore = mockFetchRandomMatch.mock.calls.length;
    const replacesBefore = mockReplace.mock.calls.length;

    await user.click(toggleButton());
    await waitFor(() => expect(portoCheckbox()).toBeTruthy());
    await user.click(portoCheckbox());
    await user.type(screen.getByRole('searchbox', { name: 'Search Team' }), 'porto');

    // The draft differs from the applied set (Apply is armed), but nothing
    // beyond the panel may observe the edit — no fetch, no URL write.
    expect(screen.getByRole('button', { name: 'Apply' })).not.toBeDisabled();
    expect(mockFetchRandomMatch.mock.calls.length).toBe(fetchesBefore);
    expect(mockReplace.mock.calls.length).toBe(replacesBefore);
  });

  it('keeps the panel mounted across a filter change', async () => {
    const user = userEvent.setup();
    await renderAndSettle();

    await user.click(toggleButton());
    const search = await screen.findByRole('searchbox', { name: 'Search Team' });
    await user.type(search, 'porto');
    await waitFor(() => expect(portoCheckbox()).toBeTruthy());
    await user.click(portoCheckbox());
    setUrl('teamIds=31');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    // Apply flips the page through the loading branch; the panel must come
    // back with its search text and draft intact (shell, not board tree).
    await waitFor(() =>
      expect(mockFetchRandomMatch).toHaveBeenLastCalledWith(
        expect.objectContaining({ teamIds: [31] }),
      ),
    );
    await screen.findByRole('button', { name: 'New puzzle' });
    await user.click(toggleButton());

    expect(screen.getByRole('searchbox', { name: 'Search Team' })).toHaveValue('porto');
    await waitFor(() => expect(portoCheckbox()).toBeChecked());
  });
});
