// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DailyEntry from './DailyEntry';
import { EMPTY_STREAK, type StreakState } from '@/lib/streak';

const base = { dailyKey: null, todayKey: '2026-01-01', urlReady: true, onStartDaily: vi.fn() };

const playedToday: StreakState = { current: 1, longest: 1, lastPlayedKey: '2026-01-01', playedKeys: ['2026-01-01'] };
const threeDayStreak: StreakState = { current: 3, longest: 5, lastPlayedKey: '2025-12-30', playedKeys: ['2025-12-28', '2025-12-29', '2025-12-30'] };

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

  it('shows the current and longest streak when there is history', () => {
    render(<DailyEntry {...base} streak={threeDayStreak} />);
    expect(screen.getByText(/current streak: 3/i)).toBeInTheDocument();
    expect(screen.getByText(/longest: 5/i)).toBeInTheDocument();
  });

  it('does not show a streak line when nothing has been played', () => {
    render(<DailyEntry {...base} streak={EMPTY_STREAK} />);
    expect(screen.queryByText(/current streak/i)).not.toBeInTheDocument();
  });

  it('hides the start button and says played today when today is in playedKeys (O1)', () => {
    render(<DailyEntry {...base} streak={playedToday} />);
    expect(screen.queryByRole('button', { name: /daily puzzle/i })).not.toBeInTheDocument();
    expect(screen.getByText(/played today/i)).toBeInTheDocument();
  });

  it('still offers the daily puzzle when today is not played', () => {
    render(<DailyEntry {...base} streak={threeDayStreak} />);
    expect(screen.getByRole('button', { name: /daily puzzle/i })).toBeInTheDocument();
  });

  it('defaults to EMPTY_STREAK when no streak prop is given (hydration-safe)', () => {
    render(<DailyEntry {...base} />);
    expect(screen.getByRole('button', { name: /daily puzzle/i })).toBeInTheDocument();
    expect(screen.queryByText(/current streak/i)).not.toBeInTheDocument();
  });

  it('shows the streak in the compact status while playing today', () => {
    render(<DailyEntry {...base} dailyKey="2026-01-01" variant="compact" streak={playedToday} />);
    expect(screen.getByText(/current streak: 1/i)).toBeInTheDocument();
    expect(screen.getByText(/longest: 1/i)).toBeInTheDocument();
  });

  it('gates the compact start button once today is played', () => {
    render(<DailyEntry {...base} variant="compact" streak={playedToday} />);
    expect(screen.queryByRole('button', { name: /daily puzzle/i })).not.toBeInTheDocument();
    expect(screen.getByText(/played today/i)).toBeInTheDocument();
  });
});
