# Changelog

All notable changes to FootPlay, newest first.

Versions follow `<milestone>.<development>`, where the development number matches
the `dev-N` spec doc under `docs/`. Each entry names the spec doc it shipped
from, and release notes are taken from the entry itself.

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
