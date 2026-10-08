// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useFilterOptions } from './useFilterOptions';
import { fetchFilterOptions } from '../../lib/api';
import type { FilterOptionsResponse, GameFilterParams } from '@/types';

vi.mock('../../lib/api', () => ({ fetchFilterOptions: vi.fn() }));

const mockFetchFilterOptions = vi.mocked(fetchFilterOptions);

const baseFilters: GameFilterParams = {
  teamIds: null,
  competitionIds: null,
  seasonFrom: null,
  seasonTo: null,
};

const sampleOptions: FilterOptionsResponse = {
  teams: [],
  competitions: [],
  seasons: [],
  total: 0,
};

function makeDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useFilterOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches once on mount with the given filters', async () => {
    const { promise, resolve } = makeDeferred<FilterOptionsResponse>();
    mockFetchFilterOptions.mockReturnValueOnce(promise);

    const { result } = renderHook(() => useFilterOptions(baseFilters));

    expect(result.current.loading).toBe(true);
    expect(result.current.options).toBeNull();
    expect(result.current.error).toBeNull();
    expect(mockFetchFilterOptions).toHaveBeenCalledTimes(1);
    expect(mockFetchFilterOptions).toHaveBeenCalledWith(baseFilters);

    resolve(sampleOptions);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.options).toEqual(sampleOptions);
    expect(result.current.error).toBeNull();
  });

  it('does not refetch when the filters are structurally equal', async () => {
    const { promise, resolve } = makeDeferred<FilterOptionsResponse>();
    mockFetchFilterOptions.mockReturnValueOnce(promise);

    const { result, rerender } = renderHook(({ filters }) => useFilterOptions(filters), {
      initialProps: { filters: baseFilters },
    });

    resolve(sampleOptions);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFetchFilterOptions).toHaveBeenCalledTimes(1);

    // Rerender with a new object but same values
    rerender({ filters: { ...baseFilters } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFetchFilterOptions).toHaveBeenCalledTimes(1);
    expect(result.current.options).toEqual(sampleOptions);
  });

  it('refetches when a filter genuinely changes', async () => {
    const first = makeDeferred<FilterOptionsResponse>();
    const second = makeDeferred<FilterOptionsResponse>();
    mockFetchFilterOptions.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(({ filters }) => useFilterOptions(filters), {
      initialProps: { filters: baseFilters },
    });

    first.resolve(sampleOptions);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFetchFilterOptions).toHaveBeenCalledTimes(1);

    const changedFilters: GameFilterParams = { ...baseFilters, teamIds: [1] };
    rerender({ filters: changedFilters });

    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(mockFetchFilterOptions).toHaveBeenCalledTimes(2);
    expect(mockFetchFilterOptions).toHaveBeenLastCalledWith(changedFilters);

    second.resolve({ ...sampleOptions, total: 5 });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.options).toEqual({ ...sampleOptions, total: 5 });
  });

  it('exposes loading true while in flight and false after', async () => {
    const { promise, resolve } = makeDeferred<FilterOptionsResponse>();
    mockFetchFilterOptions.mockReturnValueOnce(promise);

    const { result } = renderHook(() => useFilterOptions(baseFilters));

    expect(result.current.loading).toBe(true);
    resolve(sampleOptions);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('ignores a stale response that resolves after a newer request', async () => {
    const first = makeDeferred<FilterOptionsResponse>();
    const second = makeDeferred<FilterOptionsResponse>();
    mockFetchFilterOptions.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(({ filters }) => useFilterOptions(filters), {
      initialProps: { filters: baseFilters },
    });

    // Trigger second request
    const changedFilters: GameFilterParams = { ...baseFilters, teamIds: [1] };
    rerender({ filters: changedFilters });
    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(mockFetchFilterOptions).toHaveBeenCalledTimes(2);

    // Resolve second request first (newer), then first (stale)
    second.resolve({ ...sampleOptions, total: 10 });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.options).toEqual({ ...sampleOptions, total: 10 });

    first.resolve({ ...sampleOptions, total: 1 });
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Stale response should not overwrite newer state
    expect(result.current.options).toEqual({ ...sampleOptions, total: 10 });
    expect(result.current.error).toBeNull();
  });

  it('exposes an error without clearing previously loaded options', async () => {
    const first = makeDeferred<FilterOptionsResponse>();
    mockFetchFilterOptions.mockReturnValueOnce(first.promise);

    const { result, rerender } = renderHook(({ filters }) => useFilterOptions(filters), {
      initialProps: { filters: baseFilters },
    });

    first.resolve(sampleOptions);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.options).toEqual(sampleOptions);

    const second = makeDeferred<FilterOptionsResponse>();
    mockFetchFilterOptions.mockReturnValueOnce(second.promise);
    const changedFilters: GameFilterParams = { ...baseFilters, teamIds: [2] };
    rerender({ filters: changedFilters });

    await waitFor(() => expect(result.current.loading).toBe(true));
    second.reject(new Error('Network failed'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Network failed');
    // Options should remain as they were (not cleared)
    expect(result.current.options).toEqual(sampleOptions);
  });

  it('leaves options null before the first response', async () => {
    const { promise, resolve } = makeDeferred<FilterOptionsResponse>();
    mockFetchFilterOptions.mockReturnValueOnce(promise);

    const { result } = renderHook(() => useFilterOptions(baseFilters));

    expect(result.current.options).toBeNull();
    resolve(sampleOptions);
    await waitFor(() => expect(result.current.options).toEqual(sampleOptions));
  });

  it('does not convert a thrown error into empty counts', async () => {
    const { promise, reject } = makeDeferred<FilterOptionsResponse>();
    mockFetchFilterOptions.mockReturnValueOnce(promise);

    const { result } = renderHook(() => useFilterOptions(baseFilters));

    reject(new Error('Boom'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Boom');
    expect(result.current.options).toBeNull();
  });
});
