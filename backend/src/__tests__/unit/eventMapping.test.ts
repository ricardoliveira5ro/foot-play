import { describe, it, expect } from 'vitest';
import {
  MEASURED_SENDING_OFF_DESCRIPTIONS,
  classifyEvent,
  isOwnGoalDescription,
  isSendingOffDescription,
  isShootoutDescription,
  normalizeDescription,
  type EventCsvRow,
} from '../../lib/eventMapping';

function row(type: string, description: string): EventCsvRow {
  return { game_id: '1', player_id: '1', type, description };
}

describe('normalizeDescription', () => {
  it('collapses a run of whitespace to a single space', () => {
    expect(normalizeDescription('Red  card')).toBe('red card');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeDescription('   Goal  ')).toBe('goal');
  });

  it('lower-cases so case variants compare equal', () => {
    expect(normalizeDescription('Own Goal')).toBe('own goal');
  });

  it('returns an empty string for an empty description', () => {
    expect(normalizeDescription('')).toBe('');
  });
});

describe('isSendingOffDescription', () => {
  it('matches the literal Red card regardless of spacing', () => {
    expect(isSendingOffDescription('Red card')).toBe(true);
    expect(isSendingOffDescription('Red  card')).toBe(true);
    expect(isSendingOffDescription('  RED CARD ')).toBe(true);
  });

  // R2: every measured variant, not a sample. See the caveat in the
  // "freezes exactly the measured dismissal vocabulary" test below: this
  // iteration cannot fail on the list's *content*, only the other test guards it.
  it.each(MEASURED_SENDING_OFF_DESCRIPTIONS)(
    'matches the measured sending-off variant %j',
    (description) => {
      expect(isSendingOffDescription(description)).toBe(true);
    },
  );

  // R2's real guard. `it.each` above is a tautology — the matcher builds its
  // Set FROM this constant, so it cannot fail for any content of the list, and
  // vitest collects zero cases from an empty table without failing. This test
  // is what makes the constant's length and composition falsifiable, so a
  // tool regression that injects ", Scored" or a truncated list fails here
  // instead of silently inflating redCards.
  it('freezes exactly the measured dismissal vocabulary (R2)', () => {
    expect(MEASURED_SENDING_OFF_DESCRIPTIONS).toHaveLength(33);
    for (const description of MEASURED_SENDING_OFF_DESCRIPTIONS) {
      expect(description).toMatch(/^(Red card|Second yellow)(\b| {2}, )/);
      expect(description).not.toContain('Scored');
      expect(description.toLowerCase()).not.toContain('goal');
    }
  });

  it('does not match a plain yellow card', () => {
    expect(isSendingOffDescription('1. Yellow card  , Foul')).toBe(false);
  });

  it('does not match the "Sco-RED" shootout trap', () => {
    expect(isSendingOffDescription(', Scored')).toBe(false);
  });

  it('does not match tournament goal numbering containing "2."', () => {
    expect(isSendingOffDescription(', 2. Goal of the Season Assist: , Pass, 1. Tournament Assist')).toBe(false);
  });

  it('does not match an empty description', () => {
    expect(isSendingOffDescription('')).toBe(false);
  });
});

describe('isShootoutDescription', () => {
  it('matches a description that names a shootout', () => {
    expect(isShootoutDescription('Goal, penalty shootout')).toBe(true);
  });

  it('matches a hyphenated shootout label', () => {
    expect(isShootoutDescription('Penalty  Shootout')).toBe(true);
  });

  it('does not match a regular penalty goal', () => {
    expect(isShootoutDescription(', Penalty, 1. Tournament Goal')).toBe(false);
  });

  it('does not match the measured shootout description, which omits the word', () => {
    // Proves why classifyEvent must also key off the type column.
    expect(isShootoutDescription(', Scored')).toBe(false);
  });

  it('does not match an empty description', () => {
    expect(isShootoutDescription('')).toBe(false);
  });
});

describe('isOwnGoalDescription', () => {
  it('matches the hyphenated own-goal label the file actually uses', () => {
    expect(isOwnGoalDescription(', Own-goal')).toBe(true);
  });

  it('matches the spaced own-goal label', () => {
    expect(isOwnGoalDescription('Own goal')).toBe(true);
  });

  it('matches the underscored own-goal label', () => {
    expect(isOwnGoalDescription('own_goal')).toBe(true);
  });

  it('does not match a regular goal', () => {
    expect(isOwnGoalDescription(', Right-footed shot')).toBe(false);
  });

  it('does not match an empty description', () => {
    expect(isOwnGoalDescription('')).toBe(false);
  });
});

describe('classifyEvent', () => {
  // Every fixture below uses the measured vocabulary: type is one of
  // Cards | Goals | Substitutions | Shootout, and descriptions are prefixed
  // with ", " except on Cards rows.

  it('classifies a direct red card', () => {
    expect(classifyEvent(row('Cards', 'Red card'))).toBe('red_card');
  });

  it('classifies a direct red card with a reason suffix', () => {
    expect(classifyEvent(row('Cards', 'Red card  , Serious foul'))).toBe('red_card');
  });

  it('classifies a second-yellow dismissal as a dismissal, not a plain yellow', () => {
    expect(classifyEvent(row('Cards', 'Second yellow  , Foul'))).toBe('second_yellow');
  });

  it('classifies a plain yellow card', () => {
    expect(classifyEvent(row('Cards', '1. Yellow card  , Foul'))).toBe('yellow_card');
  });

  it('classifies a numbered yellow card as a plain yellow, not a dismissal', () => {
    // "2." is the player's card count here, NOT a second yellow.
    expect(classifyEvent(row('Cards', '2. Yellow card  , Foul'))).toBe('yellow_card');
  });

  it('classifies a shootout from the type column', () => {
    // No description contains "shootout"; the type value is the only signal.
    expect(classifyEvent(row('Shootout', ', Scored'))).toBe('shootout_goal');
  });

  it('classifies a missed shootout as a shootout goal, not a goal', () => {
    expect(classifyEvent(row('Shootout', ', Missed'))).toBe('shootout_goal');
  });

  it('classifies a substitution from the type column', () => {
    // ", Tactical" never contains "substituted".
    expect(classifyEvent(row('Substitutions', ', Tactical'))).toBe('substitution');
  });

  it('classifies an empty-described substitution', () => {
    expect(classifyEvent(row('Substitutions', ''))).toBe('substitution');
  });

  it('classifies a penalty goal from the leading description', () => {
    expect(classifyEvent(row('Goals', ', Penalty, 1. Tournament Goal'))).toBe('penalty');
  });

  it('does not mistake a goal whose assist reason mentions a penalty for a penalty goal', () => {
    expect(classifyEvent(row('Goals', ', Penalty, 1. Tournament Goal Assist: , Penalty: Fouled player'))).toBe('penalty');
    expect(classifyEvent(row('Goals', ', Right-footed shot, 1. Goal of the Season Assist: , Penalty: Fouled player'))).toBe('goal');
  });

  it('classifies a regular goal', () => {
    expect(classifyEvent(row('Goals', ', Right-footed shot'))).toBe('goal');
  });

  it('classifies an own goal from the description (O5 — the hyphen spelling)', () => {
    expect(classifyEvent(row('Goals', ', Own-goal'))).toBe('own_goal');
    expect(classifyEvent(row('Goals', ', Own-goal Assist: , Cross, 1. Tournament Assist'))).toBe('own_goal');
  });

  it('classifies an own goal from the type column', () => {
    expect(classifyEvent(row('own_goal', 'Own goal, , '))).toBe('own_goal');
  });

  it('classifies a row whose type is a bare penalty token', () => {
    expect(classifyEvent(row('penalty', ''))).toBe('penalty');
  });

  it('tolerates the retired singular "goal" type token', () => {
    // Defensive tolerance, not a real vocabulary: the measurement proves
    // every Goals row carries the plural 'Goals'. This case exists so the
    // branch is genuinely TAKEN rather than merely evaluated — under v8
    // coverage a covered `||` operand only proves it was read.
    expect(classifyEvent(row('goal', 'Goal'))).toBe('goal');
  });

  it('falls back to a red card for a Cards row with no recognised description', () => {
    expect(classifyEvent(row('Cards', ''))).toBe('red_card');
  });

  it('falls back to other for an unrecognised row', () => {
    expect(classifyEvent(row('', ''))).toBe('other');
  });
});
