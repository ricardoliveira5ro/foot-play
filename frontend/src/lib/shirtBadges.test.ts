import { describe, it, expect } from 'vitest';
import { badgesForShirt } from './shirtBadges';

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
