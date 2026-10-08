# Changelog

All notable changes to FootPlay, newest first.

Versions follow `<milestone>.<development>`, where the development number matches
the `dev-N` spec doc under `docs/`. Each entry names the spec doc it shipped
from, and release notes are taken from the entry itself.

---

## v1.1.3 — Team filters

_2026-10-07 · Spec: `docs/v1/v1.1/plan-v1.1.3-team-filters.md`_

### Added

- **Club filter helpers** (`src/lib/clubFilters.ts`) — pure, separately
  tested `toClubOptions` (joins server counts to names without sorting or
  dropping unresolvable entries), `groupClubOptions` (clubs vs national
  teams, input order preserved), `filterClubOptions` (case-insensitive
  substring search over NFD-normalised text, so `medellin` matches
  `Medellín`), and `toggleId` (set-toggle that returns `null` for the empty
  selection the API expects).
- **`ClubMultiSelect`** — the single searchable, grouped, counted checkbox
  control used for the Team dimension. Counts are rendered exactly as the
  server sent them: no arithmetic, no `options.length` fallback, so toggling
  can never change another option's number. The option universe is always
  the complete unfiltered list — a selected or zero-count club stays
  visible, enabled, and selectable. Search is deferred for responsiveness;
  loading and no-match states announce via `role="status"`; every option is
  a labelled `input[type=checkbox]` with a unique `id`/`htmlFor` pair.
- **`FilterPanel`** — a collapsible draft-then-apply panel. Every edit
  (checkbox, search) lands in local `draft`; `onApply` fires **only** from
  Apply and Clear all, so the applied counts — keyed to the applied filter
  set — cannot change under the cursor (R5). The panel body is always
  mounted (hidden when closed) so draft and search text survive; the
  trigger is a real `button` with `aria-expanded`/`aria-controls` and shows
  the active dimension count (`Filters (N)`); Apply is disabled while the
  draft equals the applied set.
- **Panel mounted on `/missing-eleven`** — the page wraps a shell (container
  + `FilterPanel`) around the error, loading, and board branches, so the
  panel never unmounts across a fetch while the game content swaps beneath
  it. `FilterUrlSync` deliberately stays in the board branch only: its
  mount-time URL re-read is what keeps Play again and Retry in step with
  the URL after a `NEW_GAME` reset, and hoisting it broke both flows
  (recorded as controller decision D4 in `.superpowers/sdd/progress.md`).
- **Entry-gate pre-screen** — an empty URL no longer auto-loads a match: the
  page renders the filter panel (forced open, toggle hidden, primary button
  reading **Start game**) and a placeholder that points at it. `started` is
  a page-level flag recomputed from `location.search` on every load, so the
  URL stays the single source of truth and no session or storage flag
  exists. Start commits the draft, writes the URL *before* the board mounts
  (D4-class ordering — `FilterUrlSync`'s mount read stays idempotent), then
  opens the gate: exactly one match fetch, zero before it. Any URL with
  params auto-starts exactly as before, and Retry and surrender keep
  behaving exactly as they did — the gate changes entry, not play.
  `Clear all` also gained a direct draft reset so it visibly clears a
  draft-only selection when the applied set is already empty (the
  pre-screen's default state).
- **Collapsible filter sections** — each dimension inside the Filters panel
  is now its own disclosure (`FilterSection`), collapsed by default
  everywhere, the pre-screen included. The header shows the draft selection
  as `Label (N)` (matching `Filters (N)`); bodies stay mounted while
  collapsed, so search text and selections survive; Apply / Start game /
  Clear all sit outside the sections and stay reachable no matter what is
  collapsed. Disclosure state is component-local — it survives opening and
  closing the panel and resets on reload (no storage). `ClubMultiSelect`
  gained `hideLegend` so the section header owns the visible label while
  the fieldset keeps its accessible name.
- **In-game filter panel removed** — while the game runs there is no
  Filters toggle, no panel, no checkboxes: the board is the only surface.
  The panel lives on the pre-screen alone (forced open, toggle hidden),
  and every route back to it takes the same loop: the sidebar **New
  puzzle**, the game-complete **Play Again**, and the error state's new
  **Change filters** button (the fix for what would otherwise be a dead
  end — an error you could only retry). Each resets the board, clears the
  URL (any params mean "started"), and lands on the pre-screen without
  fetching. The applied filters survive the round trip: `NEW_GAME` wipes
  them along with everything else, so the return handler reapplies them
  immediately, and the panel reopens with the selection intact, sections
  collapsed. The fetch-key ref is re-armed on return, so Start after a
  return fetches even under identical filters. Mid-game Apply disappears
  with the panel — filter changes happen only from the pre-screen.
- **Selected-value chips on section headers** — every draft selection now
  appears as a named chip in its own row **below** the section header:
  `Team (1)` keeps its full-width header, with *FC Porto*
  and an X underneath, so a value can be undone without expanding the
  section and hunting the checkbox. Chips sit outside the disclosure
  button (never inside it — nested buttons are invalid HTML) and the chip
  row wraps onto more lines rather than capping selections behind a
  "+N more" counter. The X edits the draft
  only — no Apply, no fetch, no URL write — through the same toggle
  semantics as the checkbox, and keyboard focus returns to the section
  header after removal (the X unmounts with its chip). A draft id with no
  matching option renders as `#id` (stale deep links) instead of
  vanishing; start mode removes chips the same way without ever starting
  the game.

### Removed

- **The Opponent filter dimension, end to end** — the panel renders no
  Opponent section, `GameFilterParams` carries four fields (teamIds,
  competitionIds, seasonFrom, seasonTo), and `GET /api/matches/filter-options`
  returns `teams`, `competitions`, `seasons`, `total` (no `opponents` key; the
  runtime guard dropped it too). The backend stops parsing `?opponentIds=`
  and builds no opponent SQL — the param is simply unknown and ignored, so
  `?opponentIds=999` behaves as unfiltered instead of matching nothing.
  Removed because the dimension proved confusing and redundant UX (spec
  Tasks 14–15). Legacy bookmarks converge rather than strand: the key parses
  to nothing (the pre-screen gate starts the game unfiltered), and
  `FilterUrlSync` deletes a stale `opponentIds` param on the first canonical
  write via the new `LEGACY_FILTER_KEYS` export. Gameplay keeps its opponent
  untouched — `Game.opponentTeamId`, the seed, the opponent board, shirts,
  tabs, and scoring are all unchanged; only the filter is gone.

### Validation

- `npm run test` — **22 files, 350 tests, all green** (measured; v1.1.2
  shipped 19 files / 281 tests). New suites: `clubFilters` 26,
  `ClubMultiSelect` 16, `FilterPanel` 18; the page suite grew from 10 to 19
  with all ten pre-existing tests unchanged.
- `npm run test:coverage` — 98.66% statements / 97.63% branches / 99.46%
  lines (674 statements).
- `npm run build` — clean on Next.js 16.3.4 (Turbopack); `/missing-eleven`
  static-prerendered, no `missing-suspense-with-csr-bailout`.
- `npx tsc --noEmit` and `npm run lint` — clean (one pre-existing warning
  in `GameComplete.test.tsx`).
- Grep gates: `ClubMultiSelect.tsx` contains no count arithmetic (`.length`
  only for search state); `checkbox` is rendered only by `ClubMultiSelect`
  (the panel composes it); `@/components/...` imports resolve under the
  same alias the App Router uses; `backend/` diff empty; the Vitest
  `include` is unchanged from v1.1.1.
- Live smoke (backend on `:4000`, `next dev` on `:3000`):
  - `GET /api/matches/filter-options` → 200, 479 teams and 479 opponents,
    every option carrying an integer server-side `count`.
  - `GET …/filter-options?teamIds=131` → 200, universe still 479, and
    FC Barcelona keeps its non-zero count (622) — the selected facet is not
    narrowed away.
  - `GET /api/matches/random?teamIds=131` → 200 with a match;
    `?teamIds=67453` (count 0) → 404, which `requestRandomMatch` maps to
    `null` → the page renders its neutral "No playable matches are
    available." message, never "Something went wrong."
  - Deep-link, messy-query, plain, and no-match URLs all serve 200.
  - Diacritics present in the live option list (`Académica Coimbra`,
    `Atlético de Madrid`) with the matching normalisation unit-tested.
- Interactive contracts asserted in jsdom (the browser spot-check of the
  same steps remains a manual oracle): toggling a checkbox fires no fetch
  and no URL write; Apply rewrites `?teamIds=…` and refetches; the applied
  selection is checked again on reopen; search text and selection survive
  an Apply → refetch round trip; OR-within-a-dimension keeps earlier
  selections.
- Pre-screen append: `npm run test` measured at **22 files, 363 tests, all
  green** — page suite 26 (7 new gate cases; 3 existing cases re-anchored
  from the empty URL to a deep-link fixture and the 9-case panel describe
  anchored once in its `beforeEach` on `daily=1`, a non-filter param that
  opens the gate while parsing to the empty set their original contract
  assumes) and `FilterPanel` 24 (5 start-mode cases plus the Clear-all
  draft-reset contract the gate exposed). Coverage 98.67% statements /
  97.67% branches / 99.46% lines (680 statements).
- `npm run build` clean — no `missing-suspense-with-csr-bailout`, the gate
  reading `window.location` in an effect rather than `useSearchParams` at
  page level; `npx tsc --noEmit` and `npm run lint` clean (pre-existing
  `GameComplete.test.tsx` warning aside). Grep gates: no
  `localStorage`/`sessionStorage` under `missing-eleven/`, no page-level
  `useSearchParams` (comment-only mention), no count arithmetic, `backend/`
  diff empty, Vitest `include` unchanged. The gate's jsdom contracts: an
  empty mount fetches nothing; Start writes the URL before the board's
  first fetch and fires exactly one request (empty draft included); a
  deep-linked fixture starts with no pre-screen; draft edits and Clear all
  start nothing. Browser click-through remains a manual oracle.
- Sections append: `npm run test` measured at **22 files, 370 tests, all
  green** — `FilterPanel` 31 (the 7-case `FilterPanel sections` suite plus
  expand-first re-anchors of the existing interactions) and the page suite
  26 (both sections collapsed asserted in-game and on the pre-screen; every
  checkbox interaction expands its section first). Coverage 98.69%
  statements / 97.54% branches / 98.33% functions / 99.47% lines (690
  statements); build, `tsc`, and lint clean (pre-existing
  `GameComplete.test.tsx` warning aside). The old `getByText('Team')`
  panel assertions became role queries — `getByText` does not filter
  `hidden` elements, so the collapsed sections' legends made them ambiguous.
- In-game removal append: `npm run test` measured at **22 files, 366 tests,
  all green** — page suite 21 (the 10-case in-game panel describe replaced
  by 4 contract cases: no panel while playing, New puzzle → pre-screen
  without fetching, Start after return refetching the same filters, Play
  Again → pre-screen, plus the error state's Change-filters route back)
  and `FilterPanel` 32 (start mode runs without an `onToggleOpen` handler
  at all). Coverage 98.69% statements / 97.54% branches / 98.33% functions
  / 99.47% lines (681/690 statements); build, `tsc`, and lint clean
  (pre-existing `GameComplete.test.tsx` warning aside). Deep-link mounts
  fetch twice — the gate starts before `FilterUrlSync`'s board-mount read
  lands the URL filters, a pre-existing branch-layout behavior — so the
  count-based tests now baseline after the second fetch instead of racing
  it.
- Chips append: `npm run test` measured at **22 files, 374 tests, all
  green** — `FilterPanel` 39 (the 7-case `FilterPanel selected chips`
  suite: chip below a full-width header with the X outside the disclosure
  button, draft-only removal re-disarming Apply, independent multi-removal,
  opponent labelling, `#id` fallback, focus handoff, start mode) and the
  page suite 22 (+1 pre-screen integration: chip removal writes neither
  the fetch nor the URL). Coverage 98.71% statements / 97.58% branches /
  98.38% functions / 99.48% lines; build, `tsc`, and lint clean
  (pre-existing `GameComplete.test.tsx` warning aside). The strict
  header-name regex (`^Team( \(\d+\))?$`) still resolves in both suites —
  the chips stayed outside the disclosure button.
- Opponent removal append (Tasks 14–15): rows above that mention the
  `opponents` key, "479 opponents", or the Opponent dimension predate this
  removal and describe intermediate states of the unreleased patch.
  Frontend `npx vitest run` measured at **22 files, 375 tests, all green**
  (+1 legacy URL-strip case; opponent-chip case replaced by no-Opponent
  absence cases); coverage 98.69% statements / 97.49% branches / 98.36%
  functions / 99.47% lines. Backend `npm test` measured at **23 files, 336
  tests, all green**; coverage 99.85% / 99.23% / 100% / 99.82% (95%
  thresholds). `npx tsc --noEmit` exit 0 and `npm run lint` 0 errors in
  both packages (pre-existing `GameComplete.test.tsx` warning aside);
  `npm run build` clean. Absence greps: no `opponentIds`/`opponents`
  outside gameplay, seed-domain code, the `LEGACY_FILTER_KEYS` convergence
  entry, and the tests asserting the absence; no `opponentWhere` anywhere;
  Prisma schema diff empty. Contract probes: `?opponentIds=999` on
  `filter-options` still returns the unfiltered total; the response key
  list is `['competitions', 'seasons', 'teams', 'total']`; the spec file
  was renamed `plan-v1.1.3-team-opponent-filters.md` →
  `plan-v1.1.3-team-filters.md` (v1.1.3 unreleased) with this entry and
  `.superpowers/sdd/progress.md` re-pointed.

### Notes

- Competition and Season lists and the real empty state belong to v1.1.4;
  their absence here is by design.
- Changelog lives at the root again (the scoped
  `docs/v1/v1.1/CHANGELOG-*.md` convention was retired in 950b42c).

---

## v1.1.2 — Filter URL state

_2026-10-07 · Spec: `docs/v1/v1.1/plan-v1.1.2-filter-url-state.md`_

### Added

- **URL as the single source of truth for filters** — a hand-typed or shared
  filter URL produces exactly that filter set on load, and every applied
  filter change rewrites the URL (`router.replace`, no history entry, no
  scroll jump). Unrelated query params such as the future `?daily=` survive a
  filter write via the delete-then-merge over `FILTER_PARAM_KEYS`.
- **`FilterUrlSync`** — the app's only reader/writer of the filter query
  string, mounted under a `<Suspense>` boundary (Next 16's
  `missing-suspense-with-csr-bailout` is a `next build` failure). Writes are
  gated until the initial read completes, so a deep link is adopted rather
  than stripped.
- **`SET_FILTERS` game-state action** — records the applied filter set as a
  structural no-op when the incoming filters deep-equal the current ones,
  which is what breaks the URL↔state echo loop. Filter changes never disturb
  a game in progress at the reducer level.
- **`useFilterOptions` hook** — owns the filter-options request for the
  applied filter set with a monotonic stale-response guard; errors surface
  without collapsing into empty counts. Renders nothing yet (v1.1.3 consumes
  it).
- **Filter-aware match fetching** — all three `fetchRandomMatch` call sites
  (mount, Play again, Retry) pass the current filters, handle the nullable
  "no match" result distinctly from network errors, and discard stale
  responses when filters change faster than the network answers.

### Validation

- `npm run test` — 19 files, 281 tests, all green; `npm run test:coverage` —
  98.36% statements / 97.27% branches over `src/**`.
- `npm run build` — clean; no `missing-suspense-with-csr-bailout`.
- `npx tsc --noEmit` and `npm run lint` — clean (one pre-existing warning in
  `GameComplete.test.tsx`).
- `useSearchParams` appears in exactly one production file
  (`app/missing-eleven/FilterUrlSync.tsx`); `router.push` is absent from
  `app/missing-eleven/`; the reducer contains no fetch; `backend/` diff is
  empty.
- Live smoke: deep-link, messy-query, no-match, and plain URLs all serve
  200 from `next dev` with no warnings; visual rendering is unchanged (zero
  filter UI in this patch).

### Notes

- This patch renders **no** filter controls; v1.1.3 and v1.1.4 render the
  state built here.

---

## v1.1.1 — Filter foundation

_2026-10-06 · Spec: `docs/v1/v1.1/plan-v1.1.1-filter-foundation.md`_

### Added

- **Complete-lineup filtering** — random match selection and filter counts now
  exclude games unless each club has exactly 11 distinct starting-lineup
  players.
- **`GET /api/matches/filter-options`** — returns team, opponent, competition,
  and season options with post-filter counts and a matching total. Counts are
  computed together, retain zero-count options, and exclude each selected
  dimension from its own facet counts.
- **Shared filter foundation** — added frontend filter types, URL helpers,
  filter predicates, API client support, and matching mock behavior. Filtered
  parameters now apply to random match selection as well.
- **Player name consistency** — player search and its response use
  `displayName ?? name`.
- **Frontend test discovery** — Vitest now collects tests from `src/`,
  `components/`, `tests/`, and `app/`; the shadow config was removed and the
  Shirt colour checks are executable tests.

### Notes

- No filter controls are rendered in this release; the UI ships in a later
  v1.1 patch.
- Completeness is enforced per game, with 11 players for each game-specific
  club. Games with incomplete lineups are excluded from random matches and all
  filter option counts.

---

## v1.0.3 — Scorer and send-off shirt badges

_2026-09-29_

### Added

- **`frontend/src/lib/shirtBadges.ts`** — pure `badgesForShirt({ goals,
  redCards })` returning one scorer badge per goal, followed by a send-off
  badge when applicable. Kept React-free so v1.2's difficulty modes can read
  the same decision without importing the component.
- **Scorer and send-off badges on the tactic-board shirts**, with the badge
  wording carried into the shirt's accessible name.

### Notes

- **Graceful degradation is per game, not per shirt.** A game seeded before
  v1.0.1 reports `0` for all 22 shirts and shows no badges anywhere. There is
  no availability flag and none will be added: `0` is indistinguishable from
  "did not score", so the UI cannot ask whether the data is present.
- **The scorer badge is a scored clue in Easy and Normal (v1.2.2). The
  send-off badge is decoration in every mode and never affects scoring or
  the multiplier.** Scoring code does not reference either.
- The dismissal data behind the send-off badge is the known-risky part of
  v1.0 (R2). A wrong-looking icon is tolerable; a wrong-looking *scoring
  clue* is not, which is why only the scorer badge is ever scored.
- **Test placement:** the component test lives at
  `frontend/src/components/Shirt.badges.test.tsx` because
  `frontend/vitest.config.ts` collects `src/**` only. Widening that include
  is v1.1.1's job (R7), deliberately not this one.
- No change to `TacticBoard`, `page.tsx` or `gameState` — `ShirtData extends
  LineupPlayer`, so the two fields arrive on the existing prop.

## v1.0.2 — Event columns on the API & Game filter indexes

_2026-10-04_

### Added

- **`goals`, `assists`, `redCards` and `isCaptain` on every lineup entry**
  in `GET /api/matches/random` and `GET /api/matches/:id`, mirrored as
  required fields on `LineupPlayer` in `frontend/types/index.ts`.
- **Indexes on `Game.season`, `Game.date` and `Game.targetTeamId`**, backing
  the v1.1 Season and Team filters. Closed list — no other index added.

### Notes

- **No new queries.** The columns were already on the appearance rows the
  existing `include` selects.
- **There is no "data missing" flag, and there will not be one.** The
  columns default to `0`, and `0` is indistinguishable from "did not score",
  so a game seeded before v1.0.1 reports zeros for all 22 shirts and the UI
  cannot tell. Degradation is per game, uniform across the board.
- `isCaptain` is nullable in the database and is sent as `false` when null.
- Tasks 2 and 3 ship together: the backend field and the required frontend
  field are one contract.

## v1.0.1 — Event data foundation: measured join into Appearance

_2026-09-29_

### Added

- **`game_events.csv` in the dataset** — added to `REQUIRED_FILES` in
  `scripts/src/download-data.ts`, with the single-request fetch timeout
  raised from 120s to 600s to cover the larger archive.
- **`backend/prisma/measure-event-vocabulary.ts`** — re-runnable measurement
  of the real `type` / `description` vocabulary, run via
  `npm run measure-events -w backend`. Prints the complete distinct inventory,
  a completeness probe for unrecognised `Cards` rows, the `player_assist_id`
  report, and a copy-pasteable `MEASURED_SENDING_OFF_DESCRIPTIONS` constant.
- **`backend/src/lib/eventMapping.ts`** — pure, unit-tested mapping from CSV
  vocabulary to `ParsedEventType`, built against the measured vocabulary: the
  `type` column is plural and capitalised (`Cards` / `Goals` /
  `Substitutions` / `Shootout`) and `description` is not a reliable type
  signal. Whitespace-tolerant, and anchored so the `"Sco-RED"` and tournament
  `"2."` substring traps cannot enter the dismissal set.
- **`backend/src/lib/appearanceEventJoin.ts`** — `AppearanceEventIndex`, a
  streaming join bounded by the ~219k appearances rather than the ~1.27M
  event rows.

### Changed

- **`backend/prisma/seed.ts`** streams `game_events.csv` and writes
  `Appearance.goals` / `assists` / `redCards` before the appearance insert.
  A missing CSV is a warning, not a failure.

### Notes

- No Prisma migration: the columns and the `gameId + playerId` join key
  already existed.
- **Re-seed is a manual operator step.** `run_seed` defaults to `false`, so
  merging this patch changes nothing in production until the box is ticked.
  Until then the app runs on zeroed columns and renders no icons.
- **Measured, not predicted.** Against the 1,274,469-row file the eight
  classifications are `yellow_card` 362,114 · `substitution` 631,339 ·
  `goal` 219,184 · `penalty` 21,890 · `shootout_goal` 13,574 · `red_card`
  9,897 · `second_yellow` 9,742 · `own_goal` 6,729 · `other` **0**.
- **Shootout goals are not counted** (13,574 rows).
- **Own goals are recognized but not counted** (6,729 rows) — deferred. Whether
  `player_id` on an own-goal row is the scorer or the conceder cannot be
  determined from this dataset, so `sum(goals)` under-counts rather than credit
  anyone a goal they may not have scored: 6,729 rows in the file, of which 871
  are joinable to an appearance. Revisable in one `switch` branch.
- **Assists come from the `player_assist_id` column**, not from an event type;
  there is no `assist` row in the file. Each is credited to the *assister's*
  own appearance, and self-assists are skipped.
- **Substitute goals remain unjoinable** — `Appearance.type` is
  `starting_lineup` for every row, so a substitute has no row to join to.

---

## v0.2.5 — Deploy Fix: npm Upgrade & Git Force Sync

_2026-09-28_

### Fixed

- **npm 10.8.2 bug** in Node 20-alpine Docker images — `npm install` failed with
  `Cannot read properties of null (reading 'edgesOut')`. Upgraded npm to latest
  in both frontend and backend Dockerfiles (`RUN npm install -g npm@latest`).
- **Git divergent branches** on Oracle Cloud deploy — `git pull` failed silently
  with "Need to specify how to reconcile divergent branches", leaving repo at
  old commit. Changed deploy script to `git fetch origin && git reset --hard origin/main`
  for force-sync behavior.
- **Deploy script fail-fast** — added `set -e` to SSH scripts so failures
  (git, docker build, health check) actually fail the CI job instead of
  reporting success.

---

## v0.2.4 — CI/CD Deployment Pipeline & Automated Releases

_2026-09-28_

### Added

- Manual deployment control panel — pushes and PRs no longer run builds, deploys,
  or DB seeding; a push is just a push
- `Run workflow` dialog with per-job checkboxes: frontend/backend lint, backend
  build, tests + coverage + Sonar scan, deploy, and optional DB seed
- Deploy and seed are `main`-only: ticking them on another branch fails the run
  with a clear message instead of silently skipping
- Automated releases on merge — when a pull request merges into `main`, the top
  unreleased CHANGELOG entry is tagged and published as a GitHub Release at the
  merged commit

### Fixed

- Manual workflow runs reported every job as skipped: boolean dispatch inputs
  were compared with `== 'true'`, which GitHub's expression engine coerces to a
  number comparison (`true → 1`, `'true' → NaN`), so every gate evaluated false

---

## v0.2.3 — Precision XI Scoring System

_Spec: `docs/v0.2/dev-3-scoring-system.md` · 2026-09-11_

### Added

- `frontend/src/lib/scoring.ts` — pure scoring engine with no side effects
- Correct-guess scoring: 1000 points, −200 per attempt beyond the first, floor of
  100 (1st = 1000, 2nd = 800, … 6th+ = 100)
- Failed-guess partial credit: `unique correct letters / name length × 150`,
  rounded, guarded against a zero-length name
- `computeTotalScore()` — grand total plus a per-shirt breakdown across both teams
- `ScoreCounter` — live score readout beside the match summary, pulsing on change
- `GameComplete` renders the full per-shirt score breakdown with team tabs

### Changed

- **Cut the match-level bonuses** planned in `docs/v0.2/plan-v0.2-overview.md`
  (decision D8: Full House +500, Clean Sweep +2000, One-Try Wonders +1000).
  Per-shirt scoring ships alone.

### Fixed

- Cross-team shirt-number name collisions — a shirt is now addressed by its
  opaque token rather than its shirt number

---

## v0.2.2 — Opponent Lineup Toggle

_Spec: `docs/v0.2/dev-2-opponent-toggle.md` · 2026-09-10_

### Added

- Dual-team gameplay: guess **both** lineups (22 shirts) instead of one (11)
- `TeamTabBar` — segmented tab bar with both team names and 11 progress pills per tab
- Surrender button with two-click confirmation — resolves all unresolved shirts as
  failed and reveals both lineups
  *(not in the v0.2 plan docs; recorded here as shipped)*

### Changed

- `gameState.ts` refactored to `targetShirts` + `opponentShirts` with an
  `activeBoard` field
- `GameStatus` reduced from five values to four: `idle`, `loading`, `playing`,
  `complete`
- **No early game-over** — play continues until all 22 shirts are resolved
- Board state is preserved when toggling between teams
- Shirt state gained `correctLetters`, added here so the scoring development
  would not need a second state refactor

### Fixed

- Game-complete modal now uses team tabs rather than a single flat list

---

## v0.2.1 — Team-Specific Shirt Colors

_Spec: `docs/v0.2/dev-1-team-colors.md` · 2026-09-07_

### Added

- `frontend/src/lib/teamColors.ts` — kit lookup for **25 curated teams** keyed by
  `clubId`: primary color, secondary color, one of four patterns
  (`solid`, `stripes-v`, `stripes-h`, `halves`), plus an optional number-outline
  flag for striped kits (Atlético, Juventus, Porto, Sporting)
- `frontend/src/lib/colorUtils.ts` — WCAG 2.1 relative-luminance contrast
  function so shirt numbers stay readable on any kit color
- `Shirt` renders team colors and patterns; `TacticBoard` wires the lookup through

### Changed

- Shirts no longer use a single default color
- Unknown clubs fall back to a neutral default (`#F8FAF8` / `#E2E8F0`, solid)
- No backend change — the club id is already present on the game response

---

## v0.1.7 — Frontend Test Coverage in SonarCloud

_Spec: `docs/v0.1/dev-7-frontend-sonar-coverage.md` · 2026-09-24 → 2026-09-26_

> Executed on a side branch and merged after v0.2.2 / v0.2.3 were written, so its
> commits interleave with the v0.2.x history.

### Added

- SonarCloud analysis with a **deploy-blocking quality gate** in CI
- Backend test suite — 175 tests across 13 files, using Testcontainers + Supertest
  against a real PostgreSQL instance
- `test:coverage` script and `@vitest/coverage-v8` in both workspaces
- Frontend test infrastructure: Vitest, React Testing Library, jsdom,
  `@testing-library/user-event`
- `frontend/vitest.setup.ts` with a guarded `HTMLDialogElement.showModal`/`close`
  polyfill (jsdom implements neither)
- Frontend test suites for `teamColors`, `gameState` (reducer),
  `gameState.hook` (the `useGameState` hook), `GameComplete`, and `WordleModal`
- Frontend coverage wired into SonarCloud: `frontend/coverage/lcov.info` registered
  alongside the backend report path

> The frontend suite now reports **173 tests across 9 files**. Only five of those
> nine suites are v0.1.7 work: `wordle.test.ts` arrived with v0.1.5,
> `colorUtils.test.ts` with v0.2.1, and `reveal.test.ts` + `scoring.test.ts`
> with v0.2.3.

### Changed

- `sonar-project.properties` — both lcov report paths registered; test files and
  the generated Prisma client excluded from sources to stop double indexing
- Reduced cognitive complexity in the formation and Wordle backend services
- Refactored `wordle` / `gameState` logic while adding tests

### Fixed

- Cleared SonarCloud findings in waves: 5 critical → security and reliability →
  maintainability → 36 remaining findings → accessibility in `WordleModal`
- Restored full-viewport sizing for native `<dialog>` modals
- Improved the Missing Eleven match panel layout
- Aligned Vitest aliases and the `GameComplete` tests
- CI: `SHADOW_DATABASE_URL` in the Prisma generate step, env vars in the
  backend-test job, deploy-blocking quality gate

---

## v0.1.6 — Docker, CI/CD & Deploy

_Spec: `docs/v0.1/dev-6-docker-deploy.md` · 2026-09-02 → 2026-09-04_

### Added

- ARM64 multi-stage `Dockerfile` for the frontend (Next.js `output: 'standalone'`)
  and the backend
- `docker-compose.prod.yml` — frontend, backend, postgres, nginx, certbot
- Nginx reverse proxy with Let's Encrypt SSL and auto-renewal
- GitHub Actions CI/CD pipeline on push to `main`
- Oracle Cloud Free Tier (Ampere A1) provisioning script
- Automated database migrations and automated seeding on every deploy
- Postgres exposed on loopback only, for SSH tunneling

### Changed

- Images are built on the ARM64 host instead of under QEMU emulation
- Seeding runs in a container, so the deploy host needs no Node.js
- Frontend uses relative API URLs in production, removing the CORS dependency
- CI caches on the single root `package-lock.json`
- Deploy SSH timeout raised; seed log noise reduced

### Fixed

- Prisma config not copied into the runner stage
- Seed path resolution and `ts-node` type checking
- `tsconfig.base.json` not mounted for the data-pipeline container
- Docker permissions

---

## v0.1.5 — Wordle Algorithm & Game Loop

_Spec: `docs/v0.1/dev-5-wordle-game-loop.md` · 2026-08-26 → 2026-08-28_

### Added

- `frontend/src/lib/wordle.ts` — pure guess evaluator: normalize (lowercase, strip
  diacritics and special chars) → green pass → orange pass respecting duplicate
  counts → grey remainder
- `frontend/src/lib/gameState.ts` — `useReducer` state machine
  (`idle → loading → playing → won/lost`)
- `WordleModal` — classic Wordle grid with typing, on-screen keyboard, and shirt preview
- `backend/src/services/wordle.ts` — the algorithm ported server-side
- `backend/src/services/tokenService.ts` — opaque per-game player tokens
- `POST /api/guess`, `POST /api/guess/reveal`, and `POST /api/guess/reveal-one`
  wired into the guess flow
- Visual word separators for multi-word player names
- Game state persisted to `localStorage` (versioned key `footplay-game-session`,
  24h expiry) — **added and later removed in this same version, see Removed below**

### Changed

- Guess validation moved server-side; player display names are no longer sent to the
  client before a correct guess
- Shirts are addressed by opaque token, not by player id — this closes the
  "read the answer from the network tab" hole in the original client-side design
- Wordle grid shows tile borders on the current row and hides future empty rows
- Shirt always shows its letter slots below, and shows the player name on a correct guess

### Fixed

- Hydration error after the server-side switch
- Wordle guess evaluation conflated index spaces
- Reveal endpoint response did not match the `RevealResponse` type
- Game completion and reveal flow bugs
- Tactic-board slot overlaps: vertical spacing between DM/CM and CM/AM bands,
  2-player CB and striker bands, lone-striker and defensive-midfielder centring
- Wordle modal width, shirt tag cropping, and letter limit
- Tailwind warning

### Removed

- **`localStorage` game-state persistence.** The spec called for state to be
  serialized on every change and restored on load. It shipped in `54fdbd4` and
  was deleted in `74402cd` while fixing a hydration mismatch. A page refresh now
  starts a new game. Reinstating persistence is open scope in v0.2.4.

> **Deviation from the spec**: the spec described a 6-row feedback grid revealed
> incrementally. The shipped UI is a full Wordle-style grid with an on-screen
> keyboard — closer to the classic mechanic than the spec described.

---

## v0.1.4 — Frontend Shell & Layout

_Spec: `docs/v0.1/dev-4-frontend-shell.md` · 2026-08-26_

### Added

- `Layout`, `Navbar`, `Footer`, and `Logo` shared shell
- `/missing-eleven` route rendering `MatchInfo` + `TacticBoard` + 11 `Shirt`
  components, positioned by percentage coordinates
- Shirt states: default, in-progress, correct, failed
- CSS/SVG pitch with white markings
- `frontend/lib/mockData.ts` — mock API-shaped data so the shell shipped before
  the API landed

---

## v0.1.3 — Core REST API

_Spec: `docs/v0.1/dev-3-core-rest-api.md` · 2026-08-18 → 2026-08-31_

### Added

- `GET /api/health`
- `GET /api/matches/random` — random match with both lineups and position coordinates
- `GET /api/matches/:id` — single match, same response shape
- `GET /api/players?name=` — player search for guess autocomplete, minimum 3
  characters, **no result limit**
- `POST /api/guess` — server-side Wordle evaluation against a player token
- `POST /api/guess/reveal` — reveal a full lineup at game completion
- `POST /api/guess/reveal-one` — reveal a single shirt
- Middleware stack: CORS, JSON body parser, Morgan request logging (skipped under
  test), catch-all error handler returning `{ error, code }`, 404 handler
- `x-powered-by` header disabled

### Changed

- Lineup responses return opaque tokens; the guess route resolves them server-side
- Match payload renamed so a curated team side is always shown
- External ids exposed on match and player responses

### Fixed

- Display names hidden and replaced with normalized lengths before a correct guess
- Match selection always returns a complete lineup

> **Deviations from the spec** (`docs/v0.1/dev-3-core-rest-api.md`):
> the query parameter is `name`, not `q`; the minimum query length is 3, not 2;
> there is no 20-result cap (`playerService.getPlayers()` passes no `take` to
> Prisma); and two endpoints were added beyond the spec's five —
> `/api/health` and `/api/guess/reveal-one`.
>
> The API is stateless — there is no server-side game session. That matches the
> decomposition plan (`plan-v1.0-decomposition.md:1834`), but `docs/Project.md`
> still references `POST /api/games` and `PUT /api/games/:id/guess`, which were
> never built.

---

## v0.1.2 — Data Pipeline

_Spec: `docs/v0.1/dev-2-data-pipeline.md`, `docs/v0.1/dev-2-team-name-overrides.md` · 2026-07-26 → 2026-09-08_

### Added

- `scripts/src/download-data.ts` — fetches the transfermarkt-datasets release and
  extracts the 6 CSVs the game needs (`players`, `clubs`, `games`, `game_lineups`,
  `competitions`, `national_teams`)
- Filter-first seed driven by `scripts/curated-teams.json` — 17 club ids and
  8 national team ids; nothing invalid is ever inserted
- National teams seeded into the same `Club` table with an `isNationalTeam` flag
- Full-XI filter — only games with at least one complete 11-player starting lineup
  are kept; incomplete sides are dropped rather than partially seeded
- `scripts/src/name-cleaning.ts` — display-name normalization (diacritic stripping;
  `last_name` → `first_name` → `name` fallback chain)
- `scripts/src/competition-names.ts` — per-competition name normalizer
- `scripts/src/team-names.ts` — **45 team-name overrides** keyed by `clubId`,
  correcting verbose source names across all three name sources
- `backend/src/services/positionMapping.ts` — formation-aware slot fitting
  (hand-mapped 11-slot layouts per formation) with a static
  position→coordinates dictionary as the fallback chain
- Transactional FK-safe reset in the seed, making `npm run seed` idempotent

> **Deviation from the spec**: the override spec
> (`docs/v0.1/dev-2-team-name-overrides.md`) fixes scope at **38** Tier 1 names and
> requires a 38-key assertion. The shipped map has **45** entries and no such
> assertion. The spec needs updating to match.

### Fixed

- `players.csv` filtering now drops games left with no complete lineup
- Incomplete sides dropped from the seed instead of seeding partial lineups
- Appearance insert batching
- `Club` schema refactored to distinguish target from opponent teams

---

## v0.1.1 — Repo Scaffold & Prisma Schema

_Spec: `docs/v0.1/dev-1-repo-scaffold.md` · 2026-07-20 → 2026-07-25_

### Added

- npm workspaces monorepo: `frontend/`, `backend/`, `scripts/`
- Next.js (App Router) frontend, Express 4 backend, TypeScript data-pipeline scripts
- Root tooling: `concurrently` dev orchestration, ESLint, Prettier,
  `tsconfig.base.json`
- Prisma 7 + PostgreSQL schema with five entities — `Player`, `Club`, `Competition`,
  `Game`, `Appearance`
- `Competition`, `Club`, `Player`, and `Game` each carry an internal `id` plus a
  unique source id for traceability. `Appearance` is a join entity with a
  composite `@@unique([gameId, playerId])` and no source id
- `docker-compose.dev.yml` running PostgreSQL 16 for local development
- `.gitignore`, `CHANGELOG.md`

> **Deviation from the spec**: entities are named `Club` and `Game` (not
> `Team`/`Match`) to match the transfermarkt CSV source files.
