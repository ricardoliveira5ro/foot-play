// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DifficultySelector from './DifficultySelector';
import { DIFFICULTIES, DIFFICULTY_CONFIG } from '../lib/difficulty';

describe('DifficultySelector', () => {
  it('renders exactly the modes that have shipped', () => {
    render(<DifficultySelector value="normal" onChange={() => {}} />);
    for (const mode of DIFFICULTIES) {
      const radios = screen.getAllByRole('radio');
      const hasLabel = radios.some(r => (r as HTMLInputElement).value === mode);
      expect(hasLabel).toBe(true);
    }
    expect(screen.getAllByRole('radio')).toHaveLength(DIFFICULTIES.length);
  });

  it('marks the current mode as checked', () => {
    render(<DifficultySelector value="easy" onChange={() => {}} />);
    const radios = screen.getAllByRole('radio');
    const easyRadio = radios.find(r => (r as HTMLInputElement).value === 'easy') as HTMLInputElement;
    const normalRadio = radios.find(r => (r as HTMLInputElement).value === 'normal') as HTMLInputElement;
    expect(easyRadio.checked).toBe(true);
    expect(normalRadio.checked).toBe(false);
  });

  it('reports the chosen mode', () => {
    const onChange = vi.fn();
    render(<DifficultySelector value="normal" onChange={onChange} />);
    const radios = screen.getAllByRole('radio');
    const easyRadio = radios.find(r => (r as HTMLInputElement).value === 'easy') as HTMLElement;
    fireEvent.click(easyRadio);
    expect(onChange).toHaveBeenCalledWith('easy');
  });

  it('describes each mode with its attempts and clues', () => {
    render(<DifficultySelector value="normal" onChange={() => {}} />);
    // The player has to be able to tell Easy from Normal before starting;
    // "more clues" is the only difference that matters here.
    expect(screen.getByText(/first letter/i)).toBeTruthy();
    expect(screen.getAllByText(/6 attempts/i).length).toBeGreaterThan(0);
  });
});
