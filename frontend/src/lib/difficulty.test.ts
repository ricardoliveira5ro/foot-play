import { describe, it, expect } from 'vitest';
import { DIFFICULTIES, DIFFICULTY_CONFIG, DEFAULT_DIFFICULTY, type Difficulty } from './difficulty';

const ALL: Difficulty[] = ['easy', 'normal', 'hard', 'expert'];

describe('DIFFICULTY_CONFIG', () => {
  it('defines an entry for every difficulty, with no extras', () => {
    expect(Object.keys(DIFFICULTY_CONFIG).sort()).toEqual([...ALL].sort());
  });

  it('matches the §5.1 table for every mode', () => {
    // The table is the spec. Asserting it row by row means a typo in one
    // cell fails one assertion instead of silently shipping.
    expect(DIFFICULTY_CONFIG.easy).toMatchObject({
      attempts: 6, multiplier: 0.5, showShirtNumber: true,
      showFirstLetter: true, showScorersClue: true, showCaptainClue: true,
      opponentRequired: false,
    });
    expect(DIFFICULTY_CONFIG.normal).toMatchObject({
      attempts: 6, multiplier: 1, showShirtNumber: true,
      showFirstLetter: false, showScorersClue: true, showCaptainClue: true,
      opponentRequired: false,
    });
    expect(DIFFICULTY_CONFIG.hard).toMatchObject({
      attempts: 6, multiplier: 2, showShirtNumber: false,
      showFirstLetter: false, showScorersClue: false, showCaptainClue: false,
      opponentRequired: false,
    });
    expect(DIFFICULTY_CONFIG.expert).toMatchObject({
      attempts: 3, multiplier: 3, showShirtNumber: false,
      showFirstLetter: false, showScorersClue: false, showCaptainClue: false,
      opponentRequired: true,
    });
  });

  it('gives every mode a non-empty human label', () => {
    for (const mode of ALL) expect(DIFFICULTY_CONFIG[mode].label.trim()).not.toBe('');
  });

  it('keeps Expert on 3 attempts and every other mode on 6', () => {
    expect(DIFFICULTY_CONFIG.expert.attempts).toBe(3);
    for (const mode of ALL.filter((m) => m !== 'expert')) {
      expect(DIFFICULTY_CONFIG[mode].attempts).toBe(6);
    }
  });
});

describe('DIFFICULTIES', () => {
  it('offers only the modes that have shipped, in ascending order', () => {
    expect(DIFFICULTIES).toEqual(['easy', 'normal', 'hard']);
  });

  it('still withholds Expert until v1.2.4', () => {
    expect(DIFFICULTIES).not.toContain('expert');
  });

  it('offers a subset of the config, in config order', () => {
    for (const mode of DIFFICULTIES) expect(DIFFICULTY_CONFIG[mode]).toBeDefined();
  });
});

describe('DEFAULT_DIFFICULTY', () => {
  it('is normal, which is the mode that matches the pre-v1.2 experience', () => {
    expect(DEFAULT_DIFFICULTY).toBe('normal');
    expect(DIFFICULTY_CONFIG[DEFAULT_DIFFICULTY].multiplier).toBe(1);
    expect(DIFFICULTY_CONFIG[DEFAULT_DIFFICULTY].attempts).toBe(6);
  });
});
