/**
 * Pure param/query validation helpers.
 *
 * Each helper returns either the validated value or a `ValidationError`
 * matching the API error contract: `{ error, code }` with code
 * `INVALID_PARAMETER`. Routes (Tasks 3.3/3.4) narrow the result with
 * `'error' in result` and respond 400 with the error object as-is.
 */

export type ValidationError = {
  error: string;
  code: 'INVALID_PARAMETER';
};

export type ValidationResult<T> = T | ValidationError;

const invalidParameter = (error: string): ValidationError => ({
  error,
  code: 'INVALID_PARAMETER',
});

/**
 * Validates a string query parameter: required and at least `minLength`
 * characters (e.g. `?q=` for player search, min 2).
 */
export const validateStringParam = (
  name: string,
  value: unknown,
  options: { minLength?: number } = {}
): ValidationResult<string> => {
  if (typeof value !== 'string') {
    return invalidParameter(`Query parameter '${name}' is required`);
  }

  const minLength = options.minLength ?? 1;
  if (value.length < minLength) {
    return invalidParameter(
      `Query parameter '${name}' must be at least ${minLength} characters`
    );
  }

  return value;
};

/**
 * Validates a path parameter as a non-negative integer (e.g. `:id` for
 * match lookup). Non-numeric, negative, or fractional values are rejected.
 */
export const validateNonNegativeIntParam = (
  name: string,
  value: unknown
): ValidationResult<number> => {
  if (typeof value !== 'string' || value.trim() === '') {
    return invalidParameter(`Path parameter '${name}' is required`);
  }

  if (!/^\d+$/.test(value)) {
    return invalidParameter(
      `Path parameter '${name}' must be a non-negative integer`
    );
  }

  return parseInt(value, 10);
};