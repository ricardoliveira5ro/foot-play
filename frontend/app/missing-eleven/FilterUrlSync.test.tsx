// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Suspense, type ReactElement } from 'react';
import FilterUrlSync from './FilterUrlSync';
import { EMPTY_FILTERS } from '@/types';
import type { GameFilterParams } from '@/types';
import { FILTER_PARAM_KEYS } from '@/lib/filterParams';

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

const onDaily = vi.fn();
const onReady = vi.fn();

/**
 * The pre-existing cases use `daily=1` as an opaque "unrelated" param. Now that
 * the component owns `daily`, the harness keeps the requested key active by
 * default so those cases still exercise filter preservation rather than daily
 * cleanup. Daily-specific cases pass `daily` explicitly.
 */
function currentUrlDaily(): string | null {
  return mockUseSearchParams().get('daily');
}

interface HarnessProps {
  applied: GameFilterParams;
  onFilters: (filters: GameFilterParams) => void;
  daily?: string | null;
  onDaily?: (key: string | null) => void;
  onReady?: () => void;
}

function Harness({
  applied,
  onFilters,
  daily = currentUrlDaily(),
  onDaily: handleDaily = onDaily,
  onReady: handleReady = onReady,
}: HarnessProps): ReactElement {
  return (
    <Suspense fallback={null}>
      <FilterUrlSync
        applied={applied}
        onFilters={onFilters}
        daily={daily}
        onDaily={handleDaily}
        onReady={handleReady}
      />
    </Suspense>
  );
}

interface RenderOverrides {
  daily?: string | null;
  onDaily?: (key: string | null) => void;
  onReady?: () => void;
}

function renderSync(
  applied: GameFilterParams,
  onFilters = vi.fn(),
  overrides: RenderOverrides = {},
) {
  const utils = render(<Harness applied={applied} onFilters={onFilters} {...overrides} />);
  return { ...utils, onFilters };
}

beforeEach(() => {
  vi.clearAllMocks();
  onDaily.mockClear();
  onReady.mockClear();
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
    rerender(<Harness applied={makeFilters()} onFilters={onFilters} />);

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
    rerender(<Harness applied={makeFilters({ teamIds: [7] })} onFilters={onFilters} />);

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/missing-eleven?teamIds=7', { scroll: false }),
    );
  });

  it('preserves an unrelated ?daily= param when writing', async () => {
    setUrl('daily=1');
    const { rerender } = renderSync(makeFilters());

    rerender(<Harness applied={makeFilters({ teamIds: [7] })} onFilters={vi.fn()} />);

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
    rerender(<Harness applied={makeFilters()} onFilters={vi.fn()} />);

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

    rerender(<Harness applied={makeFilters({ teamIds: [7] })} onFilters={vi.fn()} />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    const href = mockReplace.mock.calls[0][0] as string;
    expect(href).not.toContain('opponentIds');
    expect(href).toContain('daily=1');
    expect(href).toContain('teamIds=7');
  });

  it('calls router.replace, not router.push, with scroll disabled', async () => {
    setUrl('');
    const { rerender } = renderSync(makeFilters());

    rerender(<Harness applied={makeFilters({ teamIds: [7] })} onFilters={vi.fn()} />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    expect(mockReplace).toHaveBeenCalledWith(expect.any(String), { scroll: false });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not navigate when the URL is already canonical', () => {
    setUrl('teamIds=7');
    const { rerender } = renderSync(makeFilters({ teamIds: [7] }));

    // Equal-but-new object: the write effect re-runs but must early-return.
    rerender(<Harness applied={makeFilters({ teamIds: [7] })} onFilters={vi.fn()} />);

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('reports the daily key from the URL', async () => {
    setUrl('daily=2026-01-01');
    renderSync(EMPTY_FILTERS, vi.fn(), { daily: null });
    await waitFor(() => expect(onDaily).toHaveBeenCalledWith('2026-01-01'));
  });

  it('reports a null daily key when the param is absent', async () => {
    setUrl('');
    renderSync(EMPTY_FILTERS, vi.fn(), { daily: null });
    await waitFor(() => expect(onDaily).toHaveBeenCalledWith(null));
  });

  it('reports a null daily key for a malformed date', async () => {
    setUrl('daily=2026-02-30');
    renderSync(EMPTY_FILTERS, vi.fn(), { daily: null });
    await waitFor(() => expect(onDaily).toHaveBeenCalledWith(null));
  });

  it('writes ?daily= into the URL when a daily is requested', async () => {
    setUrl('');
    const onFilters = vi.fn();
    const { rerender } = renderSync(EMPTY_FILTERS, onFilters, { daily: null });
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    rerender(<Harness applied={EMPTY_FILTERS} onFilters={onFilters} daily="2026-01-01" />);

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/missing-eleven?daily=2026-01-01', { scroll: false }),
    );
  });

  it('removes ?daily= from the URL when the daily is left', async () => {
    setUrl('daily=2026-01-01');
    const onFilters = vi.fn();
    const { rerender } = renderSync(EMPTY_FILTERS, onFilters, { daily: '2026-01-01' });
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    rerender(<Harness applied={EMPTY_FILTERS} onFilters={onFilters} daily={null} />);

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/missing-eleven', { scroll: false }),
    );
  });

  it('preserves ?daily= when filters are rewritten', async () => {
    setUrl('daily=2026-01-01');
    const onFilters = vi.fn();
    const { rerender } = renderSync(EMPTY_FILTERS, onFilters, { daily: '2026-01-01' });

    rerender(
      <Harness
        applied={{ ...EMPTY_FILTERS, seasonFrom: 2020 }}
        onFilters={onFilters}
        daily="2026-01-01"
      />,
    );

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    const href = String(mockReplace.mock.calls.at(-1)![0]);
    expect(href).toContain('daily=2026-01-01');
    expect(href).toContain('seasonFrom=2020');
  });

  it('keeps ?daily= out of FILTER_PARAM_KEYS', () => {
    expect(FILTER_PARAM_KEYS).not.toContain('daily');
  });

  it('does not write to the URL before the first read', () => {
    // The readyRef gate must survive the daily addition.
    setUrl('daily=2026-01-01&teamIds=7');
    renderSync(EMPTY_FILTERS, vi.fn(), { daily: null });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('calls onReady exactly once per query string', async () => {
    setUrl('daily=2026-01-01');
    const onFilters = vi.fn();
    const { rerender } = renderSync(EMPTY_FILTERS, onFilters, { daily: null });
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    rerender(
      <Harness
        applied={{ ...EMPTY_FILTERS, seasonFrom: 2020 }}
        onFilters={onFilters}
        daily={null}
      />,
    );

    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('fires onReady after reporting filters and daily', async () => {
    setUrl('daily=2026-01-01&teamIds=7');
    const order: string[] = [];
    const onFilters = vi.fn(() => order.push('filters'));
    const handleDaily = vi.fn(() => order.push('daily'));
    const handleReady = vi.fn(() => order.push('ready'));

    renderSync(EMPTY_FILTERS, onFilters, {
      daily: null,
      onDaily: handleDaily,
      onReady: handleReady,
    });

    await waitFor(() => expect(handleReady).toHaveBeenCalledTimes(1));
    expect(order).toEqual(['filters', 'daily', 'ready']);
  });
});
