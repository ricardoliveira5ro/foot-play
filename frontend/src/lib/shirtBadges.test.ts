import { describe, it, expect } from 'vitest';
import { badgesForShirt, availableClues, type ShirtClue } from './shirtBadges';

describe('badgesForShirt', () => {
  it('returns no badges when the game has no event data', () => {
    expect(badgesForShirt({ goals: 0, redCards: 0 })).toEqual([]);
  });

  it('returns a scorer badge when the player scored', () => {
    expect(badgesForShirt({ goals: 1, redCards: 0 })).toEqual(['scorer']);
  });

  it('returns a send-off badge when the player was dismissed', () => {
    expect(badgesForShirt({ goals: 0, redCards: 1 })).toEqual(['sent-off']);
  });

  it('returns both badges, scorer first, when both apply', () => {
    expect(badgesForShirt({ goals: 1, redCards: 1 })).toEqual(['scorer', 'sent-off']);
  });

  it('returns one scorer badge per goal', () => {
    expect(badgesForShirt({ goals: 3, redCards: 0 })).toEqual(['scorer', 'scorer', 'scorer']);
  });

  it('renders one send-off badge for multiple dismissals', () => {
    expect(badgesForShirt({ goals: 0, redCards: 2 })).toEqual(['sent-off']);
  });

  it('ignores a negative count rather than rendering a badge', () => {
    expect(badgesForShirt({ goals: -1, redCards: -1 })).toEqual([]);
  });
});

const ORDER: ShirtClue[] = ['first-letter', 'scorers', 'captain', 'shirt-number'];

describe('availableClues', () => {
  const bare = { goals: 0, redCards: 0, isCaptain: false, hasFirstLetter: false };

  it('gives Easy every permitted clue when the data supports all of them', () => {
    expect(
      availableClues('easy', { goals: 2, redCards: 0, isCaptain: true, hasFirstLetter: true }),
    ).toEqual(['first-letter', 'scorers', 'captain', 'shirt-number']);
  });

  it('gives Normal the scorers and captain clues but never the first letter', () => {
    const clues = availableClues('normal', { goals: 2, redCards: 0, isCaptain: true, hasFirstLetter: true });
    expect(clues).toEqual(['scorers', 'captain', 'shirt-number']);
    expect(clues).not.toContain('first-letter');
  });

  it('gives Hard and Expert no data-driven clues, only the shirt number', () => {
    for (const mode of ['hard', 'expert'] as const) {
      expect(availableClues(mode, { goals: 3, redCards: 1, isCaptain: true, hasFirstLetter: true }))
        .toEqual(['shirt-number']);
    }
  });

  it('omits the first letter when the mode permits it but the name has none', () => {
    expect(availableClues('easy', { ...bare, hasFirstLetter: false }))
      .not.toContain('first-letter');
  });

  it('omits the scorers clue when the player scored nothing', () => {
    expect(availableClues('normal', { ...bare, goals: 0 })).not.toContain('scorers');
  });

  it('omits the captain clue for a non-captain', () => {
    expect(availableClues('normal', { ...bare, isCaptain: false })).not.toContain('captain');
  });

  it('degrades to just the shirt number when there is no event data at all', () => {
    // A shirt with no scorers row, no captain row and no first letter is the
    // 227-games-with-no-captain case (§5.5) and the 530-games-with-no-events
    // case. Neither is an error; the shirt simply has fewer clues.
    expect(availableClues('easy', bare)).toEqual(['shirt-number']);
    expect(availableClues('normal', bare)).toEqual(['shirt-number']);
  });

  it('never produces a clue from redCards, in any mode', () => {
    // O5: the send-off icon is decoration in every mode. A red-carded player
    // with no other data gains nothing.
    for (const mode of ['easy', 'normal', 'hard', 'expert'] as const) {
      const withCard = availableClues(mode, { ...bare, redCards: 1 });
      const without = availableClues(mode, { ...bare, redCards: 0 });
      expect(withCard).toEqual(without);
      expect(withCard).not.toContain('captain');
      expect(withCard).not.toContain('scorers');
    }
  });

  it('returns clues in the fixed display order regardless of the input shape', () => {
    const clues = availableClues('easy', { goals: 1, redCards: 0, isCaptain: true, hasFirstLetter: true });
    const order = ORDER;
    expect(clues).toEqual([...clues].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
  });
});

