# Dev 7 — Frontend Test Coverage in SonarCloud

**Status**: `spec` — ready for implementation
**Branch**: `quality-gate`
**Scope**: full (infrastructure + all coverage-raising items), phased
**Estimated scope**: `large` (phased: Phase 1 small, Phase 2 small, Phase 3 large)

---

## 1. Problem Statement

SonarCloud reports **0% frontend coverage** for two independent reasons:

1. `sonar-project.properties` (root) sets `sonar.javascript.lcov.reportPaths` and the
   deprecated `sonar.typescript.lcov.reportPaths` **both** to `backend/coverage/lcov.info`
   only. No frontend lcov path is registered.
2. CI (`.github/workflows/deploy.yml`) has **no frontend test job/step**. Frontend tests
   never run in CI, so no `frontend/coverage/lcov.info` exists in the workspace when the
   Sonar scan step runs.

The frontend already has 79 passing tests (3 files), but they only exercise 3 lib files
(`wordle.ts`, `colorUtils.ts`, `gameState.ts` reducer). `teamColors.ts` (79 lines),
`WordleModal.tsx` (578 lines), and `GameComplete.tsx` (271 lines) have zero coverage, and
the `useGameState` hook (lines 341–404 of `gameState.ts`) is untested.

## 2. Context (verified facts)

| Fact | Evidence |
| --- | --- |
| Sonar sources: `frontend/src,backend/src`; tests: `backend/src/__tests__` only | `sonar-project.properties` |
| Both lcov report paths point only at `backend/coverage/lcov.info`; `sonar.typescript.lcov.reportPaths` is deprecated | `sonar-project.properties` lines 5–6 |
| CI jobs: `frontend-lint`, `backend-lint`, `backend-build`, `backend-test` (backend `test:coverage` → Sonar scan → quality gate), `deploy` | `.github/workflows/deploy.yml` |
| Frontend vitest: `include: ['src/**/*.test.ts']`, `environment: 'node'`, alias `@` → frontend root, no coverage block | `frontend/vitest.config.ts` |
| Frontend scripts: `test: vitest run`; `vitest ^5.0.0`; **no** `@vitest/coverage-*` declared (hoisted from backend via root lockfile — `@vitest/coverage-v8@5.0.0` present in `package-lock.json`) | `frontend/package.json`, lockfile |
| Backend pattern to mirror: `@vitest/coverage-v8 ^5.0.0`, `test:coverage: vitest run --coverage`, reporters `text/html/json-summary/lcov`, thresholds 95%, lcov at `backend/coverage/lcov.info` (gitignored) | `backend/package.json`, `backend/vitest.config.ts` |
| Baseline (measured 2026-09-24): 79 tests pass, 3 files | `npx vitest run` in `frontend` |
| Tested files only: statements 83%, branches 90.83%, functions 76.36%, lines 81.31% | `frontend/coverage/lcov.info` (LF: wordle 59, gameState 105, colorUtils 17) |
| Per-file gaps: `wordle.ts` 88.14% (`getCorrectLettersByLength` untested; combining-diacritic branch of `getWordBoundaries` untested — existing `'Nico Gaitán'` test uses precomposed `á`, which never hits the `[\u0300-\u036f]` branch); `gameState.ts` 74.29% (line 85 `pickSide` fallback + `useGameState` hook action creators); `teamColors.ts` 0%; `WordleModal.tsx` 0%; `GameComplete.tsx` 0% | lcov + source inspection |
| Sonar-visible lines coverage after wiring ≈ 15% (untested files count as 0%) | research |
| SonarJS matches lcov `SF:` paths by suffix; `frontend/src/**` vs `backend/src/**` suffixes are unique today (no collisions) | research |
| `frontend/components/Shirt.colors.test.tsx` is type-check-only (no `describe`/`it`), outside `src/`, not matched by vitest include — leave untouched | source inspection |
| `frontend/.gitignore` already ignores `/coverage` | file |
| jsdom does **not** implement `HTMLDialogElement.showModal()`/`close()` (jsdom issue #3294 open; PRs #3403/#3890 unmerged). Standard workaround: guarded polyfill in a vitest setup file | web research 2026-09-24 |
| `@testing-library/react` v16 requires `@testing-library/dom` (^10) as an explicit peer dependency; supports React 19 | RTL v16 release notes / README |
| `@testing-library/*` packages are **not** in the lockfile today; `jsdom` appears only as an optional peer of `@vitest/coverage-v8` (not installed) | lockfile grep |
| Roadmap v1.1 target: "80%+ coverage on game-logic modules" | `docs/roadmap.md` |

## 3. Objective

Bring full frontend test coverage to SonarCloud:

1. **Phase 1** — wire frontend coverage generation into the local toolchain, Sonar config, and CI (no thresholds yet).
2. **Phase 2** — close lib coverage gaps with zero new dependencies (`teamColors.ts`, `wordle.ts`, one `gameState.ts` reducer branch).
3. **Phase 3** — add component/hook coverage (`useGameState` hook, `GameComplete.tsx`, `WordleModal.tsx`) with new devDependencies (`@testing-library/*`, `jsdom`).

App behavior must not change. The existing SonarCloud quality gate must stay green. No new Sonar findings may be introduced.

## 4. Non-Goals

- **No coverage thresholds** in `frontend/vitest.config.ts` (baseline ~15% would fail CI). Thresholds toward the roadmap's 80% target are a **later, out-of-scope follow-up** (see §12).
- **No expansion of `sonar.sources`** to root-level frontend dirs (`frontend/lib`, `frontend/components`, `frontend/app`) — would tank coverage further; separate decision.
- **No Playwright/E2E tests** (roadmap v1.1 mentions them; not part of this work).
- **No production-code refactors** to make code testable (e.g., extracting `useGameState` action creators to pure functions) — hook is covered via `renderHook` instead.
- **No backend changes** of any kind.
- **No fixing of pre-existing Sonar findings** unrelated to this work.
- **No coverage for** `frontend/lib`, `frontend/components`, `frontend/app` (outside `sonar.sources`).
- **No page-level/integration tests** (e.g., `app/missing-eleven/page.tsx` with API mocking).
- **No changes to** `frontend/components/Shirt.colors.test.tsx`.

## 5. Inputs Used

- `sonar-project.properties`, `.github/workflows/deploy.yml`
- `frontend/vitest.config.ts`, `frontend/package.json`, `frontend/tsconfig.json`, `frontend/eslint.config.mjs`, `frontend/.gitignore`
- `backend/vitest.config.ts`, `backend/package.json` (pattern to mirror)
- `frontend/src/lib/{wordle,colorUtils,gameState,teamColors}.ts` + existing tests
- `frontend/src/components/{WordleModal,GameComplete}.tsx`, `frontend/components/TeamTabBar.tsx`, `frontend/types/index.ts`, `frontend/app/missing-eleven/page.tsx`
- `frontend/coverage/lcov.info`, `backend/coverage/lcov.info`, `package-lock.json`
- `docs/roadmap.md` (v1.1 testing milestone)
- Web research: jsdom `<dialog>` status, RTL v16 peer deps

## 6. Assumptions

- Research baseline numbers (79 tests; per-file coverage; ≈15% Sonar-visible after wiring) are accurate — spot-verified against `frontend/coverage/lcov.info` and a fresh `npx vitest run`.
- SonarJS lcov `SF:` suffix matching works for `frontend/src/**` vs `backend/src/**` (no collisions; kept unique).
- The SonarCloud quality gate has no coverage threshold configured (coverage is informational) — gate stays green as long as no new findings are introduced.
- npm workspaces hoisting: adding `@vitest/coverage-v8` to `frontend/package.json` resolves to the already-locked `5.0.0`; new `@testing-library/*` + `jsdom` packages install cleanly under Node 24 (CI) and the local Node.
- `npm install` at the repo root (as CI does) installs all workspaces including new frontend devDeps.
- Vitest 5's jsdom environment works with the latest jsdom release (jsdom ≥ 25 supported).

## 7. Requirements

### Phase 1 — Coverage infrastructure (small)

**R1.1** `frontend/vitest.config.ts`:
- Add `test.coverage` block: `provider: 'v8'`, `reporter: ['text', 'json-summary', 'lcov']`, `include: ['src/**/*.{ts,tsx}']`, `exclude: ['src/**/*.test.{ts,tsx}']`.
- **No `thresholds`** in this phase.
- Update `test.include` from `['src/**/*.test.ts']` to `['src/**/*.test.{ts,tsx}']` (required so Phase 3's `.test.tsx` component tests are discovered; harmless in Phase 1).
- Keep `environment: 'node'` as the default (component tests opt into jsdom per-file — see D2).

**R1.2** `frontend/package.json`:
- Add script `"test:coverage": "vitest run --coverage"`.
- Add devDependency `"@vitest/coverage-v8": "^5.0.0"` (mirrors backend; already in lockfile).

**R1.3** `sonar-project.properties`:
- `sonar.javascript.lcov.reportPaths=backend/coverage/lcov.info,frontend/coverage/lcov.info`
- Remove deprecated `sonar.typescript.lcov.reportPaths`.
- Extend `sonar.exclusions` with `frontend/src/**/*.test.*` (frontend test files are inside `sonar.sources` today and are analyzed as untested prod code — this both tanks coverage and exposes test code to findings). Pattern uses `*.test.*` because SonarQube path patterns do not support `{ts,tsx}` alternation.

**R1.4** `.github/workflows/deploy.yml`:
- In the `backend-test` job, add a step before `SonarQube Scan`:
  ```yaml
  - name: Run frontend tests with coverage
    working-directory: frontend
    run: npm run test:coverage
  ```
- Rename the job's display `name` to reflect the broader role (e.g., "Tests, Coverage & Sonar Scan"). **Keep the job id `backend-test`** so `deploy`'s `needs: [frontend-lint, backend-lint, backend-build, backend-test]` is untouched.
- No artifact upload/download (see D1).

### Phase 2 — Lib coverage (no new deps, ~1 h)

**R2.1** New `frontend/src/lib/teamColors.test.ts`:
- `getTeamColors(null)` → `DEFAULT_TEAM_COLORS`; `getTeamColors(undefined)` → default; known id (e.g., `131` Barcelona) → exact entry incl. `pattern`; known id with `numberOutline` (e.g., `13` Atlético) → entry incl. `numberOutline: true`; unknown id (e.g., `999999`) → default; a second known id (e.g., `3300` Portugal) for map coverage.

**R2.2** Extend `frontend/src/lib/wordle.test.ts`:
- `getCorrectLettersByLength`: no guesses → all-null array of given length; correct guess fills positions (uppercased); partial guess fills only correct positions; accumulates across guesses; guess longer than `length` truncates; `length` 0 → `[]`.
- `getWordBoundaries` combining-diacritic branch: `getWordBoundaries('Nico Gaita\u0301n')` (decomposed `a` + U+0301) → `[4]` — the existing `'Nico Gaitán'` test uses precomposed `á` and never executes the `[\u0300-\u036f]` `continue` branch.

**R2.3** Extend `frontend/src/lib/gameState.test.ts` (reducer, node env):
- `pickSide` fallback branch (line 85): match where the preferred (curated) side has an **empty** lineup but the other side has players → picks the non-empty side. (Both-empty throw is already covered.)

### Phase 3 — Component/hook coverage (new devDeps)

**R3.1** New devDeps in `frontend/package.json`:
- `@testing-library/react` (^16), `@testing-library/dom` (^10 — required peer of RTL v16), `@testing-library/user-event` (^14), `@testing-library/jest-dom` (^6), `jsdom` (latest stable; vitest 5 supports jsdom ≥ 25).

**R3.2** New `frontend/vitest.setup.ts` (outside `src/` so it stays out of coverage and Sonar analysis):
- Guarded DOM-only block (`typeof document !== 'undefined'`):
  - `import '@testing-library/jest-dom/vitest'` (lazy, inside guard)
  - `import { cleanup } from '@testing-library/react'; import { afterEach } from 'vitest'; afterEach(cleanup);` (RTL auto-cleanup does not trigger because vitest `globals` are off)
  - `<dialog>` polyfill (jsdom lacks `showModal`/`close`):
    ```ts
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
    ```
    Must use `function` (not arrow) so `this` binds correctly.
- Wire via `setupFiles: ['./vitest.setup.ts']` in `frontend/vitest.config.ts`.

**R3.3** New `frontend/src/lib/gameState.hook.test.ts` (jsdom docblock):
- `// @vitest-environment jsdom` at top.
- One `renderHook(() => useGameState())`; drive each action creator inside `act()` and assert state transitions: `startNewGame` (SET_MATCH → playing), `selectTeam`, `toggleBoard`, `openShirt`/`closeShirt`, `submitGuess` (correct + wrong), `revealName`, `surrender`, `newGame` (→ initialState), `setError`, `setLoading`. Reuse the fixture helpers from `gameState.test.ts` (extract to a shared fixture module or duplicate minimal fixtures — developer's choice, prefer extraction to `src/lib/gameState.fixtures.ts` if it stays inside `src/` and is excluded from coverage via the `*.test.*` pattern... note: fixture files must be named `*.test.ts`-adjacent or added to coverage exclude; simplest is to keep fixtures inline in each test file).

**R3.4** New `frontend/src/components/GameComplete.test.tsx` (jsdom docblock):
- Renders "Perfect Score!" when all shirts correct; "Game Over" + `You identified X of Y players` otherwise.
- Renders score, team names, competition, formatted date (`en-GB` long format); invalid date → raw string; `null` date → falls back to season.
- Player rows sorted by `POSITION_ORDER`; revealed names shown for correct/failed shirts; `—` when no revealed name; `Correct`/`Failed` aria badges; shirt-number aria labels.
- Tab switching: click opponent tab → opponent section renders (user-event).
- "Play Again" calls `onPlayAgain`.
- Dialog opens on mount (polyfilled `showModal` → `open` attribute present); `onCancel` preventDefault does not crash.

**R3.5** New `frontend/src/components/WordleModal.test.tsx` (jsdom docblock) — the large one:
- **Render states**: initial (title `#<shirtNumber>` or `Player`, position label, `maxAttempts` rows, keyboard present, submit label `Guess 1 of 6`, submit disabled with empty input); in-progress (previous guess rows with tile aria-labels like `M, CORRECT`; keyboard key states correct/present/absent with priority); game over (`Correct!`/`Revealed` label, keyboard disabled, no current row, "Give Up" hidden).
- **Physical keyboard** (grid is auto-focused on mount; use `userEvent.keyboard` or `fireEvent.keyDown` on the grid): letters append (uppercased) up to `nameLength`; Backspace removes; Enter with full length calls `onGuess` and clears input; Enter with short input sets error `Enter N letters` and increments shake; non-letter keys ignored; `isGameOver` blocks all input.
- **On-screen keyboard**: letter buttons append; Enter submits; Backspace deletes; buttons disabled when game over.
- **Word boundaries**: spacer tiles rendered with `aria-hidden` before boundary indices.
- **Close paths**: backdrop click → `onClose`; content click → NOT `onClose`; header close button → `onClose`; "Give Up" → `onClose`; Escape → `onClose` (jsdom has no native dialog Escape handling — dispatch `new Event('cancel', { cancelable: true })` on the `<dialog>` element; React's `onCancel` fires).
- **Aria**: `aria-labelledby`/`aria-describedby` resolve to title/desc; grid `role="grid"`; keyboard buttons have `aria-label` (`Delete`, `Submit`).

## 8. Technical Decisions

| # | Decision | Choice | Justification |
| --- | --- | --- | --- |
| D1 | CI: inline frontend steps vs separate job + artifacts | **Inline steps in `backend-test` job** (keep job id, rename display name) | The Sonar scan already lives in that job and needs the lcov in the same workspace. A separate `frontend-test` job would require artifact upload/download **and** an ordering guarantee (either `needs:` on `backend-test`, which serializes and defeats parallelism, or moving the scan to a third job — a bigger refactor). Inline is simpler, has fewer failure modes, and the scan step already runs after tests. |
| D2 | jsdom environment: global vs per-file | **Per-file `// @vitest-environment jsdom` docblock** on the 3 DOM test files; default stays `node` | Zero risk to the existing node-env lib tests (no behavior change, no slowdown); jsdom only where needed; matches the ecosystem's proven pattern for mixed-env suites. |
| D3 | `useGameState` hook coverage: `renderHook` vs extracting action creators to pure functions | **`renderHook`** | Extraction would touch production code (violates "behavior must not change" spirit and adds review surface). The hook is a thin `useReducer` + `useCallback` wrapper — one `renderHook` + `act()` per action creator covers it with minimal test volume. |
| D4 | Setup file location | `frontend/vitest.setup.ts` (frontend root, outside `src/`) | Keeps it out of the coverage report (`include: src/**`) and out of Sonar analysis (`sonar.sources=frontend/src,...`), while still being type-checked (`tsconfig` includes `**/*.ts`) and linted. |
| D5 | Frontend test files in Sonar | Add `frontend/src/**/*.test.*` to `sonar.exclusions` (required, not optional) | Today they are inside `sonar.sources` and analyzed as untested prod code (0% coverage entries + findings surface). Excluding matches the existing backend pattern (`backend/src/__tests__/**`). |
| D6 | Coverage/test globs | `include: ['src/**/*.{ts,tsx}']`, `exclude: ['src/**/*.test.{ts,tsx}']`, test `include: ['src/**/*.test.{ts,tsx}']` | Vitest uses micromatch (supports `{}`); the `{ts,tsx}` form is required so Phase 3 `.test.tsx` files are both discovered and excluded from coverage. |
| D7 | Coverage thresholds | **None in Phase 1** | Baseline ~15% would fail any threshold. Thresholds are a later phase (see §12). |
| D8 | `<dialog>` in jsdom | Guarded polyfill in `vitest.setup.ts` (function-based, sets `open`, dispatches `close`) | jsdom issue #3294 still open; this is the standard workaround. Escape-close tests dispatch a `cancel` event manually since jsdom has no native dialog behavior. |

## 9. UX/UI Decisions

None. Tests and configuration only; no user-visible behavior changes.

## 10. Acceptance Criteria

### Overall
- [ ] `npm run test:coverage` (frontend) passes with all tests green and produces `frontend/coverage/lcov.info` containing `SF:` entries for all `frontend/src/**/*.{ts,tsx}` files.
- [ ] `sonar-project.properties` references both lcov files via `sonar.javascript.lcov.reportPaths`; deprecated `sonar.typescript.lcov.reportPaths` removed; `frontend/src/**/*.test.*` excluded.
- [ ] CI runs frontend tests + coverage before the Sonar scan; quality gate stays green; no new Sonar findings.
- [ ] SonarCloud shows non-zero frontend coverage (per-file data for every `frontend/src` file).
- [ ] No production code changed (`git diff` touches only config, CI, and test files).
- [ ] `npx tsc --noEmit` (frontend) and `npm run lint` (frontend) pass.

### Per-phase
- **Phase 1**: `frontend/coverage/lcov.info` generated locally; `npx vitest run` still 79/79 green; Sonar config valid.
- **Phase 2**: `teamColors.ts` lines 100%; `wordle.ts` lines 100%; `gameState.ts` lines ≥ 78% (line-85 branch covered).
- **Phase 3**: `gameState.ts` lines ≥ 95%; `GameComplete.tsx` lines ≥ 90%; `WordleModal.tsx` lines ≥ 85% (target 90%); full suite green; lint + tsc green.

## 11. Validation Plan

All commands run from repo root unless noted. Expected numbers are targets, not gates (no thresholds configured).

### Phase 1
```bash
cd frontend && npm run test:coverage        # all tests green; coverage report printed; frontend/coverage/lcov.info created
npx vitest run                              # still 79/79
npx tsc --noEmit                            # type check incl. new config
npm run lint                                # eslint flat config
```
- Inspect `frontend/coverage/lcov.info`: `SF:` entries are `src/**` only (no `lib/curatedTeams.ts`), no `*.test.*` entries.
- Inspect `sonar-project.properties` (content per R1.3).
- CI: push branch → `backend-test` job shows "Run frontend tests with coverage" step before "SonarQube Scan"; scan succeeds; quality gate passes; SonarCloud shows frontend files with coverage data (≈15% overall lines, per research).

### Phase 2
```bash
cd frontend && npm run test:coverage
```
- Expected per-file lines: `teamColors.ts` 100%, `wordle.ts` 100%, `gameState.ts` ≥ 78%, `colorUtils.ts` 100%.
- `npx vitest run` green; `npx tsc --noEmit` green; `npm run lint` green.

### Phase 3
```bash
cd frontend && npm run test:coverage
npx tsc --noEmit
npm run lint
```
- Expected per-file lines: `gameState.ts` ≥ 95%, `GameComplete.tsx` ≥ 90%, `WordleModal.tsx` ≥ 85–90%, `teamColors.ts`/`wordle.ts`/`colorUtils.ts` ~100%.
- Full suite green (79 baseline + new tests).
- CI: same as Phase 1; SonarCloud overall lines coverage expected to rise from ≈15% to roughly 45–65% (frontend/src ≈ 90%+; exact value depends on SonarJS line counting — verify in SonarCloud after merge, do not gate on it).

## 12. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| jsdom lacks `<dialog>` `showModal`/`close` → component mount throws | Certain | High | Polyfill in `vitest.setup.ts` (D8). Escape-close tests dispatch `cancel` event manually. |
| RTL v16 peer dep `@testing-library/dom` missing → install/runtime error | High if forgotten | Medium | Explicitly add `@testing-library/dom` ^10 to devDeps (R3.1). |
| React 19 + RTL v16 `act()` warnings / async flakiness | Medium | Low | Use `await userEvent.*` and `waitFor` for async assertions; RTL v16 supports React 19. |
| `userEvent.keyboard` needs focus; grid auto-focus may not stick in jsdom | Medium | Low | Fall back to `fireEvent.keyDown(grid, { key })` directly on the grid element. |
| styled-jsx `<style jsx global>` untransformed in vitest | Low | Low | Renders as a plain `<style>` element; CSS is inert in jsdom — no crash. |
| Sonar lcov suffix collision between frontend/backend | Low | Medium | Verified unique today; keep `src/lib/*` vs `src/services/*` suffixes distinct; do not add files that collide. |
| Coverage thresholds accidentally added → CI fails at ~15% | Low | High | Explicitly out of scope (D7); reviewer checks no `thresholds` in frontend coverage block. |
| Test files analyzed by Sonar as prod code (findings + 0% entries) | Certain today | Medium | `sonar.exclusions` += `frontend/src/**/*.test.*` (D5). |
| New devDeps break `npm install` under Node 24 / lockfile churn | Low | Medium | `npm install` at root; commit lockfile; CI uses same Node 24. |
| `gameState.hook.test.ts` fixtures duplicated vs `gameState.test.ts` | Medium | Low | Acceptable; extraction to a shared fixture module is optional and must be excluded from coverage if created. |
| Sonar-visible % lower than expected after merge | Medium | Low | Informational metric; per-file targets verified locally; no gate dependency. |

## 13. Atomic Tasks / Vertical Slices

### Phase 1 — Coverage infrastructure (small)
1. **T1.1** Update `frontend/vitest.config.ts` (coverage block + test include glob).
   - AC: `npm run test:coverage` produces `frontend/coverage/lcov.info` with only `src/**` files; no thresholds; `npx vitest run` still 79/79.
2. **T1.2** Update `frontend/package.json` (`test:coverage` script + `@vitest/coverage-v8` devDep) and commit lockfile.
   - AC: `npm install` resolves without changes to backend deps; `npm run test:coverage` works.
3. **T1.3** Update `sonar-project.properties` (reportPaths, drop deprecated key, exclusions).
   - AC: content per R1.3; no `sonar.typescript.lcov.reportPaths`.
4. **T1.4** Update `.github/workflows/deploy.yml` (frontend coverage step before scan; rename job display; keep job id).
   - AC: YAML valid; step order correct; `deploy` needs list unchanged.

### Phase 2 — Lib coverage (no new deps, ~1 h)
5. **T2.1** Add `frontend/src/lib/teamColors.test.ts`.
   - AC: `teamColors.ts` lines 100%; all tests pass.
6. **T2.2** Extend `frontend/src/lib/wordle.test.ts` (`getCorrectLettersByLength` + decomposed-diacritic boundary).
   - AC: `wordle.ts` lines 100%; all tests pass.
7. **T2.3** Extend `frontend/src/lib/gameState.test.ts` (preferred-side-empty fallback).
   - AC: `gameState.ts` lines ≥ 78%; all tests pass.

### Phase 3 — Component/hook coverage (new devDeps)
8. **T3.1** Add devDeps (`@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`), create `frontend/vitest.setup.ts`, wire `setupFiles`.
   - AC: `npm install` clean; a minimal jsdom smoke test renders a component; node-env tests unaffected.
9. **T3.2** Add `frontend/src/lib/gameState.hook.test.ts` (jsdom docblock; `renderHook` + `act()` per action creator).
   - AC: `gameState.ts` lines ≥ 95%; all tests pass.
10. **T3.3** Add `frontend/src/components/GameComplete.test.tsx`.
    - AC: `GameComplete.tsx` lines ≥ 90%; all tests pass.
11. **T3.4** Add `frontend/src/components/WordleModal.test.tsx`.
    - AC: `WordleModal.tsx` lines ≥ 85% (target 90%); all tests pass.

**Dependencies**: T3.1 blocks T3.2–T3.4 (jsdom env + setup). T3.2–T3.4 are independent of each other once T3.1 lands. Phases 2 and 3 can partially overlap (Phase 2 has no deps on Phase 1 beyond the coverage config), but keep sequential execution for review sanity. Phase 1 must land first (CI + Sonar wiring).

## 14. Out-of-Scope Follow-ups (recorded, not part of this work)

- Add `thresholds` to `frontend/vitest.config.ts` toward the roadmap's 80% target once coverage is raised (e.g., lines/statements/functions/branches at 80%).
- Playwright E2E critical paths (roadmap v1.1).
- Coverage for `frontend/lib`, `frontend/components`, `frontend/app` (requires a separate `sonar.sources` decision).
- Page-level integration tests with API mocking.

---

## Task Contract

- **objective**: Frontend test coverage wired into SonarCloud (config + CI) and raised via phased test additions (lib → hook/components), with no app behavior change and a green quality gate.
- **success_criteria**: All §10 acceptance criteria met; per-file coverage targets in §11 achieved; CI runs frontend coverage before the Sonar scan; SonarCloud shows non-zero frontend coverage; no new findings.
- **non_goals**: thresholds, `sonar.sources` expansion, Playwright, prod refactors, backend changes, pre-existing findings, coverage outside `frontend/src`.
- **assumptions**: Research baseline trusted (spot-verified); SonarJS suffix matching; gate has no coverage threshold; npm workspaces hoisting; Node 24 in CI.
- **open_questions**: none blocking. Recorded decisions: D1 inline CI steps (vs artifacts), D2 per-file jsdom docblock (vs global), D3 `renderHook` (vs extraction), D8 dialog polyfill.
- **accepted_tradeoffs**: inline CI steps serialize frontend tests with backend tests (no parallelism) — accepted for simplicity/robustness; per-file docblock requires remembering the pragma in 3 files; fixture duplication between `gameState.test.ts` and `gameState.hook.test.ts` accepted.
- **validation**: commands in §11 per phase; expected per-file coverage numbers; CI behavior (frontend coverage step before scan, gate green); SonarCloud coverage visible after merge.
- **ask_abort_triggers**: if `npm install` of new devDeps breaks the lockfile/workspace resolution; if jsdom + React 19 render fails despite the polyfill (re-evaluate D2/D8); if Sonar scan starts failing on the new lcov path (re-check suffix matching); if any production file must be modified to make tests pass.

## Result Contract

- **status**: `pass`
- **summary**: Spec produced for full frontend SonarCloud coverage (3 phases, 11 atomic tasks). All research facts verified against the repo (configs, baseline 79/79 tests, lcov numbers, lockfile state, jsdom/RTL ecosystem research). No blocking issues found.
- **artifacts**: this spec (`docs/v0.1/dev-7-frontend-sonar-coverage.md`).
- **next_recommended**: `lead` approves spec → `developer` implements Phase 1 (T1.1–T1.4) → Phase 2 (T2.1–T2.3) → Phase 3 (T3.1–T3.4), with `reviewer` pass after each phase.
- **risks**: jsdom `<dialog>` polyfill is the main implementation risk (mitigated, D8); Sonar-visible % after merge is informational (verify, don't gate).
- **skill_resolution**: registry `docs/ai/harness/skill_registry.md` not found; `selected_skills: none` per handoff; no global skill loaded (spec-only task; no API/security/TDD implementation work). Fallback: global skills available but none applicable to spec production.

---

_Markers: implementation_decisions_count: 8 (D1–D8) · testing_decisions_count: 8 (T2.1–T2.3, T3.2–T3.5 test designs + setup/cleanup + Escape-event approach) · slices_defined: 11 tasks across 3 phases._