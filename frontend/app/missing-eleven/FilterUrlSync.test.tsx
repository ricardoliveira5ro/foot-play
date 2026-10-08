// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import FilterUrlSync from './FilterUrlSync';
import { EMPTY_FILTERS } from '@/types';
import type { GameFilterParams } from '@/types';

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(),
  useRouter: vi.fn(),
  usePathname: vi.fn(),
}));

const mockUseSearchParams = vi.mocked(useSearchParams);
const mockReplace = vi.fn();
const mockPush = vi.fn();

function setUrl(query: string) {
  mockUseSearchParams.mockReturnValue(new URLSearchParams(query) as never);
}

function makeFilters(overrides: Partial<GameFilterParams> = {}): GameFilterParams {
  return { ...EMPTY_FILTERS, ...overrides };
}

function renderSync(applied: GameFilterParams, onFilters = vi.fn()) {
  const utils = render(<FilterUrlSync applied={applied} onFilters={onFilters} />);
  return { ...utils, onFilters };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSearchParams.mockReturnValue(new URLSearchParams() as never);
  mockUsePathname.mockReturnValue('/missing-eleven');
  mockUseRouter.mockReturnValue({ replace: mockReplace, push: mockPush, prefetch: vi.fn() } as never);
});
const mockUsePathname = vi.mocked(usePathname);
const mockUseRouter = vi.mocked(useRouter);

describe('FilterUrlSync', () => {
  it('renders nothing', () => {
    const { container } = renderSync(makeFilters());
    expect(container.innerHTML).toBe('');
  });

  it('parses the URL into filters and reports them once', () => {
    setUrl('teamIds=7&seasonFrom=2020&seasonTo=2022');
    const { onFilters } = renderSync(makeFilters());

    expect(onFilters).toHaveBeenCalledTimes(1);
    expect(onFilters).toHaveBeenCalledWith({
      teamIds: [7],
      competitionIds: null,
      seasonFrom: 2020,
      seasonTo: 2022,
    });
  });

  it('reports EMPTY_FILTERS for an empty query string', () => {
    const { onFilters } = renderSync(makeFilters());
    expect(onFilters).toHaveBeenCalledWith(EMPTY_FILTERS);
  });

  it('re-reports when the URL changes', () => {
    setUrl('teamIds=7');
    const { onFilters, rerender } = renderSync(makeFilters());

    setUrl('teamIds=9');
    rerender(<FilterUrlSync applied={makeFilters()} onFilters={onFilters} />);

    expect(onFilters).toHaveBeenCalledTimes(2);
    expect(onFilters).toHaveBeenLastCalledWith(makeFilters({ teamIds: [9] }));
  });

  it('does not write to the URL on the first pass', () => {
    // Deep link: the read must adopt ?teamIds=7 before any write can run,
    // otherwise the address bar is stripped before the dispatch re-renders.
    setUrl('teamIds=7');
    renderSync(makeFilters());

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('writes applied filters to the URL once they are reported', async () => {
    setUrl('');
    const onFilters = vi.fn();
    const { rerender } = renderSync(makeFilters(), onFilters);

    // Simulate the page dispatching and applying a filter set.
    rerender(<FilterUrlSync applied={makeFilters({ teamIds: [7] })} onFilters={onFilters} />);

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/missing-eleven?teamIds=7', { scroll: false }),
    );
  });

  it('preserves an unrelated ?daily= param when writing', async () => {
    setUrl('daily=1');
    const { rerender } = renderSync(makeFilters());

    rerender(<FilterUrlSync applied={makeFilters({ teamIds: [7] })} onFilters={vi.fn()} />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    const href = mockReplace.mock.calls[0][0] as string;
    expect(href).toContain('daily=1');
    expect(href).toContain('teamIds=7');
  });

  it('removes a filter key entirely when its dimension is cleared', async () => {
    setUrl('teamIds=7&daily=1');
    const { rerender } = renderSync(makeFilters({ teamIds: [7] }));

    // Clearing: applied filters no longer include teamIds, so the key must be
    // dropped rather than left behind as ?teamIds=.
    rerender(<FilterUrlSync applied={makeFilters()} onFilters={vi.fn()} />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    const href = mockReplace.mock.calls[0][0] as string;
    expect(href).not.toContain('teamIds');
    expect(href).toContain('daily=1');
  });

  it('strips a legacy opponentIds param when writing', async () => {
    // Bookmarks from before the Opponent dimension was removed still carry
    // the key; the first canonical write must drop it, not preserve it as an
    // unknown param.
    setUrl('opponentIds=5&daily=1');
    const { rerender } = renderSync(makeFilters());

    rerender(<FilterUrlSync applied={makeFilters({ teamIds: [7] })} onFilters={vi.fn()} />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    const href = mockReplace.mock.calls[0][0] as string;
    expect(href).not.toContain('opponentIds');
    expect(href).toContain('daily=1');
    expect(href).toContain('teamIds=7');
  });

  it('calls router.replace, not router.push, with scroll disabled', async () => {
    setUrl('');
    const { rerender } = renderSync(makeFilters());

    rerender(<FilterUrlSync applied={makeFilters({ teamIds: [7] })} onFilters={vi.fn()} />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    expect(mockReplace).toHaveBeenCalledWith(expect.any(String), { scroll: false });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not navigate when the URL is already canonical', () => {
    setUrl('teamIds=7');
    const { rerender } = renderSync(makeFilters({ teamIds: [7] }));

    // Equal-but-new object: the write effect re-runs but must early-return.
    rerender(<FilterUrlSync applied={makeFilters({ teamIds: [7] })} onFilters={vi.fn()} />);

    expect(mockReplace).not.toHaveBeenCalled();
  });
});
