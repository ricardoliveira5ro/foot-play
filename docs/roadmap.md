# FootPlay — Delivery Roadmap

**Status**: `active`
**Last updated**: 2026-09-27
**Reality source**: `git log`, `CHANGELOG.md`, `docs/v0.1/*`, `docs/v0.2/*`, `docs/decisions/*`

> This document records **only what has actually shipped**, plus the single open
> development. Speculative milestones that were never started have been removed
> (see [Appendix A](#appendix-a-removed-planning)). Where the shipped code
> deviates from its plan doc, the deviation is recorded as the truth.

---

## Table of Contents

1. [Versioning Scheme](#1-versioning-scheme)
2. [v0.1 — Missing Eleven MVP (delivered)](#2-v01--missing-eleven-mvp-delivered)
3. [v0.2 — Missing Eleven Enhanced (delivered through v0.2.3)](#3-v02--missing-eleven-enhanced-delivered-through-v023)
4. [v0.2.4 — Integration & Polish (open)](#4-v024--integration--polish-open)
5. [Verification Baseline](#5-verification-baseline)
6. [Release Process](#6-release-process)
7. [Appendix A: Removed Planning](#appendix-a-removed-planning)

---

## 1. Versioning Scheme

FootPlay uses a **two-component** version, `<milestone>.<development>`:

| Component     | Meaning                                                        |
| ------------- | -------------------------------------------------------------- |
| **Milestone** | Feature batch — `0.1` (Missing Eleven MVP), `0.2` (Enhancements) |
| **Development** | One spec'd increment inside the milestone, matching its `dev-N` doc |

So the delivery order runs `v0.1.1` … `v0.1.7`, then `v0.2.1` … `v0.2.4`. The
development number is not arbitrary — it is the `dev-N` in the spec that defined
the work:

- `docs/v0.1/dev-3-core-rest-api.md` → **v0.1.3**
- `docs/v0.2/dev-2-opponent-toggle.md` → **v0.2.2**

A spec that is an increment on an earlier development — currently only
`docs/v0.1/dev-2-team-name-overrides.md`, self-described as "Dev 2.x" — ships
**inside its parent version** (v0.1.2), not as a third component. That keeps the
version two-component and keeps the roadmap and `CHANGELOG.md` in agreement on
how many versions exist.

This is deliberately *not* SemVer. There is no patch component and no major
component, because the project has never shipped a patch release or a
platform-identity change. Adopt a three-component scheme only if that changes.

The consequence, which reads like a contradiction until stated: the *scheme* is
`0.2.3`, but the string that reaches the tooling happens to satisfy the SemVer
grammar, so the release machinery validates it as `X.Y.Z`. The root
`package.json` `version` field is now the machine-readable source of truth for
that string (`scripts/set-version.mjs`, mirrored into all three workspace
manifests), so the roadmap tables and the manifest cannot silently disagree.

**Tag format**: `git tag v<MAJOR.MINOR.PATCH>` — strictly enforced. Leading
`v` required; no leading zeros, no fourth component, no prerelease or build
suffix. See [Release Process](#6-release-process) for what enforces it.

> **Current state**: the first tag is imminent — the release tooling that
> validates and publishes it is built and passing its checks locally, but **no
> git tag exists in this repository yet**, and the release workflow has therefore
> never run end-to-end. Until a human pushes one, every version above v0.1.1
> exists only as a `CHANGELOG.md` section and a row in the delivery maps below.
> See [Release Process](#6-release-process).

---

## 2. v0.1 — Missing Eleven MVP (delivered)

**Theme**: one game, working, deployed.
**Status**: complete — all 7 developments shipped.
**Plan**: `docs/v0.1/plan-v1.0-decomposition.md`. The plan doc still carries its
original "v1.0" title and filename; the milestone is tracked as **v0.1** because
it shipped as a playable MVP, not a 1.0 release. The doc was not renamed.

### Delivery Map

| Version    | Development                          | Spec doc                                    | Delivered   | Anchor commits                                                                     |
| ---------- | ------------------------------------ | ------------------------------------------- | ----------- | ----------------------------------------------------------------------------------- |
| v0.1.1     | Repo Scaffold & Prisma Schema       | `docs/v0.1/dev-1-repo-scaffold.md`          | 2026-07-25  | `9a96b21`, `aaad402`, `2e5a729`, `ae33795`, `b9fbe31`, `c4717bc`                    |
| v0.1.2     | Data Pipeline + Team Name Overrides  | `docs/v0.1/dev-2-data-pipeline.md`, `docs/v0.1/dev-2-team-name-overrides.md` | 2026-09-08 | `e4b3af4`, `a1158c2`, `9e90e95`, `f51a7c1`, `6aaf4ea`, `79cffeb`, `d669bb0` |
| v0.1.3     | Core REST API                        | `docs/v0.1/dev-3-core-rest-api.md`         | 2026-08-31  | `3887ec5`, `129e516`, `ccf62b0`, `ea6c524`, `87af9c6`, `ad1e1b7`                    |
| v0.1.4     | Frontend Shell & Layout              | `docs/v0.1/dev-4-frontend-shell.md`        | 2026-08-26  | `0b39263`, `e607db9`, `ca7c955`                                                    |
| v0.1.5     | Wordle Algorithm & Game Loop         | `docs/v0.1/dev-5-wordle-game-loop.md`      | 2026-08-28  | `54fdbd4`, `a48abd0`, `983d4aa`, `74402cd`                                         |
| v0.1.6     | Docker, CI/CD & Deploy               | `docs/v0.1/dev-6-docker-deploy.md`         | 2026-09-04  | `62f0a1d`, `648a26c`, `0fef00a`, `797d474`, `76c7af7`                                |
| v0.1.7     | Frontend Test Coverage in SonarCloud | `docs/v0.1/dev-7-frontend-sonar-coverage.md` | 2026-09-26 | `5fbdf4d`, `085e76b`, `d317567`, `eafb729`, `85a2851`                                |

Dates are the date of the newest anchor commit for that version. They are **not
monotonic** with version order, and that is the real history: the v0.1.3 payload
rename (`ad1e1b7`) landed after v0.1.4 and v0.1.5 had already started, and the
v0.1.7 coverage work was merged last (see its note below).

### v0.1.1 — Repo Scaffold & Prisma Schema

**Shipped**

- npm workspaces monorepo: `frontend/`, `backend/`, `scripts/`
- Next.js (App Router) frontend, Express 4 backend, TypeScript data-pipeline scripts
- Root tooling: `concurrently` dev orchestration, ESLint, Prettier, `tsconfig.base.json`
- Prisma 7 + PostgreSQL schema with five entities: `Player`, `Club`, `Competition`, `Game`, `Appearance`
- `Competition`, `Club`, `Player`, and `Game` each carry an internal `id` plus a
  unique source id for traceability. `Appearance` is the exception — it is a
  join entity with a composite `@@unique([gameId, playerId])` and no source id
- `docker-compose.dev.yml` running PostgreSQL 16 for local development

**Deviation from plan**: entities are named `Club` and `Game` (not `Team`/`Match`)
to match the transfermarkt CSV source files and avoid translation overhead.

### v0.1.2 — Data Pipeline

**Shipped**

- `scripts/src/download-data.ts` fetches the transfermarkt-datasets release and
  extracts the 6 CSVs the game needs
- Filter-first seed driven by `scripts/curated-teams.json` (17 club ids,
  8 national team ids) — nothing invalid is ever inserted
- National teams seeded into the same `Club` table with an `isNationalTeam` flag
- Full-XI filter: only games with at least one complete 11-player starting lineup
  are kept; incomplete sides are dropped rather than partially seeded
- `scripts/src/name-cleaning.ts` normalizes display names (diacritic stripping,
  `last_name` → `first_name` → `name` fallback chain)
- `scripts/src/competition-names.ts` — per-competition name normalizer
- `scripts/src/team-names.ts` — **45 team-name overrides** keyed by `clubId`,
  correcting verbose source names (`AS Roma`, `Beşiktaş`, `PAOK`, …) for all
  three name sources, plus a transactional reset that makes the seed idempotent
- `backend/src/services/positionMapping.ts` — formation-aware slot fitting
  (hand-mapped 11-slot layouts per formation) with a static
  position→coordinates dictionary as the fallback chain

**Deviation from plan**: the override spec (`docs/v0.1/dev-2-team-name-overrides.md`)
fixes the scope at **38** Tier 1 names and requires a 38-key assertion. The shipped
map has **45** entries and no such assertion. The extra seven were added during
implementation and the spec was never updated — the spec and its key-count
assertion should be corrected to 45.

### v0.1.3 — Core REST API

**Shipped**

| Endpoint                     | Purpose                                                |
| ---------------------------- | ------------------------------------------------------ |
| `GET /api/health`            | Health check                                            |
| `GET /api/matches/random`    | Random match with both lineups + position coordinates   |
| `GET /api/matches/:id`       | Single match, same response shape                       |
| `GET /api/players?name=`     | Player search, minimum 3 characters, uncapped           |
| `POST /api/guess`            | Server-side Wordle evaluation against a player token    |
| `POST /api/guess/reveal`     | Reveal a full lineup at game completion                 |
| `POST /api/guess/reveal-one` | Reveal a single shirt                                    |

- Middleware stack: CORS, JSON body parser, Morgan logging (skipped under test),
  catch-all error handler returning `{ error, code }`, 404 handler
- `x-powered-by` disabled
- `GET /api/players` applies **no result limit** — `playerService.getPlayers()`
  passes no `take` to Prisma, so the response is unbounded for a 3-character
  prefix

**Deviations from the v0.1.3 spec**:

| Spec                                          | Shipped                        | Why it matters                              |
| --------------------------------------------- | ------------------------------ | ------------------------------------------- |
| `GET /api/players?q=` (dev-3 lines 30, 121)   | `?name=`                       | Frontend and backend agree on `name`; `q` was renamed |
| Minimum query length 2 (dev-3 line 33)        | Minimum 3                      | Stricter than specified                      |
| "Top 20 results" / "≤ 20 results" (dev-3:32, 126) | No limit                   | Unbounded response for short prefixes       |
| 5 endpoints                                   | 7                              | `/api/health` and `/api/guess/reveal-one` added |

The v0.1 decomposition plan explicitly ruled out a server-side game session
(`plan-v1.0-decomposition.md:1834` — "NO server-side game session endpoints in
v1.0"), and no game-session model exists in the Prisma schema. Older planning
docs (`docs/Project.md`, `docs/research-roadmap.md`) still mention
`POST /api/games` and `PUT /api/games/:id/guess`; those endpoints were never
built and those docs are stale on this point.

### v0.1.4 — Frontend Shell & Layout

**Shipped**

- `Layout` / `Navbar` / `Footer` / `Logo` shared shell
- `/missing-eleven` route rendering `MatchInfo` + `TacticBoard` + 11 `Shirt`
  components positioned by percentage coordinates
- Shirt states: default, in-progress, correct, failed
- CSS/SVG pitch with white markings
- Mock data (`frontend/lib/mockData.ts`) so the shell shipped before the API landed

### v0.1.5 — Wordle Algorithm & Game Loop

**Shipped**

- `frontend/src/lib/wordle.ts` — pure guess evaluator: normalize (lowercase,
  strip diacritics and special chars) → green pass → orange pass respecting
  duplicate counts → grey remainder
- `frontend/src/lib/gameState.ts` — `useReducer` state machine, statuses
  `idle → loading → playing → won/lost`
- `WordleModal` — classic Wordle grid with typing, on-screen keyboard, shirt preview
- Visual word separators for multi-word names
- **Anti-cheat hardening** (landed in this development, not v0.1.3): the Wordle
  algorithm was ported to the backend (`backend/src/services/wordle.ts`), display
  names are never sent to the client before a correct guess, and each shirt is
  addressed by an **opaque per-game token** (`backend/src/services/tokenService.ts`)
  instead of a player id. This closed the "read the answer from the network tab"
  hole the original client-side design allowed.
- Game completion and reveal flow, including the curated-team-side guarantee
- Tactic-board slot overlap fixes across the DM/CM/AM bands and lone-striker cases
- Guess evaluation moved server-side; hydration error fixed

**Deviations from plan**:

- The plan described a 6-row feedback grid revealed incrementally. The shipped UI
  is a full Wordle-style grid with an on-screen keyboard, which is closer to the
  classic mechanic than the spec described.
- **localStorage persistence was implemented and then removed.** The plan called
  for game state to be serialized to `localStorage` on every change and restored
  on load (`dev-5-wordle-game-loop.md`, "Persistence"). It landed in `54fdbd4`
  (versioned key `footplay-game-session`, 24h expiry) and was deleted in
  `74402cd` while fixing a hydration mismatch. There is now **no** persistence
  layer: a page refresh starts a new game. Restoring it is open scope in
  [v0.2.4](#4-v024--integration--polish-open).

### v0.1.6 — Docker, CI/CD & Deploy

**Shipped**

- ARM64 multi-stage Dockerfiles for frontend (`output: 'standalone'`) and backend
- `docker-compose.prod.yml`: frontend, backend, postgres, nginx, certbot
- Nginx reverse proxy + Let's Encrypt SSL with auto-renewal
- GitHub Actions pipeline on push to `main`
- Oracle Cloud Free Tier (Ampere A1) provisioning script
- **Images are built on the ARM64 host**, not under QEMU emulation
- Automated DB migrations on every deploy, and **first-deploy-only** automated
  seeding (seed runs in a container, so the host needs no Node.js)
- Postgres bound to loopback only, for SSH tunneling
- Frontend uses relative API URLs in production, removing the CORS dependency
- Single root `package-lock.json` as the CI cache dependency path

**Deviation from plan — Node 20 → 24 (production runtime major bump).** Both
Dockerfiles build and run on `node:24-alpine`; the root `engines.node` requires
`>=24.0.0`; `.nvmrc` pins `24`; every `ci.yml` job and `cd.yml`'s data-pipeline
step use `setup-node` 24 / `node:24-alpine`. The v0.1.6 spec and
`docs/v0.1/dev-6-docker-deploy.md` both specify `node:20-alpine`, so the shipped
images do not match that document. This is a **runtime major version** change
for the artifacts that actually serve traffic, not just a dev-tooling bump, and
it was made without its own development, spec doc, or release note.

> **Unverified at runtime.** The combination `node:24-alpine` + Prisma 7 +
> Next 16 has **not** been exercised by a Docker build in this repository — the
> images are only ever built on the ARM64 host during a deploy. CI runs on
> `ubuntu-latest` with `setup-node`, which is *not* the same thing: it does not
> build either Dockerfile. Treat the Node 24 images as untested until the first
> deploy proves them. If that deploy fails on a native dependency, the
> rollback is to `node:22-alpine`; nothing in the application code depends on a
> Node 24 language or library feature.

### v0.1.7 — Frontend Test Coverage in SonarCloud

**Shipped**

- SonarCloud analysis with a **deploy-blocking quality gate**
- Backend test suite: 175 tests across 13 files, coverage thresholds enforced in
  `backend/vitest.config.ts` (recorded here as the count **at v0.1.7**; the gate
  is 95% on all four metrics, not lines only), using Testcontainers + Supertest
  against a real PostgreSQL instance
- Frontend test suite: Vitest + React Testing Library + jsdom, `@vitest/coverage-v8`
- Frontend coverage wired into SonarCloud — both `backend/coverage/lcov.info` and
  `frontend/coverage/lcov.info` are registered
- `frontend/vitest.setup.ts` with a guarded `HTMLDialogElement.showModal`/`close`
  polyfill (jsdom does not implement them)
- Test files excluded from `sonar.sources` to stop double indexing
- Sonar findings cleared in waves: 5 critical → security/reliability →
  maintainability → 36 findings + first frontend suite → accessibility in
  `WordleModal`
- Cognitive complexity reduced in the formation and Wordle backend services
- Layout and modal fixes surfaced by the new component tests (full-viewport
  native dialogs, match panel layout, Vitest alias alignment)

**Deviation from plan**: the spec's Phase 1 deliberately added **no** frontend
coverage thresholds, because the baseline was ~15%. Frontend thresholds were an
open follow-up at the time and have since been added — see
[§5](#5-verification-baseline) for the enforced floors.

**Note on branch order**: this development was executed on a side branch and
merged after v0.2.2 / v0.2.3 were written, so its commits interleave with the
v0.2.x history. Mapping is by feature content, not by commit date.

---

## 3. v0.2 — Missing Eleven Enhanced (delivered through v0.2.3)

**Theme**: gameplay depth — kit colors, both lineups, scoring.
**Plan**: `docs/v0.2/plan-v0.2-overview.md`.
**No new games, no auth, no infrastructure changes.**

### Delivery Map

| Version  | Development                    | Spec doc                                | Delivered | Anchor commits                                                              |
| -------- | ------------------------------ | --------------------------------------- | --------- | ---------------------------------------------------------------------------- |
| v0.2.1   | Team-Specific Shirt Colors      | `docs/v0.2/dev-1-team-colors.md`        | 2026-09-07 | `71672d2`, `e7674b4`, `b52c1e5`, `a5ba417`, `7863cf6`                          |
| v0.2.2   | Opponent Lineup Toggle         | `docs/v0.2/dev-2-opponent-toggle.md`    | 2026-09-10 | `13fdb70`, `757bd05`, `b79f667`, `97466e6`                                     |
| v0.2.3   | Precision XI Scoring System    | `docs/v0.2/dev-3-scoring-system.md`     | 2026-09-11 | `1e299c8`, `3a8b26d`, `adcbba3`                                               |
| v0.2.4   | Integration & Polish           | `docs/v0.2/dev-4-integration-polish.md` | —         | open                                                                        |

### v0.2.1 — Team-Specific Shirt Colors

**Shipped**

- `frontend/src/lib/teamColors.ts` — lookup of **25 curated teams** keyed by
  `clubId`, each with primary color, secondary color, one of four patterns
  (`solid`, `stripes-v`, `stripes-h`, `halves`), and an optional number-outline
  flag for striped kits (Atlético, Juventus, Porto, Sporting)
- `frontend/src/lib/colorUtils.ts` — WCAG 2.1 relative-luminance contrast
  function so shirt numbers stay readable on any kit color
- Unknown clubs fall back to a neutral default (`#F8FAF8` / `#E2E8F0`, solid)
- No backend change — the club id is already on the game response

### v0.2.2 — Opponent Lineup Toggle

**Shipped**

- Game state refactored from 11 to **22 shirts**: `targetShirts` +
  `opponentShirts`, with an `activeBoard` field
- `GameStatus` collapsed from five values to four: `idle`, `loading`, `playing`,
  `complete` — **no early game-over**; play continues until all 22 shirts resolve
- `TeamTabBar` — segmented tab bar with both team names and 11 progress pills each
- Board state is preserved across toggles
- **Surrender** with two-click confirmation: resolves all unresolved shirts as
  failed and reveals both lineups
- `correctLetters` added to shirt state here, so v0.2.3 would not need a second
  state refactor. `nameLength` was **not** added here — it is a field on the
  `LineupPlayer` API contract, present since `b5a74cd` (2026-08-29), and
  `ShirtGameData` does not declare it

**Note**: surrender is **not** described in the v0.2 plan or the v0.2.2 dev doc.
It shipped as part of this development and is recorded here as reality; the plan
docs should be updated to match.

### v0.2.3 — Precision XI Scoring System

**Shipped**

- `frontend/src/lib/scoring.ts` — pure scoring engine, no side effects
- **Correct guess**: starts at 1000, −200 per attempt beyond the first, floor 100
  (1st = 1000, 2nd = 800, … 6th+ = 100)
- **Failed guess**: partial credit = `unique correct letters / name length × 150`,
  rounded; guarded against a zero-length name
- `computeTotalScore(targetShirts, opponentShirts, …)` returns a grand total plus
  a per-shirt breakdown across both teams
- `ScoreCounter` — live readout beside the match summary, pulsing on change
- `GameComplete` shows the full per-shirt breakdown, with team tabs
- Cross-team shirt-number name collisions resolved (a shirt is identified by
  token, not by number)

**Deviation from plan**: the v0.2 plan (decision D8) specified match-level bonuses
— Full House +500, Clean Sweep +2000, One-Try Wonders +1000. These were **cut**
before release; `scoring.ts` ships per-shirt scoring only. The v0.2 plan's release
criterion "scoring calculates correctly per-player **and with bonuses**" is
therefore not met as written and should be struck.

---

## 4. v0.2.4 — Integration & Polish (open)

**Status**: `not started`
**Spec**: `docs/v0.2/dev-4-integration-polish.md` (S, 2-3 days)

The final v0.2 development. Its value is now mostly **verification**, since the
three feature developments each landed with their own unit tests but the
14 end-to-end scenarios in the spec were never run as a pass.

### Scope

1. **Run the 14 spec scenarios end-to-end** — dual-team toggle, correct/failed
   guesses on both boards, score counter updates, GameComplete breakdown for 22
   shirts, mid-game refresh, Play Again, unknown-team color fallback, mobile
   toggle/shirt/modal usability, and the three edge cases (identical formations,
   1-letter name, diacritic name)
2. **Smooth transitions** for board switching and shirt resolution
3. **Edge-case handling** surfaced by the 22-shirt model
4. **Performance verification** on the 22-shirt board
5. **Final lint + build** across all workspaces

> **Scenario 8 needs a decision, not just a test.** The spec assumes
> "refresh mid-game → state restored", but persistence was removed in v0.1.5 and
> there is no restore path today. Either implement persistence again (and solve
> the hydration mismatch that removed it) or amend Scenario 8 to assert the
> current behaviour — a fresh game on reload. Do not leave it ambiguous.

### Acceptance criteria

- [ ] All 14 spec scenarios pass
- [ ] Board switch preserves both teams' guess state
- [ ] Game ends only when all 22 shirts are resolved (or on surrender)
- [ ] Score counter matches `computeTotalScore` after every guess
- [ ] `GameComplete` shows a 22-row breakdown, split by team tab
- [ ] Scenario 8 either passes as written (persistence restored) or the spec is
      amended to match actual behaviour
- [ ] No regressions against the [verification baseline](#5-verification-baseline)
- [ ] `npm run lint` and `npm run build` clean in all workspaces

### Open risks

`R3` and `R5` are carried from the v0.2 plan risk register
(`docs/v0.2/plan-v0.2-overview.md:56-64`); `N1` is new, surfaced by v0.1.7.

| ID  | Risk                                          | Source        | Probability | Impact | Mitigation in place                                     |
| --- | --------------------------------------------- | ------------- | ----------- | ------ | ------------------------------------------------------- |
| R3  | 22-shirt state refactor introduced latent bugs | v0.2 plan     | Medium      | Medium | Per-module unit tests exist; this dev is the E2E pass   |
| R5  | Toggle UX feels clunky on mobile              | v0.2 plan     | Low         | Medium | Simple tab bar; Scenario 11 is the check                |
| N1  | Frontend has no coverage threshold in CI      | new (v0.1.7)  | ~~Certain~~ → **closed** | Medium | **Closed**: 95/90/95/95 floors now enforced in `frontend/vitest.config.ts` |

---

## 5. Verification Baseline

**Re-measured 2026-09-27** against the working tree on `release-gate`
(`ebd7b88`, the same commit as `origin/main`) plus the uncommitted release-gate
automation. Both suites were **executed**, not assumed: the backend run had a
working Docker daemon available, so 181 is a measurement, not an inference from
the diff. The four frontend coverage percentages are still the 2026-09-27
measurement — they have not moved. The frontend **test counts** have, since the
Footer regression test was added to the working tree after that run; see
[Frontend](#frontend) below for why the counts moved and the percentages did
not.

### Backend

| Metric     | Value  | Δ vs 2026-09-26 |
| ---------- | ------ | --------------- |
| Test files | 13     | —               |
| Tests      | 181    | **+6**          |
| Statements | 99.64% (562/564) | — |
| Branches   | 97.78% (398/407) | +0.02 |
| Functions  | 100% (94/94)     | — |
| Lines      | 99.59% (488/490) | +0.01 |
| Gate       | **95%** statements / branches / functions / lines, enforced in `backend/vitest.config.ts` | corrected |

The six new tests are all in `backend/src/__tests__/unit/app.test.ts` and cover
`/api/health` version reporting: the `unknown` fallback when `APP_VERSION` and
`GIT_SHA` are absent, the values being reported when injected, empty and
whitespace-only values being treated as absent, and a three-case `it.each`
asserting the payload never carries an `undefined` field. The route reads the
environment per request, so these need no database and stay in the unit suite.
One pre-existing test was **modified**, not added: it now expects
`{ status, version, commit }` rather than `{ status }`.

> The gate is four thresholds at 95, not the 95%-lines-only gate recorded
> before. `backend/vitest.config.ts` sets `thresholds` for all four metrics;
> only `lines` was ever mentioned in this document.

Integration tests use Testcontainers + Supertest against a real PostgreSQL
instance, so the suite requires a working Docker daemon.

### Frontend

| Metric     | Value  | Δ vs 2026-09-26 |
| ---------- | ------ | --------------- |
| Test files | 10     | **+1**          |
| Tests      | 179    | **+6**          |
| Statements | 98.71% (460/466) | — |
| Branches   | 95.42% (334/350) | — |
| Functions  | 99.12% (113/114) | — |
| Lines      | 99.23% (390/393) | — |
| Gate       | **95 / 90 / 95 / 95** (statements / branches / functions / lines), enforced in `frontend/vitest.config.ts` | **new** |

The +1 file and +6 tests are the Footer regression test added after the
2026-09-27 run: a missing `APP_VERSION` rendered the literal string
`vunknown` in the production footer, and `src/components/Footer.version.test.tsx`
pins the six cases that fix covers — a real version gets a `v` prefix, a padded
version is trimmed, and `unset` / empty / whitespace / the literal `unknown`
sentinel all render a bare `unknown`. The **coverage percentages did not move at
all**, and that is not an inconsistency: the new test file lives in `src/`, but
the component it exercises is `frontend/components/Footer.tsx`, which sits
**outside** the measured `coverage.include` glob. Tests for an unmeasured file
add to the test count and to nothing else — they cannot move the denominators
either. So the count and the coverage table are measuring two different things,
and only one of them this change touched. The scope limitation this rests on is
quoted immediately below, and recorded in the same terms in the `SCOPE` comment
on `coverage.include` in `frontend/vitest.config.ts`.

> **What these numbers cover: `frontend/src/` only.**
> `frontend/vitest.config.ts` sets `coverage.include` to
> `src/**/*.{ts,tsx}`. Everything outside `src/` — `app/` (3 files),
> `components/` (9, including `components/Footer.tsx`), `lib/` (3) and
> `types/index.ts` — is **invisible to the gate**: it is neither measured nor
> able to fail it. `test.coverage.thresholds` is global (no per-file glob keys),
> so the four numbers are whole-scope figures for all of `src/`, **not** "the
> whole frontend". This is why editing `components/Footer.tsx` cannot move them.
>
> The glob is deliberately left narrow. Widening it is not a neutral change: the
> excluded directories are much less covered than `src/`, so adding them drops
> the percentages below the floors and fails CI immediately. Widen it only in
> the same change that adds tests for the newly included files.

**Headroom before the gate trips.** Against 466 statements (460 covered) and 350
branches (334 covered), the 95% statements floor allows **17 further uncovered
statements** and the 90% branches floor allows **19 further uncovered branches**
(current uncovered: 6 statements, 16 branches; total uncovered the floors permit:
23 and 35 respectively). The floors sit deliberately below the measured
baseline — a floor at or above today's number would fail CI on unrelated work —
and there is room for roughly one new untested `src/` file before erosion is
caught. `frontend/vitest.config.ts` states the same 17/19 figures; the two were
harmonised to this convention (headroom = *further* uncovered before the gate
trips) after the config comment and this section disagreed on 17 versus 18.

> **`version:check` detects drift, not a wrong version.** It compares the three
> workspace manifests against the root `package.json` and exits non-zero on any
> disagreement. It does **not** assert that the version is *correct* — all four
> manifests reading `0.1.0` would pass. Catching that is a human or a release
> guard's job, and it is release Guard 2 (tag must equal the manifest version at
> the tagged commit) that closes the gap for releases. It also does **not**
> inspect `package-lock.json`, which records the version for the root and each
> workspace. That is by design — the lockfile is generated output — but it does
> mean the lockfile can hold a stale version while `version:check` passes, which
> is why the lockfile is refreshed by `npm install` rather than mirrored by
> hand.

> **N1 in [v0.2.4](#4-v024--integration--polish-open) is now closed.** That risk
> was "frontend has no coverage threshold in CI"; the floor exists, and
> ratcheting it upward is ordinary follow-up rather than open scope.

### CI (`.github/workflows/ci.yml`) and CD (`.github/workflows/cd.yml`)

The single `deploy.yml` is gone, split into two files. This is the material
correction to the previous description, which described four jobs and a
`needs:`-gated deploy job.

`ci.yml` — **five independent jobs, none declaring `needs:`**, so none is
sequenced against another:

- `version-check` — `npm run version:check`; asserts the three workspace
  manifests agree with the root. No `npm install`: `set-version.mjs` is
  dependency-free, which keeps this job fast.
- `frontend-lint`
- `backend-lint`
- `backend-build` (type check)
- `backend-test` — runs **both** suites with coverage, then the SonarQube scan,
  then the **quality gate**

There is no deploy job in `ci.yml` and no `needs:` array anywhere. Deploy is
gated across workflow boundaries instead, by `cd.yml` on `workflow_run`:

- `cd.yml` triggers on `workflow_run` of a completed `CI` run, and additionally
  on `workflow_dispatch` for a manual redeploy (with a `reason` input).
- The deploy job's `if:` accepts the automatic path only when the triggering run
  **succeeded**, was a **push** (not a PR), was on **`main`**, and came from
  **this repository** — the last check stops a fork's identically named workflow
  from triggering a production deploy.
- A second, independent gate re-asks GitHub what actually ran against the commit
  via the `check-runs` API. It **fails closed**: zero check runs for the SHA is
  treated as a failure, so "no evidence" can never read as "pass". On the
  manual path this is the *only* CI gate, and it is what stops an operator
  shipping a commit that never passed CI.
- The deploy **checks out a pinned SHA**, not `main`. `workflow_run`'s own
  `github.sha` is the default-branch tip as of that run, which may already be
  newer than the commit CI passed, so the triggering run's `head_sha` is
  deployed instead. The host then `git checkout --force`s that same SHA and
  asserts `git rev-parse HEAD` matches it, replacing the old `git pull origin main`.
- The job declares `environment: production`, which gives deploys a history
  entry and a place to scope deploy secrets and, later, required reviewers.
- Concurrency is `group: production-deploy` with `cancel-in-progress: false`:
  deploys queue rather than interleave, because two concurrent `up -d --build`
  runs would race on the same containers and the same database.
- After `compose up -d --build` and an ungated `prisma migrate deploy`, the
  deploy **polls `http://localhost/api/health`** up to 30 times and only reports
  success once the response contains the exact `GIT_SHA` it deployed. A health
  endpoint reporting `unknown` means version injection broke, which is the
  failure worth catching.

> **Deviation from the old pipeline**: the destructive-seed guard. The seed
> `deleteMany()`s all five tables, so it now runs only when a `SELECT COUNT(*)`
> from inside the `postgres` container returns exactly `0`. A psql failure, or
> any non-integer result, aborts the deploy rather than being read as an empty
> table. Seeding therefore happens once, on first deploy, and never discards
> live data.

### Release (`.github/workflows/release.yml`)

A third workflow, described in [Release Process](#6-release-process).

### Sonar (`sonar-project.properties`)

- Sources: `frontend/src`, `backend/src`
- Tests: `backend/src/__tests__`
- Lcov: `backend/coverage/lcov.info`, `frontend/coverage/lcov.info`
- Excluded: backend `__tests__`, generated Prisma client, frontend test files, `node_modules`

---

## 6. Release Process

This section previously described an *intended* process that had never been
practiced. It now describes the process as implemented, in three separate
workflows. Two things are deliberately **not** unified into one: **deploy** is
automatic and continuous, **release** is a deliberate human act, and collapsing
them would mean either deploying on tag push or tagging on every merge.

### 6.1 Deploy — automatic, every green push to `main`

```
push / PR to main  →  ci.yml  →  (success)  →  cd.yml  →  Oracle Cloud
```

1. A change lands on `main`; `ci.yml` runs its five parallel jobs
   ([§5](#5-verification-baseline)).
2. On successful completion, `cd.yml` fires via `workflow_run` and deploys. The
   `if:` condition additionally requires the triggering run to have been a
   **push** (not a PR), on **`main`**, from **this repository** — the last check
   is what stops a fork's identically named workflow from triggering a
   production deploy.
3. A second, independent gate re-asks GitHub via the `check-runs` API what
   actually ran against the commit to be deployed, and **fails closed**: zero
   check runs is a failure, never a pass.
4. The job checks out a **pinned SHA** rather than pulling `main`, and the host
   asserts `HEAD` is that SHA after checkout.
5. A **manual redeploy** is available via `workflow_dispatch` with a `reason`
   input that is echoed into the deploy log. On this path the `check-runs` gate
   is the only CI gate, and it is what stops an operator shipping a commit that
   never passed CI.

Deploys are serialized: `concurrency: { group: production-deploy,
cancel-in-progress: false }`. Two concurrent `up -d --build` runs on one host
would race on the same containers and the same database.

### 6.2 Release — a human pushes a tag

```
git push origin v0.2.3  →  release.yml  →  4 guards  →  GitHub Release
```

`release.yml` **never creates a tag**. It triggers on a push of a tag matching
`v*` and publishes a GitHub Release for a tag a human already pushed;
`gh release create --verify-tag` is what makes that structurally true. Tagging
stays a separate, deliberate act.

**The four guards.** Each one fails the job; there is no continue-with-a-warning
path. The release is the one artifact that cannot be quietly retracted, so a
mismatched tag, a missing changelog section, or an unreachable commit must stop
the run rather than publish something plausible and wrong.

| # | Guard | Blocks |
| - | ----- | ------ |
| 1 | Tag is exactly `v<MAJOR.MINOR.PATCH>` | `v0.2.3.4`, `vabc`, `v01.2.3`, `v0.2.3-rc.1`, `v0.2.3+build` |
| 2 | `npm run version:check` passes, **and** the tag matches the root `package.json` `version` at the tagged commit | a forgotten `npm run version:set`, which would publish a release labelled v0.2.4 from code that says 0.2.3; `version:check` additionally catches a workspace that drifted from the root |
| 3 | `CHANGELOG.md` has a section for this version, and it is non-empty | a tag with no changelog entry, or a duplicate heading for one version |
| 4 | The tagged commit is reachable from `origin/main`, and `HEAD` is the commit the tag points at | releasing a side-branch commit that was never merged or reviewed |

**Release notes are extracted from `CHANGELOG.md`, not generated.**
`scripts/release-notes.mjs` pulls the `## v<semver> — <title>` section verbatim
(dropping the heading itself, which the release page already renders as the
title, and the repo-relative `_Spec: …_` provenance line, which would render as
monospace text going nowhere on a release page). `--generate-notes` is
**deliberately not passed** to `gh release create`: generated notes are derived
from the commit log, so they would duplicate the curated changelog and can
contradict it — the changelog records decisions ("cut the match-level bonuses")
that read as changes in the log but shipped as non-changes. The release title is
taken from the same heading via `--print-title`, so title and body cannot
disagree.

The parser is strict about that heading grammar for a reason: `v0.2.4` appears in
this repository's prose ("open scope in v0.2.4") with no heading, and `v0.1.5`
appears in prose well before its own heading. A substring or first-mention search
would return the wrong section in both cases.

**Rehearsing.** `workflow_dispatch` takes a `tag` input and a `dry_run` boolean.
A dry run executes all four guards and prints the would-be title and body,
creating nothing; a green dry run means the real run would have published
exactly that.

### 6.3 Housekeeping at release time

- **`CHANGELOG.md` first.** Guard 3 makes the changelog a hard input, so the
  version section must be written and merged *before* the tag is pushed.
- **Version bump first, for the same reason.** See the precondition below.
- **Development-doc status fields.** The audit that used to sit here is
  **resolved**: all 14 docs under `docs/v0.1/` and `docs/v0.2/` now carry a
  `**Status**` consistent with the delivery maps in
  [§2](#2-v01--missing-eleven-mvp-delivered) and
  [§3](#3-v02--missing-eleven-enhanced-delivered-through-v023). The ten stale
  entries and the one missing field were backfilled on 2026-09-27; see
  [§6.5](#65-dev-doc-status-backfill).
- **This roadmap** is updated at release time, as before.

### 6.4 Decisions made

The two questions this section used to leave open are now answered.

**Start tagging at the current version; do not backfill tags for
v0.1.1–v0.2.2.** The first tag is **`v0.2.3`**, which is the version in the root
`package.json`, the version of the `## v0.2.3` changelog section, and the
subject of the current commit (`ebd7b88 feat(v0.2.3)`). Retroactive tags for the
**nine** earlier versions — v0.1.1 through v0.1.7, plus v0.2.1 and v0.2.2 —
would assert release events that never happened: no tag, no GitHub Release, and
a CI pipeline that only gained its current shape in v0.1.6. A tag is a claim
that *this commit was released by this process*, and backfilling nine of them
would make the tag mean nothing. One tag at the point where the process becomes
real also gives the first release a real, changelog-derived body covering the
accumulated history. The cost is honest and worth stating: **v0.1.1–v0.2.2 have
no tags**, and `git log` will not show them as released. Their history lives in
`CHANGELOG.md`, this roadmap, and the delivery maps.

> **Prereleases are rejected, by choice.** The tag regex, `RELEASABLE` in
> `release-notes.mjs`, and the SemVer check in `cd.yml` all exclude `-rc.1` and
> `+build`, while `set-version.mjs` still *accepts* them in the manifest. The
> asymmetry is intentional and documented in the script: a prerelease GitHub
> Release is a different product decision — it needs `--prerelease` (not passed,
> because the task is a normal version) and it changes what "latest" means.
> Shipping `v0.3.0-rc.1` later is a conscious edit to three places at once, not
> an accident.

**Backfill the dev-doc statuses rather than leaving them as a historical
record.** The `**Status**` field is a live pointer into the delivery map, not a
record of the moment the spec was written. A shipped development still reading
`ready for implementation` is actively misleading to the next reader, and this
repository's own premise is that `docs/` is a reality source — the roadmap's
header names `docs/v0.1/*` and `docs/v0.2/*` as such. A spec's *provenance* is
already preserved separately, by its `**Source**` line and its `Result Contract`.
The one genuinely-not-started development is left reading `planned`, so the
backfill does not flatten the distinction the audit was trying to make.

### 6.5 Dev-doc status backfill

Vocabulary, matching the fields now in the docs:

| Value | Used by |
| ----- | ------- |
| `shipped in vX.Y` | a development that shipped as that version |
| `delivered` + the version range | `plan-v1.0-decomposition.md`, whose six planned developments all shipped as v0.1.1 through v0.1.6 |
| `in progress` | `plan-v0.2-overview.md`, unchanged — v0.2.4 is still open |
| `planned` | `dev-4-integration-polish.md`, unchanged — genuinely not started |

Versions were determined from each doc's own `**Source**` line and the delivery
maps in [§2](#2-v01--missing-eleven-mvp-delivered) and
[§3](#3-v02--missing-eleven-enhanced-delivered-through-v023), not inferred from
file dates. `docs/v0.1/dev-2-team-name-overrides.md` had no `**Status**` field
at all; one was added, recording that it is a Dev 2.x increment shipping inside
v0.1.2.

### 6.6 Known gaps

Stated rather than omitted, because each is a real hole a reader could
reasonably assume is closed.

| Gap | Consequence | Notes |
| --- | ----------- | ----- |
| **The release workflow has never executed end-to-end.** No tag has ever been pushed, so no run has been observed. | Every guard above is unproven in CI. The scripts they call *are* proven locally — `version:check` passes, and `release:notes v0.2.3` yields a 21-line, 922-byte body with the title `Precision XI Scoring System`; `v0.2.3-rc.1`, `v01.2.3` and `v0.2.3.4` are all rejected, and `v0.2.4` correctly fails with "no `## v0.2.4` heading". What is untested is the YAML around them. | Rehearse with `dry_run: true` before the first real tag. |
| **A tag not starting with `v` triggers nothing.** The trigger is `tags: ['v*']`, so a tag named `0.2.3` produces no workflow run at all — no failure, no release, no log line. | A mistyped tag is silently inert rather than rejected. The `if:` guard never gets the chance to run. | Not fixable inside the workflow; it is inherent to tag-pattern triggers. Worth remembering: the typo is invisible. |
| **The release workflow does not verify that CI passed on the tagged commit.** | A commit merged to `main` whose CI failed or was skipped could still be released. Guard 4 only proves *reachability*, not *greenness*. | Deliberate, and documented in `release.yml`: the `check-runs` API needs `checks: read`, and this workflow is scoped to the minimum `contents: write`. Widening the permission and copying `cd.yml`'s second gate is the fix if it should be closed. It is a merge-process question as much as a workflow one. |
| **The `## v<semver>` heading grammar is a hard dependency.** Guard 3 fails if a changelog section is missing, mis-titled, duplicated, or if its separator is not a spaced em dash. | A hand-edited changelog can block a release at the last step. | Verified against the current file: all ten sections parse. The parser also handles CRLF and rejects a heading that is only *mentioned* in prose. |
| **The version field was unmaintained until now.** All four manifests read `0.1.0` at `ebd7b88` — the `version` field was never kept in step with the delivery map. | Nothing before this work could have validated a tag against the code. | The bump to `0.2.3` is what makes Guard 2 meaningful. |
| **There is no `docs/vX/dev-N-*.md` spec for the release/deployment work itself.** | The convention that every shipped development has a spec doc is broken by this one piece of work. | Deliberate, and reversible — see the note below. |

> **Ordering precondition for the first tag.** Guard 2 compares the tag against
> the root `package.json` **at the tagged commit**. At `ebd7b88` that file still
> reads `0.1.0`, and the bump to `0.2.3` is uncommitted. So the version bump must
> be **committed and pushed to `main` first**, and the tag pushed afterwards,
> pointing at the commit that carries the bump. Tagging `ebd7b88` as `v0.2.3`
> would fail Guard 2 — correctly.

### 6.7 Where the design rationale lives

This section records the process as it is. The *reasons* behind the
architecture — why the CI/CD split, why a fail-closed `check-runs` gate, why the
deploy pins a SHA, why `gh release create` over a release action, why
`--generate-notes` is omitted — are recorded separately in
`docs/decisions/001-release-process.md`. That record is deliberately version-free
and is **not** a `docs/vX/dev-N-*.md` spec, because no milestone owns this work:

- `docs/v0.2/` is wrong — v0.2 is scoped to gameplay (`## 3. What's NOT in v0.2`
  in its own plan), its plan has four features, and v0.2.4 is already
  Integration & Polish. A `dev-5` here would silently expand the milestone.
- `docs/v0.3/` would invent a milestone this roadmap has not adopted.

**This is an open question for the project owner, not something to resolve
unilaterally**: whether the release/deployment automation is folded into
[v0.2.4](#4-v024--integration--polish-open), given a v0.3 milestone for
infrastructure, or recorded permanently outside the versioned spec tree. The
work is done either way; only its bookkeeping is open.

---

## Appendix A: Removed Planning

The following milestones were specified in earlier revisions of this roadmap and
have been **removed** because no work was ever started and they are not realistic
near-term commitments. They are listed only so the deletion is traceable — no
scope, criteria, or schedule is retained.

| Removed milestone          | Theme                        | Why removed                                             |
| -------------------------- | ---------------------------- | ------------------------------------------------------- |
| User Features (auth)       | Accounts, JWT, profile, stats | Never started; no auth code, routes, or Prisma models   |
| Filters & Difficulty      | Match filters, Easy/Hard      | Never started; no `FilterPanel`, no filter query params  |
| Guess the Formation       | Second game                   | Never started; no route or component                     |
| Transfer Links            | Third game (graph traversal)  | Never started; no `transfers` table seeded               |
| Career Path               | Fourth game (progressive reveal) | Never started                                    |
| Kit Quiz + Monetization   | Fifth game + ads              | Never started; kit image sourcing was never resolved     |

Also removed: the parallel-track schedule, the forward-looking decision log
(D9–D19), the per-milestone risk register, and the release criteria — all of
which existed only to plan the milestones above.

If any of this work becomes real, it should be re-planned as a new milestone with
its own decomposition, not resurrected from this appendix.
