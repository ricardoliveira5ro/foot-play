// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DifficultySelector from './DifficultySelector';
import { DIFFICULTIES, DIFFICULTY_CONFIG } from '../lib/difficulty';

describe('DifficultySelector', () => {
  it('renders exactly the modes that have shipped', () => {
    render(<DifficultySelector value="normal" onChange={() => {}} />);
    for (const mode of DIFFICULTIES) {
      expect(screen.getByRole('button', { name: new RegExp(DIFFICULTY_CONFIG[mode].label, 'i') })).toBeTruthy();
    }
    expect(screen.getAllByRole('button')).toHaveLength(DIFFICULTIES.length);
  });

  it('marks the current mode as checked', () => {
    render(<DifficultySelector value="easy" onChange={() => {}} />);
    const easyBtn = screen.getByRole('button', { name: /easy/i });
    const normalBtn = screen.getByRole('button', { name: /normal/i });
    expect(easyBtn).toHaveAttribute('aria-pressed', 'true');
    expect(normalBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports the chosen mode', () => {
    const onChange = vi.fn();
    render(<DifficultySelector value="normal" onChange={onChange} />);
    const easyBtn = screen.getByRole('button', { name: /easy/i });
    fireEvent.click(easyBtn);
    expect(onChange).toHaveBeenCalledWith('easy');
  });

  it('describes each mode with its attempts and clues', () => {
    render(<DifficultySelector value="normal" onChange={() => {}} />);
    // The player has to be able to tell Easy from Normal before starting;
    // "more clues" is the only difference that matters here.
    expect(screen.getByText(/first letter/i)).toBeTruthy();
    expect(screen.getAllByText(/6 attempts/i).length).toBeGreaterThan(0);
  });

  it('tells the player that Hard hides the number', () => {
    render(<DifficultySelector value="normal" onChange={() => {}} />);
    expect(screen.getAllByText(/number hidden/i)).toHaveLength(2);
    expect(screen.getAllByText(/number shown/i)).toHaveLength(2);
  });

  it('states that Expert offers three attempts and requires the opponent', () => {
    render(<DifficultySelector value="normal" onChange={() => {}} />);
    expect(screen.getAllByText(/3 attempts/)).toHaveLength(1);
    expect(screen.getAllByText(/opponent required/)).toHaveLength(1);
    expect(screen.getAllByText(/opponent optional/)).toHaveLength(3);
  });
});
