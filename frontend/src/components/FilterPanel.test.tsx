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

/** Section headers read "Team" or "Team (2)" depending on the draft count. */
function sectionHeader(name: 'Team') {
  return screen.getByRole('button', { name: new RegExp(`^${name}( \\(\\d+\\))?$`) });
}

async function expandSection(
  user: ReturnType<typeof userEvent.setup>,
  ...names: Array<'Team'>
) {
  for (const name of names) {
    const header = sectionHeader(name);
    if (header.getAttribute('aria-expanded') !== 'true') await user.click(header);
  }
}

describe('FilterPanel', () => {
  it('renders a toggle button showing how many filters are active', () => {
    renderPanel({ filters: filtersOf({ teamIds: [1, 2] }) });
    // Counts dimensions, not selected values: one active dimension reads "1",
    // not 2 selected teams — otherwise "Team x2" would read as a count of 4.
    expect(screen.getByRole('button', { name: 'Filters (1)' })).toBeTruthy();
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

  it('renders the Team list when open and no Opponent section at all', async () => {
    const user = userEvent.setup();
    renderPanel({ open: true });
    await expandSection(user, 'Team');
    expect(within(screen.getByRole('group', { name: 'Team' })).getAllByRole('checkbox').length).toBeGreaterThan(0);
    // The Opponent dimension is removed end to end: no header, no section.
    expect(screen.queryByRole('button', { name: /^Opponent/ })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Opponent' })).toBeNull();
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
    await expandSection(user, 'Team');
    await user.click(screen.getByRole('checkbox', { name: 'SL Benfica (42)' }));
    // The R5 contract: edits land in the draft only, so the counts rendered
    // from `options` cannot change under the cursor mid-edit.
    expect(panel.onApply).not.toHaveBeenCalled();
  });

  it('calls onApply with the updated draft only when Apply is pressed', async () => {
    const user = userEvent.setup();
    const panel = renderPanel({ open: true });
    await expandSection(user, 'Team');
    await user.click(screen.getByRole('checkbox', { name: 'SL Benfica (42)' }));
    expect(panel.onApply).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(panel.onApply).toHaveBeenCalledTimes(1);
    expect(panel.onApply).toHaveBeenCalledWith(filtersOf({ teamIds: [294] }));
    expect(panel.onToggleOpen).toHaveBeenCalledTimes(1); // Apply closes the panel
  });

  it('calls onApply with EMPTY_FILTERS when Clear all is pressed', async () => {
    const user = userEvent.setup();
    const panel = renderPanel({ open: true, filters: filtersOf({ teamIds: [294] }) });
    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(panel.onApply).toHaveBeenCalledWith(EMPTY_FILTERS);
  });

  it('Clear all clears a draft even when the applied set is already empty', async () => {
    // The pre-screen case: nothing applied yet, so onApply(EMPTY) is a no-op
    // upstream and the draft re-sync never fires — the button must clear the
    // visible draft itself or "Clear all" clears nothing the user can see.
    const user = userEvent.setup();
    renderPanel({ open: true });
    await expandSection(user, 'Team');
    await user.click(screen.getByRole('checkbox', { name: 'SL Benfica (42)' }));
    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.getByRole('checkbox', { name: 'SL Benfica (42)' })).not.toBeChecked();
  });

  it('does not re-read counts while the draft is being edited', async () => {
    const user = userEvent.setup();
    const panel = renderPanel({ open: true });
    await expandSection(user, 'Team');
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
    await expandSection(user, 'Team');
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
    await expandSection(user, 'Team');
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
    await expandSection(user, 'Team');
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
    await expandSection(user, 'Team');
    await user.click(screen.getByRole('checkbox', { name: 'SL Benfica (42)' }));
    await user.click(screen.getByRole('checkbox', { name: 'FC Porto (7)' }));

    expect(screen.getByRole('checkbox', { name: 'SL Benfica (42)' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'FC Porto (7)' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(panel.onApply).toHaveBeenCalledWith(filtersOf({ teamIds: [294, 31] }));
  });

  it('shows the options error without hiding the toggle', () => {
    renderPanel({ open: true, optionsError: 'Options failed to load' });
    expect(screen.getByText('Options failed to load')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Filters/ })).toBeTruthy();
  });

  it('shows a loading state for the lists while options load', async () => {
    const user = userEvent.setup();
    renderPanel({ open: true, optionsLoading: true, options: null });
    // The dimension announces its loading state once its section is
    // expanded; the collapsed section hides it behind the header.
    await expandSection(user, 'Team');
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('disables Apply when the draft equals the applied filters', async () => {
    const user = userEvent.setup();
    renderPanel({ open: true, filters: filtersOf({ teamIds: [294] }) });
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();

    await expandSection(user, 'Team');
    await user.click(screen.getByRole('checkbox', { name: 'FC Porto (7)' }));
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();

    await user.click(screen.getByRole('checkbox', { name: 'FC Porto (7)' }));
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  it('does not remount the panel when filters change', async () => {
    const user = userEvent.setup();
    const panel = renderPanel({ open: true });
    await expandSection(user, 'Team');
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

describe('FilterPanel sections', () => {
  it('starts with the Team section collapsed when the panel is open', () => {
    renderPanel({ open: true });
    const header = sectionHeader('Team');
    expect(header).toHaveAttribute('aria-expanded', 'false');
    const bodyId = header.getAttribute('aria-controls');
    expect(bodyId).toBeTruthy();
    expect(document.getElementById(bodyId as string)?.hidden).toBe(true);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    // The Opponent dimension is removed — one section, no second disclosure.
    expect(screen.queryByRole('button', { name: /^Opponent/ })).toBeNull();
    // The footer (Apply / Clear all / Start game) lives outside the sections
    // and must stay reachable no matter what is collapsed.
    expect(screen.getByRole('button', { name: 'Apply' })).toBeVisible();
  });

  it('expands and collapses the Team section', async () => {
    const user = userEvent.setup();
    renderPanel({ open: true });

    await user.click(sectionHeader('Team'));
    expect(sectionHeader('Team')).toHaveAttribute('aria-expanded', 'true');
    expect(
      within(screen.getByRole('group', { name: 'Team' })).getAllByRole('checkbox').length,
    ).toBeGreaterThan(0);

    await user.click(sectionHeader('Team')); // collapse
    expect(sectionHeader('Team')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('group', { name: 'Team' })).toBeNull();
  });

  it('header count shows the draft selection and resets with Clear all', async () => {
    const user = userEvent.setup();
    renderPanel({ open: true });
    // No draft selection → bare label, matching the panel's "Filters (N)" style.
    expect(screen.getByRole('button', { name: 'Team' })).toBeTruthy();

    await expandSection(user, 'Team');
    await user.click(screen.getByRole('checkbox', { name: 'SL Benfica (42)' }));
    expect(sectionHeader('Team')).toHaveTextContent('Team (1)');

    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.getByRole('button', { name: 'Team' })).toBeTruthy();
  });

  it('collapsing a section keeps its search text and selection', async () => {
    const user = userEvent.setup();
    renderPanel({ open: true });
    await expandSection(user, 'Team');
    await user.type(screen.getByRole('searchbox', { name: /Search Team/ }), 'benf');
    await user.click(screen.getByRole('checkbox', { name: 'SL Benfica (42)' }));

    await user.click(sectionHeader('Team')); // collapse
    expect(screen.queryByRole('searchbox', { name: /Search Team/ })).toBeNull();

    await user.click(sectionHeader('Team')); // re-expand: the body never unmounted
    expect(screen.getByRole('searchbox', { name: /Search Team/ })).toHaveValue('benf');
    expect(screen.getByRole('checkbox', { name: 'SL Benfica (42)' })).toBeChecked();
  });

  it('keeps an expanded section expanded when the panel closes and reopens', async () => {
    const user = userEvent.setup();
    const panel = renderPanel({ open: true });
    await expandSection(user, 'Team');
    await user.click(screen.getByRole('checkbox', { name: 'SL Benfica (42)' }));

    panel.rerenderPanel({ open: false });
    panel.rerenderPanel({ open: true });

    expect(sectionHeader('Team')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('checkbox', { name: 'SL Benfica (42)' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled(); // draft survived too
  });

  it('starts collapsed in start mode', () => {
    renderPanel({ open: true, onStart: vi.fn() });
    expect(sectionHeader('Team')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Start game' })).toBeVisible();
  });

  it('Clear all leaves section expand state alone', async () => {
    const user = userEvent.setup();
    renderPanel({ open: true });
    await expandSection(user, 'Team');
    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(sectionHeader('Team')).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('FilterPanel selected chips', () => {
  it('shows a chip with the club name beside the header count', async () => {
    const user = userEvent.setup();
    renderPanel({ open: true });
    await expandSection(user, 'Team');
    await user.click(screen.getByRole('checkbox', { name: 'SL Benfica (42)' }));

    expect(sectionHeader('Team')).toHaveTextContent('Team (1)');
    const remove = screen.getByRole('button', { name: 'Remove SL Benfica from Team' });
    expect(remove).toBeVisible();
    // The chip lives in its own row BELOW the disclosure button, never inside
    // it — a button inside a button is invalid HTML. The strict header-name
    // regex matching at all is what proves the chip text stayed outside the
    // button; the document-position check proves it comes after (below) it.
    expect(sectionHeader('Team').contains(remove)).toBe(false);
    expect(
      sectionHeader('Team').compareDocumentPosition(remove) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('removing via the chip X edits the draft only', async () => {
    const user = userEvent.setup();
    const panel = renderPanel({ open: true });
    await expandSection(user, 'Team');
    await user.click(screen.getByRole('checkbox', { name: 'SL Benfica (42)' }));
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled(); // draft differs

    await user.click(screen.getByRole('button', { name: 'Remove SL Benfica from Team' }));

    expect(screen.queryByRole('button', { name: 'Remove SL Benfica from Team' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Team' })).toBeTruthy(); // bare label back
    // The section never collapsed, so the checkbox reflects the same draft edit.
    expect(screen.getByRole('checkbox', { name: 'SL Benfica (42)' })).not.toBeChecked();
    expect(panel.onApply).not.toHaveBeenCalled(); // draft-only, exactly like unchecking
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled(); // draft == applied again
  });

  it('shows one chip per selection and removes them independently', async () => {
    const user = userEvent.setup();
    renderPanel({ open: true });
    await expandSection(user, 'Team');
    await user.click(screen.getByRole('checkbox', { name: 'SL Benfica (42)' }));
    await user.click(screen.getByRole('checkbox', { name: 'FC Porto (7)' }));

    expect(sectionHeader('Team')).toHaveTextContent('Team (2)');
    expect(screen.getByRole('button', { name: 'Remove SL Benfica from Team' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove FC Porto from Team' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Remove FC Porto from Team' }));

    expect(sectionHeader('Team')).toHaveTextContent('Team (1)');
    expect(screen.queryByRole('button', { name: 'Remove FC Porto from Team' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove SL Benfica from Team' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'FC Porto (7)' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'SL Benfica (42)' })).toBeChecked();
  });

  it('falls back to #id for a draft id outside the option universe', () => {
    // A stale deep link can carry an id the current universe does not list;
    // the chip shows the raw id rather than vanishing or crashing.
    renderPanel({ open: true, filters: filtersOf({ teamIds: [9999] }) });
    expect(sectionHeader('Team')).toHaveTextContent('Team (1)');
    expect(screen.getByRole('button', { name: 'Remove #9999 from Team' })).toBeTruthy();
  });

  it('hands focus to the section header after a chip removal', async () => {
    const user = userEvent.setup();
    renderPanel({ open: true });
    await expandSection(user, 'Team');
    await user.click(screen.getByRole('checkbox', { name: 'SL Benfica (42)' }));
    const header = sectionHeader('Team');

    await user.click(screen.getByRole('button', { name: 'Remove SL Benfica from Team' }));

    // The X unmounts with its chip; focus must not fall to <body>.
    expect(document.activeElement).toBe(header);
  });

  it('start mode removes chips from the draft without starting', async () => {
    const user = userEvent.setup();
    const panel = renderPanel({ open: true, onStart: vi.fn() });
    await expandSection(user, 'Team');
    await user.click(screen.getByRole('checkbox', { name: 'SL Benfica (42)' }));

    await user.click(screen.getByRole('button', { name: 'Remove SL Benfica from Team' }));

    expect(screen.queryByRole('button', { name: /Remove SL Benfica/ })).toBeNull();
    expect(panel.onStart).not.toHaveBeenCalled(); // Start still needs the explicit press
    expect(screen.getByRole('button', { name: 'Start game' })).toBeVisible();
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
    await expandSection(user, 'Team');
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

  it('runs without an onToggleOpen handler when start mode owns the lifecycle', async () => {
    // The pre-screen omits the handler entirely: the panel never closes
    // itself there, so nothing may dereference it — Start must still work.
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(
      <FilterPanel
        open
        filters={filtersOf()}
        options={options}
        optionsLoading={false}
        optionsError={null}
        onApply={vi.fn()}
        onStart={onStart}
      />,
    );
    expect(screen.queryByRole('button', { name: /^Filters/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Start game' }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('still routes Clear all through onApply in start mode', async () => {
    const user = userEvent.setup();
    const panel = renderPanel({ open: true, filters: filtersOf({ teamIds: [294] }), onStart: vi.fn() });
    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(panel.onApply).toHaveBeenCalledWith(EMPTY_FILTERS);
    expect(panel.onStart).not.toHaveBeenCalled();
  });
});
