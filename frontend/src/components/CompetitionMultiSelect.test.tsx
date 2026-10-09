// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CompetitionMultiSelect from './CompetitionMultiSelect';
import type { CompetitionOption } from '@/lib/competitionFilters';

const options: CompetitionOption[] = [
  { id: 'PL', name: 'Premier League', count: 120 },
  { id: 'LL', name: 'La Liga', count: 80 },
  { id: 'SM', name: 'Small Cup', count: 0 },
];

interface RenderOptions {
  selected?: string[] | null;
  loading?: boolean;
  options?: CompetitionOption[];
  onToggle?: (id: string) => void;
}

function renderSelect(overrides: RenderOptions = {}) {
  const onToggle = overrides.onToggle ?? vi.fn();
  const result = render(
    <CompetitionMultiSelect
      options={overrides.options ?? options}
      selected={overrides.selected ?? null}
      onToggle={onToggle}
      loading={overrides.loading ?? false}
    />,
  );
  return { ...result, onToggle };
}

function labels(): string[] {
  return screen.getAllByRole('checkbox').map((cb) => cb.closest('label')?.textContent?.trim() ?? '');
}

describe('CompetitionMultiSelect', () => {
  it('renders one checkbox per competition with a real label', () => {
    renderSelect();
    expect(screen.getAllByRole('checkbox')).toHaveLength(options.length);
    for (const option of options) {
      expect(screen.getByRole('checkbox', { name: `${option.name} (${option.count})` })).toBeTruthy();
    }
  });

  it('shows the count next to every competition', () => {
    renderSelect();
    expect(screen.getByRole('checkbox', { name: 'Premier League (120)' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Small Cup (0)' })).toBeTruthy();
  });

  it('keeps a zero-count competition visible, enabled, and selectable', async () => {
    const user = userEvent.setup();
    const { onToggle } = renderSelect();
    const checkbox = screen.getByRole('checkbox', { name: 'Small Cup (0)' });
    expect(checkbox).toBeEnabled();
    await user.click(checkbox);
    expect(onToggle).toHaveBeenCalledWith('SM');
  });

  it('checks the boxes for every selected id', () => {
    renderSelect({ selected: ['LL', 'SM'] });
    expect(screen.getByRole('checkbox', { name: 'La Liga (80)' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Small Cup (0)' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Premier League (120)' })).not.toBeChecked();
  });

  it('calls onToggle with the clicked id', async () => {
    const user = userEvent.setup();
    const { onToggle } = renderSelect();
    await user.click(screen.getByRole('checkbox', { name: 'La Liga (80)' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('LL');
  });

  it('is sorted by name via the server order, not re-sorted locally', () => {
    // Deliberately non-alphabetical: the component must render what it is
    // given, since the server already orders by name.
    const serverOrder: CompetitionOption[] = [
      { id: 'Z', name: 'Zeta League', count: 5 },
      { id: 'A', name: 'Alpha Cup', count: 4 },
    ];
    renderSelect({ options: serverOrder });
    expect(labels()).toEqual(['Zeta League (5)', 'Alpha Cup (4)']);
  });

  it('has no search box', () => {
    renderSelect();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('is reachable by getByRole with an accessible name', () => {
    renderSelect();
    expect(screen.getByRole('group', { name: 'Competition' })).toBeTruthy();
  });

  it('shows a loading state while options load', () => {
    renderSelect({ loading: true, options: [] });
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('gives every checkbox a unique, stable id', () => {
    const { rerender } = renderSelect();
    const ids = screen.getAllByRole('checkbox').map((cb) => cb.id);
    expect(new Set(ids).size).toBe(ids.length);
    rerender(
      <CompetitionMultiSelect options={options} selected={null} onToggle={vi.fn()} loading={false} />,
    );
    expect(screen.getAllByRole('checkbox').map((cb) => cb.id)).toEqual(ids);
  });

  it('renders every checkbox inside the single competition group', () => {
    renderSelect();
    const group = screen.getByRole('group', { name: 'Competition' });
    expect(within(group).getAllByRole('checkbox')).toHaveLength(options.length);
    expect(within(group).queryByRole('group')).toBeNull();
  });
});
