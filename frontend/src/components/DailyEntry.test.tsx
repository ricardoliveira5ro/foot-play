// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DailyEntry from './DailyEntry';

const base = { dailyKey: null, todayKey: '2026-01-01', urlReady: true, onStartDaily: vi.fn() };

describe('DailyEntry', () => {
  it('renders nothing before the URL has been read (first paint must not differ)', () => {
    const { container } = render(<DailyEntry {...base} urlReady={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing before todayKey is known', () => {
    const { container } = render(<DailyEntry {...base} todayKey={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('offers the daily puzzle when not in daily mode', () => {
    render(<DailyEntry {...base} />);
    expect(screen.getByRole('button', { name: /daily puzzle/i })).toBeInTheDocument();
  });

  it('names the day it is offering', () => {
    render(<DailyEntry {...base} todayKey="2026-01-01" />);
    expect(screen.getByText(/1 January 2026/)).toBeInTheDocument();
  });

  it('calls onStartDaily when the button is pressed', async () => {
    const onStartDaily = vi.fn();
    render(<DailyEntry {...base} onStartDaily={onStartDaily} />);
    await userEvent.click(screen.getByRole('button', { name: /daily puzzle/i }));
    expect(onStartDaily).toHaveBeenCalledTimes(1);
  });

  it('shows an in-progress notice instead of a button while playing today', () => {
    render(<DailyEntry {...base} dailyKey="2026-01-01" />);
    expect(screen.queryByRole('button', { name: /daily puzzle/i })).not.toBeInTheDocument();
    expect(screen.getByText(/today[’']s puzzle/i)).toBeInTheDocument();
  });

  it('never renders a filter control — daily is a mode, not a filter variant (§6.2)', () => {
    render(<DailyEntry {...base} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('shows the real UTC reset countdown in the hero', () => {
    render(<DailyEntry {...base} />);
    expect(screen.getByText('Next eleven in')).toBeInTheDocument();
    expect(screen.getByText('Resets at 00:00 UTC daily.')).toBeInTheDocument();
    expect(screen.getByText(/^\d{2}:\d{2}:\d{2}$/)).toBeInTheDocument();
  });

  it('offers the daily in the compact in-game variant', async () => {
    const onStartDaily = vi.fn();
    render(<DailyEntry {...base} variant="compact" onStartDaily={onStartDaily} />);
    await userEvent.click(screen.getByRole('button', { name: /daily puzzle/i }));
    expect(onStartDaily).toHaveBeenCalledTimes(1);
  });

  it('shows a compact in-progress status with no start button while playing today', () => {
    render(<DailyEntry {...base} dailyKey="2026-01-01" variant="compact" />);
    expect(screen.queryByRole('button', { name: /daily puzzle/i })).not.toBeInTheDocument();
    expect(screen.getByText(/today[’']s puzzle/i)).toBeInTheDocument();
  });
});
