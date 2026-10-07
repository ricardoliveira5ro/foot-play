// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
