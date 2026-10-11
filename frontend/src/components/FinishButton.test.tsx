// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DIFFICULTIES, DIFFICULTY_CONFIG } from '../lib/difficulty';
import FinishButton from './FinishButton';

describe('FinishButton', () => {
  it('renders nothing in Easy or Normal, which is the whole point', () => {
    // These are the two offered modes. The opponent is a bonus here, so a
    // visible-but-disabled Finish would be a requirement the game does not have.
    for (const difficulty of ['easy', 'normal'] as const) {
      const { container } = render(
        <FinishButton difficulty={difficulty} resolved={22} total={22} onFinish={() => {}} />,
      );
      expect(container.innerHTML).toBe('');
      expect(screen.queryByRole('button')).toBeNull();
    }
  });

  it('renders a locked control with the unresolved count for a required mode', () => {
    // `expert` is not offered until v1.2.4, but its row is final here, so the
    // control's required case is testable two patches early.
    render(<FinishButton difficulty="expert" resolved={11} total={22} onFinish={() => {}} />);
    const button = screen.getByRole('button') as HTMLInputElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('11 of 22');
  });

  it('unlocks at 22 of 22 and reports the press', () => {
    const onFinish = vi.fn();
    render(<FinishButton difficulty="expert" resolved={22} total={22} onFinish={onFinish} />);
    const button = screen.getByRole('button') as HTMLInputElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onFinish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('asks for confirmation before reporting the finish', () => {
    // The affordance is a control PLUS a confirmation (roadmap §5.2), not a
    // control. A single click must not complete a game.
    const onFinish = vi.fn();
    render(<FinishButton difficulty="expert" resolved={22} total={22} onFinish={onFinish} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onFinish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('reads the flag, not the mode name', () => {
    for (const difficulty of DIFFICULTIES) {
      const { container } = render(
        <FinishButton difficulty={difficulty} resolved={22} total={22} onFinish={() => {}} />,
      );
      expect(container.innerHTML !== '').toBe(
        DIFFICULTY_CONFIG[difficulty].opponentRequired,
      );
    }
  });
});
