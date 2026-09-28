# FootPlay

A football guessing game. One playable game today: **Missing Eleven** — a
Wordle-style name-guessing game played on a real match's tactic board.

You are shown a match (teams, score, date, competition) and a tactic board with
**22 shirts** — both starting lineups, positioned by percentage coordinates
derived from the actual formation. Click a shirt, type a player's name, and the
letters come back green/amber/grey like Wordle. Six tries per shirt, and the
faster you name them, the more you score.

**Live site**: `<production-domain-not-yet-recorded>` — replace this with the
real domain before publishing; it has deliberately not been guessed here.

**Status**: `v0.2.3` — *Precision XI Scoring System*. Next up: `v0.2.4`
*Integration & Polish* (open). See [the delivery roadmap](docs/roadmap.md) for
what has shipped and what has not.

Repository: [`ricardoliveira5ro/foot-play`](https://github.com/ricardoliveira5ro/foot-play)

---

## Gameplay — Missing Eleven

Route: `/missing-eleven`

- **22 shirts per game** — both lineups. A segmented tab bar switches between the
  two teams, each showing 11 progress pills. Board state is preserved per team.
- **6 tries per shirt**, Wordle-style letter feedback: correct letter in the
  right position, letter present elsewhere, letter absent.
- **No early game-over.** Play continues until all 22 shirts are resolved, or you
  **surrender** (two-click confirmation), which resolves everything still open as
  failed and reveals both lineups.
- **Stateless on the server.** There is no game session, and a page refresh
  starts a fresh game. (A `localStorage` persistence layer shipped in v0.1.5 and
  was removed in the same milestone while fixing a hydration mismatch; restoring
  it is open scope in v0.2.4.)
- **Anti-cheat.** Display names are never sent to the client before a correct
  guess, and each shirt is addressed by an **opaque per-game token**
  (`HMAC(gameId:playerId)`) rather than a player id — so the answer cannot be
  read out of the network tab.

### Scoring

Per shirt, from [`frontend/src/lib/scoring.ts`](frontend/src/lib/scoring.ts):

| Outcome                                   | Points                                                            |
| ----------------------------------------- | ----------------------------------------------------------------- |
| Correct guess                             | `1000` minus `200` per attempt beyond the first, floored at `100` |
| Failed guess (attempts exhausted)         | `round(unique correct letters ÷ name length × 150)`                |

So a first-try correct guess is 1000, second is 800, … sixth or later is 100. A
shirt you never named scores partial credit for how many distinct letters you
managed to place, and 0 if you placed none. `computeTotalScore()` sums both
teams into a grand total, shown live in the `ScoreCounter` and broken down
per-shirt in the game-complete screen.

> Match-level bonuses (Full House, Clean Sweep, One-Try Wonders) were specified
> in the v0.2 plan and **cut before release**. Per-shirt scoring ships alone.
> This deviation is recorded in
> [`docs/roadmap.md`](docs/roadmap.md) and [`CHANGELOG.md`](CHANGELOG.md).

---

## Tech stack

npm workspaces monorepo: `frontend/`, `backend/`, `scripts/`.

| Layer        | Stack                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Frontend     | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Anton / Instrument Sans / IBM Plex Mono, Vitest + React Testing Library + jsdom |
| Backend      | Express 4, TypeScript, Prisma 7 + PostgreSQL 16, Vitest + Testcontainers + Supertest                                              |
| Data         | TypeScript pipeline in `scripts/`; seeds from a transfermarkt-datasets zip on Cloudflare R2                                          |
| Tooling      | ESLint 9, Prettier 3, `concurrently` for dev orchestration, `tsconfig.base.json` shared across workspaces                           |
| CI / quality | GitHub Actions on `main` — frontend lint, backend lint, backend type check, both test suites with coverage, then a **deploy-blocking SonarCloud quality gate** |
| Infra        | Multi-stage Docker images built on the ARM64 host, docker compose (prod), nginx reverse proxy, Let's Encrypt, Oracle Cloud Free Tier (Ampere A1) |

SonarCloud project: [`ricardoliveira5ro_foot-play`](https://sonarcloud.io/dashboard?id=ricardoliveira5ro_foot-play)
(key and organisation come from [`sonar-project.properties`](sonar-project.properties)).

---

## Quickstart

### Prerequisites

- **Node.js 24** — this is what CI uses (`.github/workflows/ci.yml` and
  `cd.yml`), what the Dockerfiles build on (`node:24-alpine`), and what the
  local `.nvmrc` pins. The root `engines.node` field requires `>=24.0.0`.
- **Docker** — needed for two things: the local PostgreSQL container, and the
  backend test suite (Testcontainers).

### 1. Install dependencies

```bash
npm install
```

One root `package-lock.json` covers all three workspaces.

### 2. Create `.env.development`

`.env.development` is **gitignored and there is no committed `.env.example`**,
so you have to write it yourself. These are the variables the code actually
reads:

| Variable                | Used by                                                         |
| ----------------------- | --------------------------------------------------------------- |
| `DATABASE_URL`          | Prisma (also read by `backend/prisma.config.ts`)                 |
| `SHADOW_DATABASE_URL`   | Prisma — required at config load, even for `migrate deploy`      |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Consumed by `docker-compose.dev.yml` to build `POSTGRES_*` |
| `PLAYER_TOKEN_SECRET`   | HMAC key for player tokens — **required at import time**, the backend throws on boot if missing |
| `FRONTEND_PORT`         | Next dev server port (default `3000` in the current setup)       |
| `BACKEND_PORT`          | Express port (default `4000` in the current setup)                |

`.env` (ports only) and `.env.production` are gitignored too. `CORS_ORIGIN` is
optional and falls back to `http://localhost:3000`.

### 3. Generate the Prisma client

`backend/src/prisma.ts` imports the client from `./generated/prisma/client`, and
that directory is **gitignored**. Without this step the backend will not start:

```bash
npm exec -w backend -- prisma generate
```

It needs the env vars from step 2 to be present (Prisma's config reads them at
load time) but it does not need a running database.

### 4. Start PostgreSQL

```bash
docker compose -f docker-compose.dev.yml up -d
```

This runs `postgres:16-alpine` and creates **one** database (`DB_NAME`).

### 5. Create the shadow database

There is **no script for this** and the compose file does not do it. Create the
shadow database by hand once, or every Prisma command that needs it will fail:

```bash
docker compose -f docker-compose.dev.yml exec postgres \
  createdb -U "$DB_USER" "<your-shadow-database-name>"
```

`<your-shadow-database-name>` is whatever the database part of your
`SHADOW_DATABASE_URL` points at.

### 6. Apply migrations

There is **no `migrate` npm script**. The verified invocation is Prisma's own,
with the backend workspace selected so that `backend/prisma.config.ts` and
`backend/prisma/schema.prisma` resolve correctly:

```bash
npm exec -w backend -- prisma migrate deploy
```

### 7. Download the data

```bash
npm run data-pipeline
```

Fetches a `transfermarkt-datasets.zip` from a public Cloudflare R2 bucket and
extracts the six CSVs the game needs into `scripts/data/`:
`players.csv`, `clubs.csv`, `games.csv`, `game_lineups.csv`,
`competitions.csv`, `national_teams.csv`.

`scripts/data/` is **gitignored and not in the repository** — every environment
downloads it at setup/deploy time. The download is skipped if all six files are
already present. Expect a few hundred MB (`game_lineups.csv` alone is ~350 MB).

### 8. Seed the database

```bash
npm run seed -w backend
```

Filter-first, so nothing invalid is ever inserted. The filter is
`scripts/curated-teams.json` (17 club ids, 8 national team ids); only matches
with a complete 11-player starting lineup for a curated side are kept, and
incomplete sides are dropped rather than partially seeded.
`scripts/src/team-names.ts` applies 45 display-name overrides and resets the
seeded tables in a transaction, so the seed is idempotent.

### 9. Run it

```bash
npm run dev
```

Starts the frontend and backend concurrently. Open the frontend on
`http://localhost:3000` and go to `/missing-eleven`.

### Other root scripts

| Command                | What it does                                                        |
| ---------------------- | ------------------------------------------------------------------- |
| `npm run dev`          | `concurrently` runs the frontend and backend dev servers            |
| `npm run lint`         | frontend ESLint, then backend ESLint via `.eslintrc.json`           |
| `npm run format`       | `prettier --write .` across the repo                                |
| `npm run data-pipeline`| the download step above                                              |
| `npm run build`        | **a stub** — currently `echo 'Build will be wired per workspace'`. Build per workspace instead: `npm run build -w frontend` and `npm run build -w backend` |
| `npm run version:check` | asserts the three workspace manifests carry the root `package.json` version. Exits non-zero on drift. Runs in CI, in `cd.yml` before deploying, and in release Guard 2 |
| `npm run version:set X.Y.Z` | writes the version to the root manifest and mirrors it into `frontend/`, `backend/` and `scripts/` |
| `npm run release:notes v0.2.3` | prints the release body for a version, extracted from its `CHANGELOG.md` section |
| `npm run release:title v0.2.3` | prints just the release title, from the same changelog heading, so title and body cannot disagree |

> The four release scripts are listed here rather than only in the roadmap
> because they are **run by a person** preparing a release, and this table is
> the README's "commands you can type" list. Their guarantees, the four release
> guards, and the `v0.2.3` first-tag decision are documented in
> [`docs/roadmap.md` §6](docs/roadmap.md#6-release-process) and
> [`docs/decisions/001-release-process.md`](docs/decisions/001-release-process.md).

---

## Project structure

```
foot-play/
├── frontend/            Next.js App Router client (the whole UI)
│   ├── app/             routes: `/` and `/missing-eleven`, plus global CSS
│   ├── components/      Layout, Navbar, Footer, Logo, MatchInfo, Pitch,
│   │                    TacticBoard, Shirt, ScoreCounter, TeamTabBar
│   ├── src/components/  WordleModal, GameComplete
│   ├── src/lib/         pure logic: wordle, gameState, scoring, teamColors,
│   │                    colorUtils, reveal
│   ├── types/, lib/     shared types and small helpers
│   └── Dockerfile       multi-stage, Next `output: 'standalone'`
├── backend/             Express API + Prisma
│   ├── prisma/          schema.prisma, migrations, seed.ts
│   ├── src/routes/      matches, players, guess
│   ├── src/services/    match, player, wordle, token, positionMapping
│   ├── src/generated/   generated Prisma client (git-ignored build output)
│   └── Dockerfile
├── scripts/             data pipeline
│   ├── src/             download-data, name-cleaning, team-names,
│   │                    competition-names
│   ├── curated-teams.json   the seed allow-list
│   └── provision-oracle.sh  Oracle Cloud Free Tier provisioning
├── docs/                roadmap, tech notes, project vision, per-dev specs
├── nginx/               reverse proxy config + certbot volumes
├── docker-compose.dev.yml / docker-compose.prod.yml
├── sonar-project.properties
└── CHANGELOG.md
```

Notable boundary: **all game logic that can be pure, is pure.** `wordle.ts`,
`scoring.ts`, `teamColors.ts` and `colorUtils.ts` are side-effect-free and
unit-tested on their own. The `wordle` evaluator is deliberately duplicated in
`backend/src/services/wordle.ts` — the server is the authority, and the client
copy exists only so the UI can stay responsive while the real answer never
crosses the wire.

---

## API reference

All routes are served under `/api` by the Express app in `backend/src/app.ts`.
Errors use a single shape: `{ "error": string, "code": string }` with
`code` one of `INVALID_PARAMETER` (400), `NOT_FOUND` (404), `INTERNAL_ERROR` (5xx).

| Method | Path                     | Request                                      | Response                                                                   |
| ------ | ------------------------ | -------------------------------------------- | -------------------------------------------------------------------------- |
| GET    | `/api/health`            | —                                            | `{ status, version, commit }` — `version`/`commit` are `unknown` when the deploy did not inject them |
| GET    | `/api/matches/random`    | —                                            | Random match: both lineups with position coordinates. `404` if none exist    |
| GET    | `/api/matches/:id`       | path param must be a non-negative integer     | One match, same shape. `400` on a bad id                                    |
| GET    | `/api/players`           | `?name=` — **minimum 3 characters**           | A bare JSON array of players. **Uncapped** — a 3-character prefix can return a large set |
| POST   | `/api/guess`             | `{ gameId: number, token: string, guess: string }` | `{ results, isCorrect }`; `name` is added **only** when `isCorrect`     |
| POST   | `/api/guess/reveal`      | `{ gameId: number, teamSide: 'home' \| 'away' }` | `{ players: [{ playerId, name, shirtNumber }] }` — a full lineup     |
| POST   | `/api/guess/reveal-one`  | `{ gameId: number, token: string }`            | `{ name }` — resolves a single shirt                                        |

`results` is an array of `{ letter, result: 'CORRECT' | 'PRESENT' | 'ABSENT' }`,
evaluated server-side after normalising both guess and target (lowercase,
diacritics stripped, spaces/hyphens/apostrophes removed).

---

## Testing

```bash
npm test -w frontend                    # plain run
npm run test:coverage -w frontend       # with coverage, enforces the frontend gate
npm test -w backend                     # plain run, needs Docker
npm run test:coverage -w backend        # enforces the 95% gate, needs Docker
npm run test:watch -w backend           # watch mode
```

- **Frontend** (Vitest + React Testing Library + jsdom) — no Docker required.
  `frontend/vitest.setup.ts` polyfills
  `HTMLDialogElement.showModal`/`close`, which jsdom does not implement.
  `frontend/vitest.config.ts` enforces a **95 / 90 / 95 / 95** threshold on
  statements / branches / functions / lines, so this suite can fail CI on its
  own.
  - **What that gate covers: `frontend/src/` only.** The `coverage.include` glob
    is `src/**/*.{ts,tsx}`, so everything outside `src/` — `app/`, `components/`
    (including `components/Footer.tsx`), `lib/`, `types/`, and
    `vitest.setup.ts` — is **not measured and cannot fail the gate**. "Whole
    project" in the config comment means "the whole of `src/`, not per-file",
    not "the whole frontend". The widths are deliberately not widened: adding
    those directories would drop the measured percentages well below the floors
    and fail CI immediately. Widen the glob only alongside tests for the newly
    included files.
- **Backend** (Vitest + Testcontainers + Supertest) — **requires a working Docker
  daemon**, because the integration tests spin up a real PostgreSQL 16
  container. `fileParallelism` is off; the suite shares one database.
  `backend/vitest.config.ts` enforces a **95% threshold on lines, statements,
  functions and branches**, so coverage can fail the test run.
- **Measured baseline** (2026-09-27, against the working tree on `release-gate`)
  lives in [`docs/roadmap.md` §5](docs/roadmap.md#5-verification-baseline). Check
  it before and after your change so regressions are visible.

---

## Deployment

Deployment is **two workflows, not one**, and a green push to `main` is what
starts it:

```
push / PR to main  →  ci.yml  →  (success)  →  cd.yml  →  Oracle Cloud
```

### `ci.yml` — checks only, no deploy

**Five independent jobs**, none declaring `needs:`, so none is sequenced against
another and each reports its own result:

- `Version Check` — `npm run version:check`
- `Frontend Lint`
- `Backend Lint`
- `Backend Build (Type Check)` — Prisma generate, then `tsc`
- `Tests, Coverage & Sonar Scan` — the backend suite with its 95% gate, the
  frontend suite with its 95/90/95/95 gate, then the SonarCloud scan and the
  **quality gate check**

There is no deploy job here. The Sonar steps are skipped (with a warning in the
log) for Dependabot-triggered runs, which have no access to `SONAR_TOKEN`; see
[`.github/dependabot.yml`](.github/dependabot.yml).

### `cd.yml` — the deploy, gated on CI

Fires on `workflow_run` when a `CI` run **succeeded**, was a **push** (not a PR),
was on **`main`**, and came from **this repository** — the last check is what
stops a fork's identically named workflow from deploying to production. A
`workflow_dispatch` with a `reason` input is available for a manual redeploy.

**Two independent gates stand in front of it**, either of which can stop a
deploy:

1. `npm run version:check` as a cheap pre-flight, plus a SemVer check on the
   version before it is passed to the host.
2. A **`check-runs` assertion** that re-asks GitHub what actually ran against
   the exact commit being deployed. It requires the five `ci.yml` checks to be
   present and green and ignores everything else — including this deploy run's
   own in-progress check, which is attached to the SHA while this step executes.
   It **fails closed**: a missing expected check, a non-green expected check, and
   an empty response are all failures. On the manual path this is the *only* CI
   gate.

**The deploy itself** SSHes to the Oracle Cloud host and runs:

1. `git fetch --prune --tags origin` then `git checkout --force <SHA>`, and
   asserts `git rev-parse HEAD` is that SHA — **not** `git pull origin main`,
   which could hand the server a commit newer than the one CI passed
2. `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build`
3. `npx prisma migrate deploy` inside the backend container (never gated — every
   deploy needs it)
4. **the data pipeline and seed, guarded** — see below
5. a poll of `http://localhost/api/health` (up to 30 attempts, 5s apart) that
   succeeds only when the response reports **both** the `commit` and the
   `version` it deployed

**The seed guard is the important part.** `backend/prisma/seed.ts` `deleteMany()`s
all five tables before reinserting, so running it against a populated database
**discards live data**. It therefore runs only when a `SELECT COUNT(*)` executed
*inside the `postgres` container* returns exactly `0`; anything else — a psql
failure, or any non-integer result — **aborts the deploy** rather than being read
as an empty table. Seeding happens once, on first deploy, and never again
implicitly. The first-deploy path runs the data pipeline in a throwaway
`node:24-alpine` container, so the host needs no Node.js.

**Version injection.** `APP_VERSION` and `GIT_SHA` reach compose through the
SSH action's `envs:` mechanism — transported as data, never interpolated into
shell text. The backend reports them on `/api/health`; the frontend receives
`NEXT_PUBLIC_APP_VERSION` as a **build arg**, because Next.js inlines
`NEXT_PUBLIC_*` at build time. Both default to the literal sentinel `unknown`
when the deploy did not inject a value, and both render it without a `v` prefix.

**Runtime topology** (`docker-compose.prod.yml`): `postgres` (bound to
`127.0.0.1:5432` only, for SSH tunnelling), `backend` (4000), `frontend` (3000,
Next `standalone` output, `BACKEND_URL=http://backend:4000` so the browser
uses relative API URLs and CORS is not load-bearing), `nginx` (80/443) and
`certbot` on a renew loop.

Images are **built on the ARM64 host**, not under QEMU emulation. Provisioning
for a fresh machine is scripted in `scripts/provision-oracle.sh`. The nginx
configuration is explained line by line in
[`docs/tech-notes.md`](docs/tech-notes.md).

> **Releases are a separate, deliberate act.** `release.yml` triggers when a
> human pushes a tag matching `v*`; it never creates one itself. It runs four
> guards (tag grammar, `version:check` plus tag/manifest agreement, a non-empty
> `CHANGELOG.md` section, and the tagged commit being reachable from
> `origin/main`). No tag exists in this repository yet — **the first tag is
> `v0.2.3`**, and that is a decision of the project owner, not a backfill of the
> nine earlier versions. See
> [Release Process](docs/roadmap.md#6-release-process) and rehearse with
> `dry_run: true` first.

---

## Documentation

| Doc                                                                       | What it covers                                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`docs/roadmap.md`](docs/roadmap.md)                                       | The reality source: delivery map for v0.1.1–v0.2.3, the versioning scheme, the verification baseline, the release process |
| [`CHANGELOG.md`](CHANGELOG.md)                                             | Keep-a-Changelog-style release notes, newest first                              |
| [`docs/v0.2/dev-4-integration-polish.md`](docs/v0.2/dev-4-integration-polish.md) | The currently open development (v0.2.4)                                  |
| [`docs/tech-notes.md`](docs/tech-notes.md)                                 | The nginx config, explained                                                    |
| [`docs/Project.md`](docs/Project.md)                                       | Product vision and the original Missing Eleven design                          |
| [`docs/research-roadmap.md`](docs/research-roadmap.md)                     | Pre-implementation technical and product research                              |
| `docs/v0.1/`, `docs/v0.2/`                                                 | Per-development spec docs. The spec doc's `dev-N` number *is* the version's development number |

**`docs/roadmap.md` is the source of truth for what actually shipped.** Where the
code deviates from a plan doc, the deviation is recorded there rather than being
quietly forgotten. Follow the same practice.

---

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). In short: Conventional Commits, a branch
per development, and a PR that updates its spec doc and `CHANGELOG.md` — and
records any deviation from the spec in both.

---

## License

[MIT](LICENSE) — Copyright (c) 2026 Ricardo Oliveira
