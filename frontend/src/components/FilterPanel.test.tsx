// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FilterPanel from './FilterPanel';
import { EMPTY_FILTERS, type FilterOptionsResponse, type GameFilterParams } from '@/types';

const options: FilterOptionsResponse = {
  teams: [
    { id: 294, name: 'SL Benfica', isNationalTeam: false, count: 42 },
    { id: 31, name: 'FC Porto', isNationalTeam: false, count: 7 },
    { id: 999, name: 'Ghost FC', isNationalTeam: false, count: 0 },
  ],
  opponents: [
    { id: 294, name: 'SL Benfica', isNationalTeam: false, count: 40 },
    { id: 31, name: 'FC Porto', isNationalTeam: false, count: 12 },
  ],
  competitions: [],
  seasons: [],
  total: 101,
};

function filtersOf(overrides: Partial<GameFilterParams> = {}): GameFilterParams {
  return { ...EMPTY_FILTERS, ...overrides };
}

interface PanelConfig {
  filters?: GameFilterParams;
  open?: boolean;
  options?: FilterOptionsResponse | null;
  optionsLoading?: boolean;
  optionsError?: string | null;
  onApply?: (next: GameFilterParams) => void;
  onToggleOpen?: () => void;
  onStart?: (next: GameFilterParams) => void;
}

function renderPanel(config: PanelConfig = {}) {
  const onApply = config.onApply ?? vi.fn();
  const onToggleOpen = config.onToggleOpen ?? vi.fn();
  // undefined unless configured — passing onStart to an Apply-mode panel
  // would silently flip it into start mode and assert the wrong contract.
  const onStart = config.onStart;
  const base = {
    open: config.open ?? false,
    onToggleOpen,
    filters: config.filters ?? (EMPTY_FILTERS as GameFilterParams),
    options: config.options === undefined ? options : config.options,
    optionsLoading: config.optionsLoading ?? false,
    optionsError: config.optionsError ?? null,
    onApply,
    ...(onStart ? { onStart } : {}),
  };
  const view = render(<FilterPanel {...base} />);
  return {
    ...view,
    onApply,
    onToggleOpen,
    onStart,
    rerenderPanel: (next: PanelConfig = {}) =>
      view.rerender(
        <FilterPanel
          {...base}
          {...(next.filters !== undefined ? { filters: next.filters } : {})}
          {...(next.open !== undefined ? { open: next.open } : {})}
          {...(next.options !== undefined ? { options: next.options } : {})}
          {...(next.optionsLoading !== undefined ? { optionsLoading: next.optionsLoading } : {})}
          {...(next.optionsError !== undefined ? { optionsError: next.optionsError } : {})}
        />,
      ),
  };
}


function countLabels(): string[] {
  return screen.getAllByRole('checkbox').map((cb) => cb.closest('label')?.textContent?.trim() ?? '');
}

describe('FilterPanel', () => {
  it('renders a toggle button showing how many filters are active', () => {
    renderPanel({ filters: filtersOf({ teamIds: [1, 2], opponentIds: [3] }) });
    // Counts dimensions, not selected values: two active dimensions read "2",
    // not 3 selected teams+opponents — otherwise "Team x3" reads as a count of 9.
    expect(screen.getByRole('button', { name: 'Filters (2)' })).toBeTruthy();
  });

  it('renders the toggle with no count when no filter is active', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy();
  });

  it('reports aria-expanded correctly and toggles', async () => {
    const user = userEvent.setup();
    const panel = renderPanel();
    const toggle = screen.getByRole('button', { name: /^Filters/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls');

    await user.click(toggle);
    expect(panel.onToggleOpen).toHaveBeenCalledTimes(1);
    panel.rerenderPanel({ open: true });

    const reopened = screen.getByRole('button', { name: /^Filters/ });
    expect(reopened).toHaveAttribute('aria-expanded', 'true');
    const region = screen.getByRole('region', { name: 'Filters' });
    expect(reopened.getAttribute('aria-controls')).toBe(region.id);
  });

  it('renders the Team and Opponent lists when open', () => {
    renderPanel({ open: true });
    expect(within(screen.getByRole('group', { name: 'Team' })).getAllByRole('checkbox').length).toBeGreaterThan(0);
    expect(within(screen.getByRole('group', { name: 'Opponent' })).getAllByRole('checkbox').length).toBeGreaterThan(0);
  });

  it('renders nothing but the toggle when closed', () => {
    renderPanel({ open: false });
    expect(screen.queryByRole('region', { name: 'Filters' })).toBeNull();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
    expect(screen.getByRole('button', { name: /^Filters/ })).toBeTruthy();
  });

  it('does not call onApply when a checkbox is toggled', async () => {
    const user = userEvent.setup();
    const panel = renderPanel({ open: true });
    await user.click(screen.getByRole('checkbox', { name: 'SL Benfica (42)' }));
    // The R5 contract: edits land in the draft only, so the counts rendered
    // from `options` cannot change under the cursor mid-edit.
    expect(panel.onApply).not.toHaveBeenCalled();
  });

  it('calls onApply with the updated draft only when Apply is pressed', async () => {
    const user = userEvent.setup();
    const panel = renderPanel({ open: true });
    await user.click(screen.getByRole('checkbox', { name: 'SL Benfica (42)' }));
    expect(panel.onApply).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(panel.onApply).toHaveBeenCalledTimes(1);
    expect(panel.onApply).toHaveBeenCalledWith(filtersOf({ teamIds: [294] }));
    expect(panel.onToggleOpen).toHaveBeenCalledTimes(1); // Apply closes the panel
  });

  it('calls onApply with EMPTY_FILTERS when Clear all is pressed', async () => {
    const user = userEvent.setup();
    const panel = renderPanel({ open: true, filters: filtersOf({ teamIds: [294], opponentIds: [31] }) });
    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(panel.onApply).toHaveBeenCalledWith(EMPTY_FILTERS);
  });

  it('Clear all clears a draft even when the applied set is already empty', async () => {
    // The pre-screen case: nothing applied yet, so onApply(EMPTY) is a no-op
    // upstream and the draft re-sync never fires — the button must clear the
    // visible draft itself or "Clear all" clears nothing the user can see.
    const user = userEvent.setup();
    renderPanel({ open: true });
    await user.click(screen.getByRole('checkbox', { name: 'SL Benfica (42)' }));
    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.getByRole('checkbox', { name: 'SL Benfica (42)' })).not.toBeChecked();
  });

  it('does not re-read counts while the draft is being edited', async () => {
    const user = userEvent.setup();
    const panel = renderPanel({ open: true });
    const before = countLabels();
    await user.click(screen.getByRole('checkbox', { name: 'SL Benfica (42)' }));
    const after = countLabels();
    // A new options identity upstream means a refetch; the observable proof
    // is that every rendered count is byte-identical across the toggle.
    expect(after).toEqual(before);
    expect(panel.onApply).not.toHaveBeenCalled();
  });

  it('resets the draft to the applied filters after a successful apply', async () => {
    const user = userEvent.setup();
    const panel = renderPanel({ open: true });
    await user.click(screen.getByRole('checkbox', { name: 'SL Benfica (42)' }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(panel.onApply).toHaveBeenCalledWith(filtersOf({ teamIds: [294] }));

    // The applied set changed underneath the panel (deep link / Back button):
    // the draft must follow it, not keep the pre-apply selection.
    panel.rerenderPanel({ open: true, filters: filtersOf() });
    expect(screen.getByRole('checkbox', { name: 'SL Benfica (42)' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  it('keeps the draft after an apply that changed nothing', async () => {
    const user = userEvent.setup();
    const panel = renderPanel({ open: true });
    await user.type(screen.getByRole('searchbox', { name: /Search Team/ }), 'benf');
    await user.click(screen.getByRole('checkbox', { name: 'SL Benfica (42)' }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    // The parent adopted the applied set; the panel must keep the user's
    // place — draft selection and in-progress search text both survive.
    panel.rerenderPanel({ open: true, filters: filtersOf({ teamIds: [294] }) });
    // The panel was never unmounted, so the user's place survives: the
    // draft selection and the in-progress search text are both still there.
    expect(screen.getByRole('checkbox', { name: 'SL Benfica (42)' })).toBeChecked();
    expect(screen.getByRole('searchbox', { name: /Search Team/ })).toHaveValue('benf');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  it('preserves the draft selections the user made before opening', async () => {
    const user = userEvent.setup();
    const panel = renderPanel({ open: true });
    await user.click(screen.getByRole('checkbox', { name: 'SL Benfica (42)' }));

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    panel.rerenderPanel({ open: false });
    panel.rerenderPanel({ open: true });

    expect(screen.getByRole('checkbox', { name: 'SL Benfica (42)' })).toBeChecked();
    expect(panel.onApply).not.toHaveBeenCalled();
  });

  it('toggling a second team keeps the first selected (OR semantics)', async () => {
    const user = userEvent.setup();
    const panel = renderPanel({ open: true });
    await user.click(screen.getByRole('checkbox', { name: 'SL Benfica (42)' }));
    await user.click(screen.getByRole('checkbox', { name: 'FC Porto (7)' }));

    expect(screen.getByRole('checkbox', { name: 'SL Benfica (42)' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'FC Porto (7)' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(panel.onApply).toHaveBeenCalledWith(filtersOf({ teamIds: [294, 31] }));
  });

  it('a club can be both a selected Team and a selected Opponent', async () => {
    const user = userEvent.setup();
    const panel = renderPanel({ open: true });
    await user.click(screen.getByRole('checkbox', { name: 'SL Benfica (42)' })); // Team
    await user.click(screen.getByRole('checkbox', { name: 'SL Benfica (40)' })); // Opponent

    expect(screen.getByRole('checkbox', { name: 'SL Benfica (42)' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'SL Benfica (40)' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(panel.onApply).toHaveBeenCalledWith(
      filtersOf({ teamIds: [294], opponentIds: [294] }),
    );
  });

  it('shows the options error without hiding the toggle', () => {
    renderPanel({ open: true, optionsError: 'Options failed to load' });
    expect(screen.getByText('Options failed to load')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Filters/ })).toBeTruthy();
  });

  it('shows a loading state for the lists while options load', () => {
    renderPanel({ open: true, optionsLoading: true, options: null });
    // Both dimensions announce their own loading state.
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('disables Apply when the draft equals the applied filters', async () => {
    const user = userEvent.setup();
    renderPanel({ open: true, filters: filtersOf({ teamIds: [294] }) });
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'FC Porto (7)' }));
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();

    await user.click(screen.getByRole('checkbox', { name: 'FC Porto (7)' }));
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  it('does not remount the panel when filters change', async () => {
    const user = userEvent.setup();
    const panel = renderPanel({ open: true });
    await user.type(screen.getByRole('searchbox', { name: /Search Team/ }), 'porto');
    await screen.findByRole('checkbox', { name: 'FC Porto (7)' });

    // A filter change must not blow away the in-progress search or the
    // open state: no key on filter state, panel stays mounted.
    panel.rerenderPanel({ filters: filtersOf({ teamIds: [7] }) });

    expect(screen.getByRole('searchbox', { name: /Search Team/ })).toHaveValue('porto');
    expect(screen.getByRole('button', { name: /^Filters/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled(); // draft re-synced to applied
  });
});

describe('FilterPanel start mode', () => {
  it('reads "Start game" instead of "Apply"', () => {
    renderPanel({ open: true, onStart: vi.fn() });
    expect(screen.getByRole('button', { name: 'Start game' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
  });

  it('never disables Start game, even when the draft equals the applied filters', () => {
    renderPanel({ open: true, filters: filtersOf({ teamIds: [294] }), onStart: vi.fn() });
    // Apply is armed by a change; Start is always armed — starting with
    // nothing selected (or with the deep-link set as-is) is legal.
    expect(screen.getByRole('button', { name: 'Start game' })).not.toBeDisabled();
  });

  it('calls onStart with the draft and nothing else when Start game is pressed', async () => {
    const user = userEvent.setup();
    const panel = renderPanel({ open: true, onStart: vi.fn() });
    await user.click(screen.getByRole('checkbox', { name: 'SL Benfica (42)' }));
    expect(panel.onStart).not.toHaveBeenCalled();           // toggling starts nothing
    await user.click(screen.getByRole('button', { name: 'Start game' }));
    expect(panel.onStart).toHaveBeenCalledTimes(1);
    expect(panel.onStart).toHaveBeenCalledWith(filtersOf({ teamIds: [294] }));
    expect(panel.onApply).not.toHaveBeenCalled();           // start is not an apply
    expect(panel.onToggleOpen).not.toHaveBeenCalled();      // the page decides when it closes
  });

  it('hides the panel toggle in start mode so Start cannot become unreachable', () => {
    renderPanel({ open: true, onStart: vi.fn() });
    expect(screen.queryByRole('button', { name: /^Filters/ })).toBeNull();
    expect(screen.getByRole('region', { name: 'Filters' })).toBeVisible();
  });

  it('still routes Clear all through onApply in start mode', async () => {
    const user = userEvent.setup();
    const panel = renderPanel({ open: true, filters: filtersOf({ teamIds: [294] }), onStart: vi.fn() });
    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(panel.onApply).toHaveBeenCalledWith(EMPTY_FILTERS);
    expect(panel.onStart).not.toHaveBeenCalled();
  });
});
