// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FilterEmptyState from './FilterEmptyState';
import { EMPTY_FILTERS, type GameFilterParams } from '@/types';

function filtersOf(overrides: Partial<GameFilterParams> = {}): GameFilterParams {
  return { ...EMPTY_FILTERS, ...overrides };
}

interface RenderOptions {
  filters?: GameFilterParams;
  invertedSeasonRange?: boolean;
  onClearAll?: () => void;
  onOpenFilters?: () => void;
}

function renderState(overrides: RenderOptions = {}) {
  const onClearAll = overrides.onClearAll ?? vi.fn();
  const onOpenFilters = overrides.onOpenFilters ?? vi.fn();
  const result = render(
    <FilterEmptyState
      filters={overrides.filters ?? filtersOf({ teamIds: [31] })}
      onClearAll={onClearAll}
      onOpenFilters={onOpenFilters}
      invertedSeasonRange={overrides.invertedSeasonRange ?? false}
    />,
  );
  return { ...result, onClearAll, onOpenFilters };
}

describe('FilterEmptyState', () => {
  it('is a status region so it is announced when it replaces the board', () => {
    renderState();
    const status = screen.getByRole('status');
    expect(status).toBeTruthy();
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('says the combination matched no games', () => {
    renderState();
    expect(screen.getByText(/combination/)).toBeTruthy();
  });

  it('does not blame any single filter', () => {
    renderState({ filters: filtersOf({ teamIds: [31], competitionIds: ['PL'], seasonFrom: 2020 }) });
    const body = screen.getByRole('status').textContent ?? '';
    expect(body).toContain('combination');
    expect(body).not.toMatch(/no games for/i);
    expect(body).not.toMatch(/Benfica/);
  });

  it('offers Clear all filters', () => {
    renderState();
    expect(screen.getByRole('button', { name: 'Clear all filters' })).toBeTruthy();
  });

  it('offers a way to reopen the filter panel', () => {
    renderState();
    expect(screen.getByRole('button', { name: 'Adjust filters' })).toBeTruthy();
  });

  it('calls onClearAll when Clear all is pressed', async () => {
    const user = userEvent.setup();
    const { onClearAll } = renderState();
    await user.click(screen.getByRole('button', { name: 'Clear all filters' }));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('calls onOpenFilters when the panel shortcut is pressed', async () => {
    const user = userEvent.setup();
    const { onOpenFilters } = renderState();
    await user.click(screen.getByRole('button', { name: 'Adjust filters' }));
    expect(onOpenFilters).toHaveBeenCalledTimes(1);
  });

  it('explains an inverted season range specifically', () => {
    renderState({ invertedSeasonRange: true });
    expect(screen.getByText(/season range starts after it ends/i)).toBeTruthy();
  });

  it('does not mention the season range otherwise', () => {
    renderState({ invertedSeasonRange: false });
    expect(screen.queryByText(/season range/i)).toBeNull();
  });

  it('says season filtering covers completed seasons only', () => {
    renderState();
    expect(screen.getByText(/completed seasons only/i)).toBeTruthy();
  });

  it('does not offer Clear all when no filter is active', () => {
    renderState({ filters: EMPTY_FILTERS });
    expect(screen.queryByRole('button', { name: 'Clear all filters' })).toBeNull();
  });
});
