// @vitest-environment jsdom

import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SeasonRange from './SeasonRange';

const seasons = [
  { season: 2023, count: 40 },
  { season: 2024, count: 25 },
  { season: 2025, count: 10 },
];

interface RenderOptions {
  from?: number | null;
  to?: number | null;
  loading?: boolean;
  seasons?: { season: number; count: number }[];
  onFromChange?: (value: number | null) => void;
  onToChange?: (value: number | null) => void;
}

function renderRange(overrides: RenderOptions = {}) {
  const onFromChange = overrides.onFromChange ?? vi.fn();
  const onToChange = overrides.onToChange ?? vi.fn();
  const result = render(
    <SeasonRange
      from={overrides.from ?? null}
      to={overrides.to ?? null}
      onFromChange={onFromChange}
      onToChange={onToChange}
      seasons={overrides.seasons ?? seasons}
      loading={overrides.loading ?? false}
    />,
  );
  return { ...result, onFromChange, onToChange };
}

function Controlled({ initialFrom = null, initialTo = null }: { initialFrom?: number | null; initialTo?: number | null }) {
  const [from, setFrom] = useState<number | null>(initialFrom);
  const [to, setTo] = useState<number | null>(initialTo);
  return (
    <SeasonRange
      from={from}
      to={to}
      onFromChange={setFrom}
      onToChange={setTo}
      seasons={seasons}
      loading={false}
    />
  );
}

const fromInput = () => screen.getByLabelText('Season from') as HTMLInputElement;
const toInput = () => screen.getByLabelText('Season to') as HTMLInputElement;

describe('SeasonRange', () => {
  it('renders two labelled numeric inputs, from and to', () => {
    renderRange();
    expect(fromInput()).toHaveAttribute('type', 'number');
    expect(toInput()).toHaveAttribute('type', 'number');
  });

  it('shows an empty box for a null bound with an "Any" placeholder', () => {
    renderRange({ from: null, to: 2024 });
    expect(fromInput()).toHaveValue(null);
    expect(fromInput()).toHaveAttribute('placeholder', 'Any');
    expect(toInput()).toHaveValue(2024);
  });

  it('reports the typed value on change', () => {
    const { onFromChange } = renderRange();
    fireEvent.change(fromInput(), { target: { value: '2018' } });
    expect(onFromChange).toHaveBeenCalledWith(2018);
  });

  it('reports null when the box is cleared', () => {
    const { onFromChange } = renderRange({ from: 2018 });
    fireEvent.change(fromInput(), { target: { value: '' } });
    expect(onFromChange).toHaveBeenLastCalledWith(null);
  });

  it('pushes the `to` bound up when `from` is raised past it', () => {
    const { onToChange } = renderRange({ from: 2018, to: 2020 });
    fireEvent.change(fromInput(), { target: { value: '2022' } });
    expect(onToChange).toHaveBeenCalledWith(2022);
  });

  it('pushes the `from` bound down when `to` is lowered below it', () => {
    const { onFromChange } = renderRange({ from: 2020, to: 2022 });
    fireEvent.change(toInput(), { target: { value: '2018' } });
    expect(onFromChange).toHaveBeenCalledWith(2018);
  });

  it('never renders an inverted range after an interaction', () => {
    render(<Controlled initialFrom={2020} initialTo={2024} />);
    fireEvent.change(fromInput(), { target: { value: '2025' } });
    expect(Number(fromInput().value)).toBeLessThanOrEqual(Number(toInput().value));

    fireEvent.change(toInput(), { target: { value: '2019' } });
    expect(Number(fromInput().value)).toBeLessThanOrEqual(Number(toInput().value));
  });

  it('rejects a value outside 2013-2025 by reporting null', () => {
    const { onFromChange } = renderRange({ from: 2020 });
    fireEvent.change(fromInput(), { target: { value: '1999' } });
    expect(onFromChange).toHaveBeenLastCalledWith(null);
  });

  it('rejects a non-numeric entry by reporting null', () => {
    const { onFromChange } = renderRange({ from: 2020 });
    fireEvent.change(fromInput(), { target: { value: 'abcd' } });
    expect(onFromChange).toHaveBeenLastCalledWith(null);
  });

  it('offers the available seasons as a datalist hint', () => {
    renderRange();
    const listId = fromInput().getAttribute('list');
    expect(listId).toBeTruthy();
    const list = document.getElementById(listId as string) as HTMLDataListElement;
    expect(list).toBeTruthy();
    expect(list.querySelectorAll('option')).toHaveLength(seasons.length);
  });

  it('names each input for a screen reader ("Season from", "Season to")', () => {
    renderRange();
    expect(screen.getByRole('spinbutton', { name: 'Season from' })).toBeTruthy();
    expect(screen.getByRole('spinbutton', { name: 'Season to' })).toBeTruthy();
  });

  it('does not disable an empty bound', () => {
    renderRange({ from: null, to: null });
    expect(fromInput()).toBeEnabled();
    expect(toInput()).toBeEnabled();
  });
});
