// @vitest-environment jsdom
//
// Regression: the FilterUrlSync read↔write feedback loop.
//
// Next commits a client `router.replace` asynchronously, so the board — and
// FilterUrlSync with it — can mount while `useSearchParams` still reports the
// previous (empty) URL. The write effect used to depend on the URL key, so a
// URL change ran the write with the *previous* `applied` value and rewrote the
// address bar backwards; the read bounced it forward again, looping forever
// (observed as the same `GET /api/matches/random?…` repeating without end).
//
// page.test.tsx mirrors replace synchronously, which hides the race. This file
// models the async commit explicitly so the loop cannot regress.
import { StrictMode, useSyncExternalStore } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let store = new URLSearchParams('');
const listeners = new Set<() => void>();
const replacedHrefs: string[] = [];
let pendingCommit: ReturnType<typeof setTimeout> | null = null;

function commit(href: string) {
  const url = new URL(href, 'http://localhost');
  store = new URLSearchParams(url.search);
  window.history.replaceState(null, '', url.pathname + url.search);
  listeners.forEach((listener) => listener());
}

const mockReplace = vi.fn((href: string) => {
  replacedHrefs.push(String(href));
  if (pendingCommit) clearTimeout(pendingCommit);
  pendingCommit = setTimeout(() => commit(String(href)), 5);
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
  usePathname: () => '/missing-eleven',
  useSearchParams: () => useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => { listeners.delete(callback); };
    },
    () => store,
  ),
}));

function player(token: string) {
  return {
    token, nameLength: 5, wordBoundaries: [], shirtNumber: 10, position: 'ST',
    coords: { x: 50, y: 50 }, goals: 0, assists: 0, redCards: 0, isCaptain: false,
  };
}

function makeMatch() {
  return {
    game: {
      gameId: 1, date: '2024-01-01', season: '2019/20', competition: 'Test League',
      homeClub: { clubId: 294, name: 'SL Benfica' },
      awayClub: { clubId: 999, name: 'Unknown FC' },
      homeScore: 0, awayScore: 0,
    },
    homeLineup: [player('h1')],
    awayLineup: [player('a1')],
  };
}

vi.mock('@/lib/api', () => ({
  fetchRandomMatch: vi.fn(() => Promise.resolve(makeMatch())),
  fetchFilterOptions: vi.fn(() => Promise.resolve({ total: 5, seasons: [], competitions: [], teams: [] })),
  fetchReveal: vi.fn(() => Promise.resolve({ players: [] })),
  revealOnePlayer: vi.fn(),
  submitGuess: vi.fn(),
}));

import { fetchRandomMatch } from '@/lib/api';
import MissingElevenPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
  replacedHrefs.length = 0;
  if (pendingCommit) {
    clearTimeout(pendingCommit);
    pendingCommit = null;
  }
  store = new URLSearchParams('seasonFrom=2019&seasonTo=2019');
  window.history.replaceState(null, '', '/missing-eleven?seasonFrom=2019&seasonTo=2019');
});

describe('missing-eleven async URL commit', () => {
  it('a deep link settles without rewriting the URL back and forth', async () => {
    render(<StrictMode><MissingElevenPage /></StrictMode>);

    await screen.findByRole('button', { name: 'New puzzle' });
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Two fetches are expected (gate fetch, then the board-mount read adopts
    // the URL filters). A loop would keep climbing.
    expect((fetchRandomMatch as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThanOrEqual(3);
    expect(replacedHrefs).not.toContain('/missing-eleven');
  });

  it('New puzzle then Start does not loop the URL under identical filters', async () => {
    const user = userEvent.setup();
    render(<StrictMode><MissingElevenPage /></StrictMode>);
    await screen.findByRole('button', { name: 'New puzzle' });

    await user.click(screen.getByRole('button', { name: 'New puzzle' }));
    await screen.findByRole('button', { name: 'Start game' });

    (fetchRandomMatch as ReturnType<typeof vi.fn>).mockClear();
    replacedHrefs.length = 0;
    await user.click(screen.getByRole('button', { name: 'Start game' }));

    await waitFor(() => expect(fetchRandomMatch).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 200));

    // One start fetch; the loop produced eight or more and dozens of replaces.
    expect((fetchRandomMatch as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThanOrEqual(2);
    // Every write must target the applied filters — never the stripped URL.
    for (const href of replacedHrefs) {
      expect(href).toContain('seasonFrom=2019');
    }
  });

  it('pre-screen then Start with a season, under StrictMode, settles', async () => {
    // Start writes the URL, then flips `started`; the match resolves before
    // Next commits the client `router.replace`, so the board (and
    // FilterUrlSync) mounts while `useSearchParams` still reports the empty
    // pre-screen URL. Under StrictMode the read effect runs twice, and a
    // one-shot "first read" guard would let the second pass adopt that empty
    // URL, wipe the started filters, and bounce the URL forever. This is the
    // exact shape of the reported loop.
    store = new URLSearchParams('');
    window.history.replaceState(null, '', '/missing-eleven');

    const user = userEvent.setup();
    render(<StrictMode><MissingElevenPage /></StrictMode>);
    await screen.findByRole('button', { name: 'Start game' });

    const seasonHeader = screen.getByRole('button', { name: /^Season( \(\d+\))?$/ });
    if (seasonHeader.getAttribute('aria-expanded') !== 'true') await user.click(seasonHeader);
    fireEvent.change(screen.getByLabelText('Season from'), { target: { value: '2019' } });
    fireEvent.change(screen.getByLabelText('Season to'), { target: { value: '2019' } });

    (fetchRandomMatch as ReturnType<typeof vi.fn>).mockClear();
    replacedHrefs.length = 0;
    await user.click(screen.getByRole('button', { name: 'Start game' }));
    await new Promise((resolve) => setTimeout(resolve, 300));

    // One start fetch — no unfiltered/looped refetch.
    expect((fetchRandomMatch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    // No write may strip the URL back to the bare path.
    expect(replacedHrefs).not.toContain('/missing-eleven');
    for (const href of replacedHrefs) {
      expect(href).toContain('seasonFrom=2019&seasonTo=2019');
    }
  });
});
