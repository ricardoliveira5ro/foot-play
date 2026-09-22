import { describe, it, expect } from 'vitest';
import {
  validateStringParam,
  validateNonNegativeIntParam,
  validateNumberField,
  validateNonEmptyStringField,
  validateEnumStringField,
} from '../../middleware/validate';

describe('validateStringParam', () => {
  it('returns the value when valid', () => {
    expect(validateStringParam('name', 'messi', { minLength: 3 })).toBe('messi');
  });

  it('defaults minLength to 1', () => {
    expect(validateStringParam('name', 'a')).toBe('a');
  });

  it('rejects non-string', () => {
    expect(validateStringParam('name', 42)).toEqual({ error: "Query parameter 'name' is required", code: 'INVALID_PARAMETER' });
  });

  it('rejects too-short string', () => {
    expect(validateStringParam('name', 'ab', { minLength: 3 })).toEqual({ error: "Query parameter 'name' must be at least 3 characters", code: 'INVALID_PARAMETER' });
  });
});

describe('validateNonNegativeIntParam', () => {
  it('returns parsed int for valid digits', () => {
    expect(validateNonNegativeIntParam('id', '42')).toBe(42);
  });

  it('accepts zero', () => {
    expect(validateNonNegativeIntParam('id', '0')).toBe(0);
  });

  it('rejects non-string', () => {
    expect(validateNonNegativeIntParam('id', 42)).toEqual({ error: "Path parameter 'id' is required", code: 'INVALID_PARAMETER' });
  });

  it('rejects empty/whitespace', () => {
    expect(validateNonNegativeIntParam('id', '  ')).toEqual({ error: "Path parameter 'id' is required", code: 'INVALID_PARAMETER' });
  });

  it('rejects negative', () => {
    expect(validateNonNegativeIntParam('id', '-1')).toEqual({ error: "Path parameter 'id' must be a non-negative integer", code: 'INVALID_PARAMETER' });
  });

  it('rejects fractional', () => {
    expect(validateNonNegativeIntParam('id', '1.5')).toEqual({ error: "Path parameter 'id' must be a non-negative integer", code: 'INVALID_PARAMETER' });
  });

  it('rejects non-numeric', () => {
    expect(validateNonNegativeIntParam('id', 'abc')).toEqual({ error: "Path parameter 'id' must be a non-negative integer", code: 'INVALID_PARAMETER' });
  });
});

describe('validateNumberField', () => {
  it('returns the number when valid', () => {
    expect(validateNumberField('gameId', 7)).toBe(7);
  });

  it('rejects non-number', () => {
    expect(validateNumberField('gameId', '7')).toEqual({ error: "Body field 'gameId' must be a number", code: 'INVALID_PARAMETER' });
  });

  it('rejects NaN', () => {
    expect(validateNumberField('gameId', NaN)).toEqual({ error: "Body field 'gameId' must be a number", code: 'INVALID_PARAMETER' });
  });
});

describe('validateNonEmptyStringField', () => {
  it('returns the value when valid', () => {
    expect(validateNonEmptyStringField('guess', 'Messi')).toBe('Messi');
  });

  it('rejects non-string', () => {
    expect(validateNonEmptyStringField('guess', 7)).toEqual({ error: "Body field 'guess' must be a non-empty string", code: 'INVALID_PARAMETER' });
  });

  it('rejects whitespace-only', () => {
    expect(validateNonEmptyStringField('guess', '   ')).toEqual({ error: "Body field 'guess' must be a non-empty string", code: 'INVALID_PARAMETER' });
  });
});

describe('validateEnumStringField', () => {
  it('returns the value when in allowed set', () => {
    expect(validateEnumStringField('teamSide', 'home', ['home', 'away'])).toBe('home');
  });

  it('rejects non-string', () => {
    expect(validateEnumStringField('teamSide', 1, ['home', 'away'])).toEqual({ error: "Body field 'teamSide' must be a non-empty string", code: 'INVALID_PARAMETER' });
  });

  it('rejects whitespace-only', () => {
    expect(validateEnumStringField('teamSide', '  ', ['home', 'away'])).toEqual({ error: "Body field 'teamSide' must be a non-empty string", code: 'INVALID_PARAMETER' });
  });

  it('rejects value outside allowed set', () => {
    expect(validateEnumStringField('teamSide', 'center', ['home', 'away'])).toEqual({ error: "Body field 'teamSide' must be one of: home, away", code: 'INVALID_PARAMETER' });
  });
});