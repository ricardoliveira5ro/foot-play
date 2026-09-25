// @vitest-environment jsdom

/**
 * Characterization tests for WordleModal. The component owns the dialog,
 * guessing grid, keyboard input, and dismissal controls, so these tests
 * exercise those user-visible paths through the public component props.
 */

import { describe, it, expect, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WordleModal from './WordleModal';
import type { GuessResult } from '@/lib/wordle';

type WordleModalProps = ComponentProps<typeof WordleModal>;
type ModalOverrides = Omit<Partial<WordleModalProps>, 'onGuess' | 'onClose'>;

// --- Fixtures and helpers ---

function makeResult(letter: string, result: GuessResult['result']): GuessResult {
  return { letter, result };
}

function renderModal(overrides: ModalOverrides = {}) {
  const onGuess = vi.fn();
  const onClose = vi.fn();
  const props: WordleModalProps = {
    nameLength: 3,
    wordBoundaries: [],
    shirtNumber: 10,
    position: 'ST',
    guesses: [],
    maxAttempts: 6,
    onGuess,
    onClose,
    ...overrides,
  };
  const view = render(<WordleModal {...props} />);
  return { ...view, onGuess, onClose };
}

function getGrid() {
  return screen.getByRole('grid', { name: 'Guessing grid' });
}

function getModalContent() {
  const dialog = screen.getByRole('dialog');
  return dialog.children[1] as HTMLElement;
}

function getCurrentLetter(letter: string) {
  return within(getGrid()).queryByLabelText(letter);
}

// --- Tests ---

describe('WordleModal', () => {
  describe('render states', () => {
    it('opens the dialog and renders the initial state with defaults', () => {
      renderModal();

      const dialog = screen.getByRole('dialog');
      const grid = getGrid();
      const rows = within(grid).getAllByRole('row');

      expect(dialog).toHaveAttribute('open');
      expect(screen.getByText('#10')).toBeInTheDocument();
      expect(screen.getByText('Guess the Centre-Forward')).toBeInTheDocument();
      expect(rows).toHaveLength(6);
      expect(within(grid).getAllByRole('gridcell')).toHaveLength(18);
      expect(grid).toHaveFocus();
      expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Guess 1 of 6' })).toBeDisabled();
    });

    it('declares explicit full-viewport dimensions on the dialog', () => {
      renderModal();

      expect(screen.getByRole('dialog')).toHaveClass('w-full', 'h-dvh');
    });

    it('renders Player and Player position fallbacks when values are missing', () => {
      renderModal({ shirtNumber: null, position: null });

      expect(screen.getByText('Player')).toBeInTheDocument();
      expect(screen.getByText('Guess the Player')).toBeInTheDocument();
    });

    it('keeps an unknown position code visible', () => {
      renderModal({ position: 'Libero' });

      expect(screen.getByText('Guess the Libero')).toBeInTheDocument();
    });

    it('renders previous guesses, current input, and remaining rows with key priorities', () => {
      const guesses: GuessResult[][] = [
        [makeResult('A', 'ABSENT'), makeResult('', 'ABSENT'), makeResult('C', 'ABSENT'), makeResult('X', 'ABSENT')],
        [makeResult('A', 'CORRECT'), makeResult('B', 'PRESENT'), makeResult('C', 'CORRECT'), makeResult('Y', 'PRESENT')],
      ];

      renderModal({
        nameLength: 4,
        wordBoundaries: [2],
        guesses,
        maxAttempts: 4,
      });

      const grid = getGrid();
      const rows = within(grid).getAllByRole('row');
      const firstRow = rows[0];

      expect(rows).toHaveLength(4);
      expect(screen.getByLabelText('A, ABSENT')).toBeInTheDocument();
      expect(screen.getAllByLabelText('empty').length).toBeGreaterThan(0);
      expect(screen.getByLabelText('C, ABSENT')).toBeInTheDocument();
      expect(screen.getByLabelText('A, CORRECT')).toBeInTheDocument();
      expect(screen.getByLabelText('B, PRESENT')).toBeInTheDocument();
      expect(screen.getByLabelText('X, ABSENT')).toBeInTheDocument();
      expect(screen.getByLabelText('Y, PRESENT')).toBeInTheDocument();
      expect(firstRow.children[2]).toHaveAttribute('aria-hidden', 'true');
      expect(grid.querySelectorAll('[aria-hidden="true"]')).toHaveLength(4);

      expect(screen.getByRole('button', { name: 'A' })).toHaveStyle({
        backgroundColor: 'var(--color-correct)',
        color: 'var(--color-chalk)',
      });
      expect(screen.getByRole('button', { name: 'B' })).toHaveStyle({
        backgroundColor: 'rgb(232, 160, 12)',
        color: 'var(--color-chalk)',
      });
      expect(screen.getByRole('button', { name: 'C' })).toHaveStyle({
        backgroundColor: 'var(--color-correct)',
        color: 'var(--color-chalk)',
      });
      expect(screen.getByRole('button', { name: 'X' })).toHaveStyle({
        backgroundColor: 'rgb(55, 65, 81)',
        color: 'var(--color-chalk)',
      });
      expect(screen.getByRole('button', { name: 'Q' })).toHaveStyle({
        backgroundColor: 'var(--color-ink/10)',
        color: 'var(--color-ink)',
      });
      expect(screen.getByLabelText('A, CORRECT')).toHaveStyle({
        backgroundColor: 'var(--color-correct)',
        color: 'var(--color-chalk)',
      });
      expect(screen.getByLabelText('B, PRESENT')).toHaveStyle({
        backgroundColor: 'rgb(232, 160, 12)',
        color: 'var(--color-chalk)',
      });
      expect(screen.getByLabelText('C, ABSENT')).toHaveStyle({
        backgroundColor: 'rgb(55, 65, 81)',
        color: 'var(--color-chalk)',
      });
      expect(screen.getByRole('button', { name: 'Guess 3 of 4' })).toBeDisabled();
      expect(within(grid).getAllByLabelText('empty').length).toBeGreaterThan(0);
    });

    it('renders a correct game-over state with no current row or Give Up action', () => {
      renderModal({
        guesses: [[makeResult('M', 'CORRECT'), makeResult('A', 'CORRECT'), makeResult('S', 'CORRECT')]],
        maxAttempts: 3,
        isGameOver: true,
        isCorrect: true,
      });

      const grid = getGrid();
      const submit = screen.getByRole('button', { name: 'Correct!' });

      expect(within(grid).getAllByRole('row')).toHaveLength(3);
      expect(within(grid).queryByLabelText('M')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Give Up' })).not.toBeInTheDocument();
      expect(submit).toBeDisabled();
      expect(submit).toHaveClass('bg-ink/10', 'text-ink/40', 'cursor-not-allowed');
      expect(screen.getByRole('button', { name: 'A' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    });

    it('renders a revealed game-over state when the guess was not correct', () => {
      renderModal({
        guesses: [[makeResult('X', 'ABSENT'), makeResult('Y', 'ABSENT'), makeResult('Z', 'ABSENT')]],
        maxAttempts: 2,
        isGameOver: true,
      });

      expect(screen.getByRole('button', { name: 'Revealed' })).toBeDisabled();
      expect(screen.queryByRole('button', { name: 'Give Up' })).not.toBeInTheDocument();
    });
  });

  describe('physical keyboard', () => {
    it('appends uppercase letters, respects the length limit, deletes, and ignores non-letters', async () => {
      const user = userEvent.setup();
      renderModal({ nameLength: 3 });
      const grid = getGrid();

      await user.keyboard('ab');
      expect(getCurrentLetter('A')).toBeInTheDocument();
      expect(getCurrentLetter('B')).toBeInTheDocument();

      fireEvent.keyDown(grid, { key: 'C' });
      expect(getCurrentLetter('C')).toBeInTheDocument();
      fireEvent.keyDown(grid, { key: 'D' });
      expect(getCurrentLetter('D')).not.toBeInTheDocument();

      fireEvent.keyDown(grid, { key: 'Backspace' });
      expect(getCurrentLetter('C')).not.toBeInTheDocument();
      expect(getCurrentLetter('A')).toBeInTheDocument();

      fireEvent.keyDown(grid, { key: '1' });
      fireEvent.keyDown(grid, { key: '?' });
      fireEvent.keyDown(grid, { key: 'ArrowLeft' });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(getCurrentLetter('A')).toBeInTheDocument();
      expect(getCurrentLetter('B')).toBeInTheDocument();
    });

    it('shows an error and shake animation when Enter is pressed with a short guess', () => {
      const { onGuess } = renderModal({ nameLength: 3 });
      const grid = getGrid();

      fireEvent.keyDown(grid, { key: 'A' });
      fireEvent.keyDown(grid, { key: 'Enter' });

      expect(onGuess).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent('Enter 3 letters');
      expect(getModalContent().getAttribute('style')).toContain('shake 300ms');
    });

    it('submits a full physical guess and clears the current row', () => {
      const { onGuess } = renderModal({ nameLength: 3 });
      const grid = getGrid();

      fireEvent.keyDown(grid, { key: 'a' });
      fireEvent.keyDown(grid, { key: 'b' });
      fireEvent.keyDown(grid, { key: 'c' });
      fireEvent.keyDown(grid, { key: 'Enter' });

      expect(onGuess).toHaveBeenCalledTimes(1);
      expect(onGuess).toHaveBeenCalledWith('ABC');
      expect(within(within(grid).getAllByRole('row')[0]).getAllByLabelText('empty')).toHaveLength(3);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('blocks physical input after the game is over', () => {
      const { onGuess } = renderModal({ isGameOver: true, isCorrect: false });
      const grid = getGrid();

      fireEvent.keyDown(grid, { key: 'A' });
      fireEvent.keyDown(grid, { key: 'Backspace' });
      fireEvent.keyDown(grid, { key: 'Enter' });

      expect(onGuess).not.toHaveBeenCalled();
      expect(within(grid).queryByLabelText('A')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('on-screen keyboard and action button', () => {
    it('handles letter, Delete, and Submit buttons and clears the short-guess error', async () => {
      const user = userEvent.setup();
      const { onGuess } = renderModal({ nameLength: 3 });
      const grid = getGrid();

      await user.click(screen.getByRole('button', { name: 'Submit' }));
      expect(screen.getByRole('alert')).toHaveTextContent('Enter 3 letters');

      await user.click(screen.getByRole('button', { name: 'A' }));
      await user.click(screen.getByRole('button', { name: 'B' }));
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      expect(getCurrentLetter('B')).not.toBeInTheDocument();
      expect(getCurrentLetter('A')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'C' }));
      await user.click(screen.getByRole('button', { name: 'D' }));
      await user.click(screen.getByRole('button', { name: 'Submit' }));

      expect(onGuess).toHaveBeenCalledTimes(1);
      expect(onGuess).toHaveBeenCalledWith('ACD');
      expect(within(within(grid).getAllByRole('row')[0]).getAllByLabelText('empty')).toHaveLength(3);
    });

    it('enables the action button only for a full guess and submits it', async () => {
      const user = userEvent.setup();
      const { onGuess } = renderModal({ nameLength: 2 });
      const submit = screen.getByRole('button', { name: 'Guess 1 of 6' });

      expect(submit).toBeDisabled();
      await user.click(screen.getByRole('button', { name: 'A' }));
      expect(submit).toBeDisabled();
      await user.click(screen.getByRole('button', { name: 'B' }));
      expect(submit).toBeEnabled();
      expect(submit).toHaveClass('bg-ink', 'text-chalk');

      await user.click(submit);

      expect(onGuess).toHaveBeenCalledWith('AB');
      expect(submit).toBeDisabled();
      expect(within(within(getGrid()).getAllByRole('row')[0]).getAllByLabelText('empty')).toHaveLength(2);
    });
  });

  describe('dismissal and accessibility', () => {
    it('closes from the backdrop but not from modal content', async () => {
      const user = userEvent.setup();
      const { onClose } = renderModal();

      await user.click(screen.getAllByRole('button', { name: 'Close modal' })[0]);
      expect(onClose).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByText('Guess the Centre-Forward'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes from the header close button and Give Up', async () => {
      const user = userEvent.setup();
      const { onClose } = renderModal();

      await user.click(screen.getAllByRole('button', { name: 'Close modal' })[1]);
      expect(onClose).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole('button', { name: 'Give Up' }));
      expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('handles a dispatched cancel event for Escape', () => {
      const { onClose } = renderModal();
      const dialog = screen.getByRole('dialog');
      const cancelEvent = new Event('cancel', { cancelable: true });

      fireEvent(dialog, cancelEvent);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('links the dialog title and description and exposes keyboard labels', () => {
      renderModal();
      const dialog = screen.getByRole('dialog');
      const title = screen.getByText('#10');
      const description = screen.getByText('Guess the Centre-Forward');

      expect(dialog).toHaveAttribute('aria-labelledby', title.id);
      expect(dialog).toHaveAttribute('aria-describedby', description.id);
      expect(dialog).toHaveAccessibleName('#10');
      expect(dialog).toHaveAccessibleDescription('Guess the Centre-Forward');
      expect(screen.getByRole('grid', { name: 'Guessing grid' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Submit' })).toHaveAttribute('aria-label', 'Submit');
      expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute('aria-label', 'Delete');
    });

    it('closes the native dialog on unmount', () => {
      const { unmount } = renderModal();
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('open');

      unmount();

      expect(dialog).not.toHaveAttribute('open');
    });
  });
});
