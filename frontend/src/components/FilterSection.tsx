'use client';

import { useId, useRef, type ReactNode } from 'react';

/** One draft selection rendered as a removable chip beside the header count. */
export interface SelectionChip {
  id: number;
  name: string;
}

interface FilterSectionProps {
  /** Visible dimension label — "Team", "Opponent". */
  label: string;
  /** Draft selection count; rendered as "Label (N)" only when > 0. */
  count: number;
  /** Controlled disclosure state — owned by FilterPanel, default collapsed. */
  expanded: boolean;
  onToggleExpanded: () => void;
  /** Draft selections shown as chips next to the header; edits are draft-only. */
  chips?: SelectionChip[];
  /** Removes one id from the draft — same toggle semantics as the checkbox. */
  onRemoveChip?: (id: number) => void;
  /** Search + checkbox list; always mounted, hidden while collapsed. */
  children: ReactNode;
}

/**
 * One collapsible dimension inside the FilterPanel.
 *
 * Disclosure pattern: the header button carries aria-expanded/aria-controls
 * and the body stays mounted with the `hidden` attribute — search text and
 * draft selections survive a collapse, while hidden content stays out of
 * the accessibility tree and the keyboard focus order.
 *
 * Selected values render as chips in their own wrapping row BELOW the
 * disclosure button, which stays full-width — a button cannot nest, and the
 * chip row flex-wraps, so any number of chips flows onto extra lines
 * instead of hiding behind a cap.
 */
export default function FilterSection({
  label,
  count,
  expanded,
  onToggleExpanded,
  chips = [],
  onRemoveChip,
  children,
}: FilterSectionProps) {
  const bodyId = useId();
  const headerRef = useRef<HTMLButtonElement>(null);

  const removeChip = (id: number) => {
    onRemoveChip?.(id);
    // The X unmounts with its chip — send focus back to the header so the
    // keyboard user does not drop to <body>.
    headerRef.current?.focus();
  };

  return (
    <div>
      <button
        ref={headerRef}
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        aria-controls={bodyId}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-ink/15 bg-paper px-4 py-2.5 text-left text-sm font-semibold text-ink transition-colors hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare"
      >
        <span>
          {label}
          {count > 0 ? ` (${count})` : ''}
        </span>
        <span aria-hidden="true" className="text-xs text-ink/45">
          {expanded ? '▲' : '▼'}
        </span>
      </button>
      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <span
              key={chip.id}
              className="inline-flex max-w-[12rem] items-center gap-1.5 rounded-md border border-ink/15 bg-paper py-1 pl-2 pr-1 text-xs font-medium text-ink/75"
            >
              <span className="truncate">{chip.name}</span>
              <button
                type="button"
                onClick={() => removeChip(chip.id)}
                aria-label={`Remove ${chip.name} from ${label}`}
                className="rounded px-1.5 py-0.5 text-ink/40 transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-flare"
              >
                <span aria-hidden="true">×</span>
              </button>
            </span>
          ))}
        </div>
      )}
      <div id={bodyId} hidden={!expanded} className="mt-2">
        {children}
      </div>
    </div>
  );
}
