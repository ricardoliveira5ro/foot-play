/**
 * Vitest setup — runs before every test file (node and jsdom environments).
 *
 * Lives outside `src/` so it stays out of the coverage report (the coverage
 * include glob targets `src` only) and out of Sonar analysis
 * (`sonar.sources=frontend/src,...`), while still being type-checked
 * (`tsconfig` includes all `.ts` files) and linted.
 *
 * DOM-dependent parts are guarded by `typeof document !== 'undefined'` so the
 * default node-environment lib tests (95 tests) are unaffected.
 *
 * - jest-dom matchers: `@testing-library/jest-dom/vitest` is the correct
 *   import path for the installed version (6.9.1; the `./vitest` export
 *   augments vitest's `expect`). It is a static import because ESM imports
 *   are hoisted and cannot be conditional, and the frontend package is parsed
 *   as CommonJS (no `"type": "module"`), which rejects top-level `await`.
 *   This is safe in node env: the entry only calls `expect.extend()` at load
 *   time and never touches `document`/`window` until a matcher is invoked.
 * - RTL auto-cleanup does NOT fire here: vitest `globals` are off, so the
 *   global `afterEach` that `@testing-library/react` checks for at module
 *   load is never defined. Register cleanup explicitly. `cleanup()` is a
 *   no-op when nothing was rendered, so it is safe for node-env tests too.
 * - jsdom does not implement `HTMLDialogElement.showModal()`/`close()`
 *   (jsdom issue #3294). Install a guarded, idempotent polyfill that sets
 *   `open` and dispatches a `close` event. Escape-close tests dispatch a
 *   `cancel` event manually — the polyfill must not interfere with that.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);

if (typeof document !== 'undefined') {
  // <dialog> polyfill (jsdom issue #3294). Function expressions (not arrows)
  // so `this` binds to the dialog element.
  if (typeof HTMLDialogElement !== 'undefined') {
    if (!HTMLDialogElement.prototype.showModal) {
      HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
        this.open = true;
      };
    }
    if (!HTMLDialogElement.prototype.close) {
      HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
        this.open = false;
        this.dispatchEvent(new Event('close'));
      };
    }
  }
}