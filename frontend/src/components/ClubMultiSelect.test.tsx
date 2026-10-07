// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClubMultiSelect from './ClubMultiSelect';
import type { ClubOption } from '@/lib/clubFilters';

const options: ClubOption[] = [
  { id: 294, name: 'SL Benfica', isNationalTeam: false, count: 42 },
  { id: 31, name: 'FC Porto', isNationalTeam: false, count: 7 },
  { id: 999, name: 'Independiente Medellín', isNationalTeam: false, count: 0 },
  { id: 5, name: 'Portugal', isNationalTeam: true, count: 3 },
];

interface RenderOptions {
  selected?: number[] | null;
  loading?: boolean;
  options?: ClubOption[];
  onToggle?: (id: number) => void;
  legend?: string;
}

function renderSelect(overrides: RenderOptions = {}) {
  const onToggle = overrides.onToggle ?? vi.fn();
  const result = render(
    <ClubMultiSelect
      legend={overrides.legend ?? 'Team'}
      inputIdPrefix="filter-team"
      options={overrides.options ?? options}
      selected={overrides.selected ?? null}
      onToggle={onToggle}
      loading={overrides.loading ?? false}
    />,
  );
  return { ...result, onToggle };
}

describe('ClubMultiSelect', () => {
  it('renders one checkbox per option with a real label', () => {
    renderSelect();
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(options.length);
    for (const option of options) {
      expect(screen.getByRole('checkbox', { name: `${option.name} (${option.count})` })).toBeTruthy();
    }
  });

  it('shows the count next to every option, including a zero count', () => {
    renderSelect();
    expect(screen.getByRole('checkbox', { name: 'SL Benfica (42)' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Independiente Medellín (0)' })).toBeTruthy();
  });

  it('keeps a zero-count option visible, enabled, and selectable', async () => {
    const user = userEvent.setup();
    const { onToggle } = renderSelect();
    const checkbox = screen.getByRole('checkbox', { name: 'Independiente Medellín (0)' });
    expect(checkbox).toBeEnabled();
    await user.click(checkbox);
    expect(onToggle).toHaveBeenCalledWith(999);
  });

  it('renders nothing for a zero-count option other than the 0 label', () => {
    renderSelect();
    const checkbox = screen.getByRole('checkbox', { name: 'Independiente Medellín (0)' });
    expect(checkbox).toBeEnabled();
    expect(checkbox).not.toHaveAttribute('aria-disabled');
    expect(checkbox).not.toHaveAttribute('disabled');
    expect(checkbox.closest('label')?.textContent?.trim()).toBe('Independiente Medellín (0)');
  });

  it('splits options into Clubs and National teams under two fieldsets', () => {
    renderSelect();
    const clubs = screen.getByRole('group', { name: 'Clubs' });
    const nationalTeams = screen.getByRole('group', { name: 'National teams' });
    expect(within(clubs).getAllByRole('checkbox')).toHaveLength(3);
    expect(within(nationalTeams).getAllByRole('checkbox')).toHaveLength(1);
  });

  it('checks the boxes for every selected id', () => {
    renderSelect({ selected: [31, 5] });
    expect(screen.getByRole('checkbox', { name: 'FC Porto (7)' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Portugal (3)' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'SL Benfica (42)' })).not.toBeChecked();
  });

  it('calls onToggle with the clicked id and nothing else', async () => {
    const user = userEvent.setup();
    const { onToggle } = renderSelect();
    await user.click(screen.getByRole('checkbox', { name: 'FC Porto (7)' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(31);
  });

  it('never disables a checkbox, whatever the count', () => {
    renderSelect();
    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).toBeEnabled();
    }
  });

  it('filters by the search box and does not clear the selection', async () => {
    const user = userEvent.setup();
    renderSelect({ selected: [294] });
    await user.type(screen.getByRole('searchbox'), 'benfi');

    const only = await screen.findByRole('checkbox', { name: 'SL Benfica (42)' });
    expect(only).toBeChecked();
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  });

  it('restores the full list when the search box is cleared', async () => {
    const user = userEvent.setup();
    renderSelect({ selected: [294] });
    await user.type(screen.getByRole('searchbox'), 'benfi');
    await screen.findByRole('checkbox', { name: 'SL Benfica (42)' });

    await user.click(screen.getByRole('button', { name: 'Clear search' }));

    expect(screen.getAllByRole('checkbox')).toHaveLength(options.length);
    expect(screen.getByRole('checkbox', { name: 'SL Benfica (42)' })).toBeChecked();
  });

  it('shows an explicit empty message when the search matches nothing', async () => {
    const user = userEvent.setup();
    renderSelect();
    await user.type(screen.getByRole('searchbox'), 'zzzz-no-club');

    expect(await screen.findByText(/No clubs match/)).toBeTruthy();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    // The search box and the escape hatch must survive a no-match view.
    expect(screen.getByRole('searchbox')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeTruthy();
  });

  it('shows a loading state and no checkboxes while options are loading', () => {
    renderSelect({ loading: true, options: [] });
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('gives every checkbox a unique, stable id', () => {
    const { rerender } = renderSelect();
    const ids = screen.getAllByRole('checkbox').map((cb) => cb.id);
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);

    rerender(
      <ClubMultiSelect
        legend="Team"
        inputIdPrefix="filter-team"
        options={options}
        selected={null}
        onToggle={vi.fn()}
        loading={false}
      />,
    );
    expect(screen.getAllByRole('checkbox').map((cb) => cb.id)).toEqual(ids);
  });

  it('exposes the legend as the fieldset accessible name', () => {
    renderSelect({ legend: 'Opponent' });
    expect(screen.getByRole('group', { name: 'Opponent' })).toBeTruthy();
  });

  it('is reachable by getByRole with an accessible name', () => {
    renderSelect({ legend: 'Team' });
    expect(screen.getByRole('group', { name: 'Team' })).toBeTruthy();
    expect(screen.getByRole('searchbox', { name: /Search Team/ })).toBeTruthy();
  });

  it('uses a stable id namespace so two lists on one page cannot collide', () => {
    render(
      <>
        <ClubMultiSelect legend="Team" inputIdPrefix="filter-team" options={options} selected={null} onToggle={vi.fn()} loading={false} />
        <ClubMultiSelect legend="Opponent" inputIdPrefix="filter-opponent" options={options} selected={null} onToggle={vi.fn()} loading={false} />
      </>,
    );
    const ids = screen.getAllByRole('checkbox').map((cb) => cb.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id.startsWith('filter-team-')).length).toBe(options.length);
    expect(ids.filter((id) => id.startsWith('filter-opponent-')).length).toBe(options.length);
  });
});
