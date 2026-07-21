# FootPlay v1.0 — Missing Eleven MVP Decomposition Plan

**Status**: `ready for implementation`
**Author**: specifier
**Date**: 2026-07-21
**Source documents**: `Project.md`, `docs/roadmap.md`, `research-roadmap.md`

---

## 1. Overview

### Decomposition Approach

v1.0 (Missing Eleven MVP) is decomposed into **6 sequential developments**, each producing a mergeable, testable increment. The decomposition follows these principles:

1. **Dependency-first**: Core infrastructure (scaffold, data, API) before gameplay (frontend, Wordle).
2. **Parallel-safe design**: Developments 2 (Data Pipeline) and 4 (Frontend Shell) can proceed in parallel after Development 1 (Scaffold) completes — the frontend uses mock data until the real API is ready.
3. **Risk isolation**: The riskiest work (name cleaning in Dev 2, Wordle integration in Dev 5) is bounded within its own development with clear abort/success criteria.
4. **Deploy-ready increments**: Development 6 (Docker/Deploy) is last only because the full stack must exist first. Dockerfiles and CI/CD are refined iteratively across developments but hardened in Dev 6.

### Development Order

| Order | Development | Effort | Dependencies |
|-------|-------------|--------|--------------|
| 1 | Repo Scaffold & Prisma Schema | S (2-3 days) | None |
| 2 | Data Pipeline | M (3-5 days) | Dev 1 |
| 3 | Core REST API | M (2-4 days) | Dev 2 |
| 4 | Frontend Shell & Layout (mock data) | S (2-3 days) | Dev 1 (can parallel Dev 2/3) |
| 5 | Wordle Algorithm & Game Loop | M (3-5 days) | Dev 3 + Dev 4 |
| 6 | Docker, CI/CD & Deploy | M (3-5 days) | Dev 1 (refined through Dev 5) |

### Total Estimated Effort

**15-25 days** (3-5 weeks) full-time solo development. This matches the roadmap estimate.

---

## 2. Per-Development Specification

---

### Development 1: Repo Scaffold & Prisma Schema

#### 2.1.1 Objective

Create the monorepo foundation that all future development builds upon. By the end of this development, a developer can run `npm install && npm run dev` and see both a Next.js frontend (port 3000) and an Express backend (port 4000) running simultaneously. The Prisma schema defines the five core entities (Player, Team, Competition, Match, Appearance), and the database is accessible via Docker Compose.

#### 2.1.2 Approach

**Monorepo structure**: npm workspaces with three packages:
- `frontend/` — Next.js 14 (App Router) + TypeScript + Tailwind CSS
- `backend/` — Express 4 + TypeScript + Prisma
- `scripts/` — TypeScript scripts for data pipeline (no framework)

**Root `package.json`** orchestrates dev scripts using `concurrently` to run both servers. ESLint and Prettier configs live at the root and extend into each workspace.

**Docker Compose** starts a PostgreSQL 16 container for local development. The backend connects to it via `DATABASE_URL` in `.env`.

**Prisma schema** models the five core entities (Player, Team, Competition, Match, Appearance) as close to the transfermarkt-datasets source schema as possible, with internal auto-increment IDs plus source IDs for traceability.

**Key decisions**:
- `name` field on Player stores the full name (`"Cristiano Ronaldo"`), `display_name` is computed during seeding (Dev 2) — Prisma schema defines both columns but Dev 2 populates them.
- Formation is stored as a free-text string (`"4-3-3"`) on Match. No enum — formations vary and filtering is out of scope.
- Appearance uses a composite-like pattern: each row is one player in one match for one club. The `type` field distinguishes `starting_lineup` from `substitutes`.
- Competition is a separate model referenced by Match via `competition_id`. The `competitions.csv` is parsed in Dev 2 to populate the Competition table, enabling the API to return a human-readable competition name.

#### 2.1.3 Detailed Tasks

##### Task 1.1: Initialize monorepo structure

- **Description**: Create root `package.json` with npm workspaces configured, directory structure (`frontend/`, `backend/`, `scripts/`), and root-level tooling configs.
- **Files to create/modify**:
  - `package.json` (root) — workspaces: `["frontend", "backend", "scripts"]`, scripts for `dev`, `lint`, `build`
  - `.eslintrc.json` (root) or `eslint.config.js` — shared ESLint config (extends Next.js + TypeScript)
  - `.prettierrc` — Prettier config (singleQuote, trailingComma, printWidth 100)
  - `tsconfig.base.json` — shared TypeScript config for paths, strict mode
  - `.gitignore` — extend with `node_modules`, `.next`, `dist`, `.env`, `.prisma`, `*.tsbuildinfo`
  - `.env.example` — all required variables: `DATABASE_URL`, `FRONTEND_PORT`, `BACKEND_PORT`
  - `CHANGELOG.md` — initial entry documenting v1.0 start
- **Acceptance criteria**:
  - [ ] `npm install` at root installs all workspace dependencies without errors
  - [ ] `tsconfig.base.json` is extended by each workspace's `tsconfig.json`
  - [ ] `.env.example` lists all environment variables with placeholder values
  - [ ] `.gitignore` covers all generated/build artifacts
  - [ ] `git init` exists (repo is initialized)
  - [ ] `CHANGELOG.md` exists with initial entry ("v1.0 — Initial scaffold")
- **Validation**: `rm -rf node_modules && npm install` completes cleanly.

##### Task 1.2: Scaffold Next.js 14 frontend

- **Description**: Create `frontend/` with Next.js 14, App Router, TypeScript, Tailwind CSS. Add a minimal home page that renders a "FootPlay" heading.
- **Files to create/modify**:
  - `frontend/package.json` — next, react, react-dom, typescript, tailwindcss, postcss, autoprefixer
  - `frontend/tsconfig.json` — extends `../tsconfig.base.json`, jsx: preserve, paths alias
  - `frontend/next.config.js` or `next.config.mjs` — minimal config
  - `frontend/tailwind.config.ts` — content paths, theme extension
  - `frontend/postcss.config.js` — tailwind + autoprefixer
  - `frontend/src/app/globals.css` — Tailwind directives
  - `frontend/src/app/layout.tsx` — root layout with html/lang, metadata
  - `frontend/src/app/page.tsx` — simple home page rendering "FootPlay"
  - `frontend/src/app/api/hello/route.ts` — optional health-check route (returns 200)
- **Acceptance criteria**:
  - [ ] `npm run dev` from `frontend/` starts on port 3000
  - [ ] Home page renders without errors
  - [ ] Tailwind classes work (test with `text-3xl font-bold`)
  - [ ] TypeScript compiles without errors
- **Validation**: `npm run build` in `frontend/` produces a production build with no errors.

##### Task 1.3: Scaffold Express 4 backend

- **Description**: Create `backend/` with Express 4, TypeScript, ts-node-dev for hot reload. Add a health-check endpoint. Set up Prisma with PostgreSQL.
- **Files to create/modify**:
  - `backend/package.json` — express, cors, dotenv, prisma, @prisma/client, typescript, ts-node-dev, @types/*
  - `backend/tsconfig.json` — extends base, outDir: dist, rootDir: src
  - `backend/src/index.ts` — Express app creation, health route at `/api/health`, CORS enabled
  - `backend/src/prisma.ts` — PrismaClient singleton export
- **Acceptance criteria**:
  - [ ] `npm run dev` from `backend/` starts on port 4000
  - [ ] `curl http://localhost:4000/api/health` returns `{ "status": "ok" }`
  - [ ] TypeScript compiles without errors
- **Validation**: `npm run build` in `backend/` compiles to `dist/`.

##### Task 1.4: Configure root dev scripts

- **Description**: Wire root `package.json` scripts so `npm run dev` starts both frontend and backend concurrently.
- **Files to modify**:
  - `package.json` (root) — add `concurrently` dependency, wire `dev` script
- **Acceptance criteria**:
  - [ ] `npm run dev` from root starts frontend (port 3000) and backend (port 4000)
  - [ ] Stopping the process stops both servers
- **Validation**: Run `npm run dev`, verify both ports respond, Ctrl+C stops both.

##### Task 1.5: Create Prisma schema (four entities)

- **Description**: Define the Prisma schema with Player, Team, Competition, Match, and Appearance models. Include the `display_name` column on Player (populated during Dev 2). Create initial migration.
- **Files to create/modify**:
  - `backend/prisma/schema.prisma` — datasource postgresql, generator client, four models (see schema details below)
  - `backend/prisma/migrations/` — initial migration via `npx prisma migrate dev`
- **Prisma schema details**:

  ```prisma
  model Player {
    id              Int           @id @default(autoincrement())
    playerId        Int           @unique @map("player_id")
    name            String        // Full name from dataset (e.g. "Cristiano Ronaldo")
    firstName       String?       @map("first_name")
    lastName        String?       @map("last_name")
    displayName     String        @map("display_name") // Populated during seed
    position        String?       // Goalkeeper, Defender, Midfield, Forward
    subPosition     String?       @map("sub_position") // Centre-Back, Left Winger, etc.
    countryOfCitizenship String?    @map("country_of_citizenship")
    appearances     Appearance[]
  
    @@map("players")
  }
  
  model Team {
    id              Int           @id @default(autoincrement())
    clubId          Int           @unique @map("club_id")
    name            String
    domesticCompetitionId String? @map("domestic_competition_id")
    homeMatches     Match[]       @relation("HomeTeam")
    awayMatches     Match[]       @relation("AwayTeam")
    appearances     Appearance[]
  
    @@map("teams")
  }
  
  model Competition {
    id              Int           @id @default(autoincrement())
    competitionId   String        @unique @map("competition_id")
    name            String
    matches         Match[]
  
    @@map("competitions")
  }
  
  model Match {
    id              Int           @id @default(autoincrement())
    gameId          Int           @unique @map("game_id")
    competitionId   String?       @map("competition_id")
    season          String?
    date            DateTime
    homeClubId      Int           @map("home_club_id")
    awayClubId      Int           @map("away_club_id")
    homeClubGoals   Int?          @map("home_club_goals")
    awayClubGoals   Int?          @map("away_club_goals")
    homeClubFormation String?     @map("home_club_formation")
    awayClubFormation String?     @map("away_club_formation")
    round           String?
    homeClub        Team          @relation("HomeTeam", fields: [homeClubId], references: [clubId])
    awayClub        Team          @relation("AwayTeam", fields: [awayClubId], references: [clubId])
    competition     Competition?  @relation(fields: [competitionId], references: [competitionId])
    appearances     Appearance[]
  
    @@map("matches")
  }
  
  model Appearance {
    id              Int           @id @default(autoincrement())
    gameId          Int           @map("game_id")
    clubId          Int           @map("club_id")
    playerId        Int           @map("player_id")
    type            String        // "starting_lineup" or "substitutes"
    number          Int?
    position        String?       // Position played in this match
    teamCaptain     Boolean?      @map("team_captain")
    game            Match         @relation(fields: [gameId], references: [gameId])
    club            Team          @relation(fields: [clubId], references: [clubId])
    player          Player        @relation(fields: [playerId], references: [playerId])
  
    @@map("appearances")
    @@index([gameId, type])
    @@index([playerId])
  }
  ```
- **Acceptance criteria**:
  - [ ] `npx prisma validate` passes with no errors
  - [ ] `npx prisma migrate dev --name init` creates migration and applies it to local PostgreSQL
  - [ ] `npx prisma generate` produces the client
  - [ ] Prisma client can be imported in backend code
- **Validation**: Run `npx prisma studio` and verify all five tables (Player, Team, Competition, Match, Appearance) appear with correct columns.

##### Task 1.6: Add Docker Compose for PostgreSQL

- **Description**: Create `docker-compose.yml` at root that starts PostgreSQL 16 for local development. The backend `DATABASE_URL` references this container.
- **Files to create/modify**:
  - `docker-compose.yml` — postgres service (port 5432, volume for data persistence)
  - `.env.example` — update with PostgreSQL connection string
- **Docker Compose details**:
  ```yaml
  version: "3.8"
  services:
    postgres:
      image: postgres:16-alpine
      ports:
        - "5432:5432"
      environment:
        POSTGRES_USER: footplay
        POSTGRES_PASSWORD: footplay_dev
        POSTGRES_DB: footplay
      volumes:
        - pgdata:/var/lib/postgresql/data
  volumes:
    pgdata:
  ```
- **Acceptance criteria**:
  - [ ] `docker compose up -d` starts PostgreSQL on port 5432
  - [ ] Backend can connect to PostgreSQL using `DATABASE_URL` from `.env`
  - [ ] `npx prisma migrate dev` works against the Docker PostgreSQL
- **Validation**: `docker compose ps` shows postgres running. `npx prisma migrate dev` creates tables.

##### Task 1.7: Add root-level linting and formatting scripts

- **Description**: Wire `npm run lint` to run ESLint across all workspaces. Wire `npm run format` to run Prettier.
- **Files to modify**:
  - `package.json` (root) — add `lint` and `format` scripts
  - Task already implicitly complete from Task 1.1 if wiring is done
- **Acceptance criteria**:
  - [ ] `npm run lint` runs without errors on the current codebase
  - [ ] `npm run format` formats all supported files
- **Validation**: Introduce a deliberate formatting error, run `npm run format`, verify it's fixed.

#### 2.1.4 Dependencies

None. This is the foundation.

#### 2.1.5 Effort Estimate

**S (2-3 days)**

Breakdown:
- Task 1.1 (monorepo init): 0.5 day
- Task 1.2 (Next.js scaffold): 0.5 day
- Task 1.3 (Express scaffold): 0.5 day
- Task 1.4 (dev scripts): 0.25 day
- Task 1.5 (Prisma schema): 0.5 day
- Task 1.6 (Docker Compose): 0.25 day
- Task 1.7 (linting): 0.25 day
- Buffer: 0.25 day

#### 2.1.6 Risk Factors

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| npm workspaces dependency resolution conflicts | Low | Medium | Use exact versions in initial install. Test `npm install` on clean clone. |
| Prisma schema misalignment with transfermarkt-datasets | Medium | Medium | Schema designed from verified source tables. Validate during Dev 2. |
| Next.js 14 App Router learning curve | Low | Low | Standard pattern. One route at this stage. |
| PostgreSQL Docker port conflict (5432 already in use) | Low | Low | Document `docker compose down` and port change procedure in README. |

#### 2.1.7 "Done" Checklist

- [ ] `npm install && npm run dev` starts frontend (:3000) and backend (:4000) with no errors
- [ ] `curl http://localhost:4000/api/health` returns `{ "status": "ok" }`
- [ ] `npx prisma validate` passes
- [ ] `npx prisma migrate dev` creates all 5 tables (Player, Team, Competition, Match, Appearance) in local PostgreSQL
- [ ] `npm run lint` passes with zero warnings
- [ ] `.gitignore` covers node_modules, .next, dist, .env, .prisma
- [ ] `.env.example` documents all required variables
- [ ] `docker compose up -d` starts PostgreSQL, backend connects to it
- [ ] All changes committed to `dev-1/*` branch

---

### Development 2: Data Pipeline

#### 2.2.1 Objective

Download, parse, clean, and seed real football data from transfermarkt-datasets into the PostgreSQL database. By the end of this development, the database contains players, teams, competitions, matches, and appearances with cleaned display names and position mappings. Only matches with complete starting XIs (11 players) are seeded. This is the riskiest development because name cleaning scope is unknown until real data is inspected.

#### 2.2.2 Approach

**Data source**: [transfermarkt-datasets](https://github.com/dcaribou/transfermarkt-datasets) — a stable, well-maintained open dataset of football transfers, matches, lineups, and player data. We download the latest CSV release and parse it.

**Download strategy**: The `scripts/` workspace contains a TypeScript script (`download-data.ts`) that:
1. Fetches the latest release archive from GitHub
2. Extracts relevant CSVs (`players.csv`, `clubs.csv`, `games.csv`, `game_lineups.csv`, `competitions.csv`)
3. Caches them locally for reproducibility
4. Validates column presence before proceeding

**Name cleaning**: The critical and riskiest step. Strategy:
1. Use `last_name` as the default `display_name` for most players
2. For players known by a single name (Pelé, Neymar), the dataset's `name` field already stores just that — use `name`
3. For players with common short forms, build a manual override mapping seeded from `scripts/name-overrides.ts`
4. Log all players where auto-extraction produces ambiguous results (e.g., multiple players sharing the same `last_name`) for manual review

**Position mapping**: Convert `sub_position` values (Centre-Back, Left Winger, etc.) to tactic-board x/y coordinates. The mapping utility lives in `backend/src/services/positionMapping.ts` (used by the API) and is also used during seed to validate position data quality.

**Lineup filtering algorithm**:
1. Load all appearances with `type = "starting_lineup"`
2. Group by `(game_id, club_id)`
3. Filter groups where count = 11
4. Collect all unique `game_id` values that have at least one valid club lineup (home or away)
5. Only seed appearances belonging to these filtered games
6. Log excluded games with reason (count != 11, missing player references)

**Data integrity verification**: After seeding, run validation queries:
- `SELECT COUNT(*) FROM matches` — should match filtered game count
- Random match query returns 11 appearances
- No orphaned appearance rows (every `game_id`, `club_id`, `player_id` references existing rows)
- `display_name` is non-null for every player

#### 2.2.3 Detailed Tasks

##### Task 2.1: Create data download script

- **Description**: Write a TypeScript script that downloads transfermarkt-datasets CSVs, extracts them, validates column headers, and caches them in a local `data/` directory.
- **Files to create/modify**:
  - `scripts/package.json` — typescript, ts-node, axios (or node-fetch), csv-parse, adm-zip (or tar)
  - `scripts/tsconfig.json` — extends base
  - `scripts/src/download-data.ts` — download, extract, validate, cache logic
  - `.gitignore` — add `data/` (cached CSVs, not committed)
- **Acceptance criteria**:
  - [ ] Script downloads CSVs from GitHub release
  - [ ] Extracts and caches files to `scripts/data/`
  - [ ] Validates that all required columns exist in each CSV
  - [ ] Skips download if cached data exists (idempotent)
  - [ ] Logs progress and errors to console
- **Validation**: `npx ts-node scripts/src/download-data.ts` completes with "Download complete" message. `ls scripts/data/` shows 5 CSV files.

##### Task 2.2: Implement name cleaning utility

- **Description**: Create the name-cleaning logic that populates `display_name`. Default to `last_name`, with override mappings for known special cases.
- **Files to create/modify**:
  - `scripts/src/name-cleaning.ts` — core logic + override map
  - `scripts/src/name-overrides.ts` — seed manual override map (start with 20-30 known cases)
- **Name override examples**:
  ```typescript
  const NAME_OVERRIDES: Record<string, string> = {
    "Cristiano Ronaldo dos Santos Aveiro": "Ronaldo",
    "Lionel Andrés Messi Cuccittini": "Messi",
    "Neymar da Silva Santos Júnior": "Neymar",
    "Edson Arantes do Nascimento": "Pelé",
    // ... expanded as discovered during data inspection
  };
  ```
- **Strategy**:
  1. Check exact match against `NAME_OVERRIDES` map by `name` (full name)
  2. If no override found, use `last_name` as `display_name`
  3. If `last_name` is empty, use `first_name`
  4. If both are empty, fall back to `name`
  5. Log all players where `display_name` is not distinct within the dataset (same `display_name` maps to multiple `name` values) for manual review
- **Acceptance criteria**:
  - [ ] Every player receives a non-null `display_name`
  - [ ] Known overrides (Messi, Ronaldo, Neymar, Pelé) are correctly applied
  - [ ] Ambiguous cases are logged to a file for review
  - [ ] No two players (with different `name`) share the same `display_name` after dedup logic
- **Validation**: Run `npx ts-node scripts/src/name-cleaning.ts` with a sample of players. Verify output.

##### Task 2.3: Create Prisma seed script with lineup filtering

- **Description**: Write the main seed script that reads CSVs, cleans names, filters complete lineups, and inserts all data via Prisma. This is the biggest task in Dev 2.
- **Files to create/modify**:
  - `backend/prisma/seed.ts` — main seed entry point (called by `prisma db seed`)
  - `scripts/src/seed.ts` — or use as shared import
  - `backend/package.json` — add `"prisma": { "seed": "ts-node prisma/seed.ts" }`
- **Seed flow**:
  1. Call download script (ensure data exists)
  2. Parse players CSV → create Player records (with cleaned display_name)
  3. Parse clubs CSV → create Team records
  4. Parse competitions CSV → create Competition records (populate name + competition_id)
  5. Parse games CSV → create Match records
  6. Parse game_lineups CSV → filter to complete starting XIs
  7. Filter games to only those with valid lineups
  8. Delete matches that failed the lineup filter (clean up)
  9. Create Appearance records for filtered lineups
  10. Run integrity checks
- **Batch size**: Insert in batches of 500-1000 to avoid memory issues. Use Prisma `createMany`.
- **Acceptance criteria**:
  - [ ] `npx prisma db seed` completes within reasonable time (< 10 minutes)
  - [ ] Players table has 37,000+ records
  - [ ] Teams table has 10,000+ records
  - [ ] Competitions table has records for all leagues present in the dataset
  - [ ] Matches table has 30,000+ records (filtered from 79k — only complete XI matches)
  - [ ] Appearances table has 700,000+ records (30k matches × ~22 appearances per match)
  - [ ] Every player has a non-null `display_name`
  - [ ] Every appearance references valid match, club, and player
- **Validation**: Run `npx prisma db seed`. Then run:
  - `npx prisma studio` and inspect random rows
  - SQL: `SELECT COUNT(*) FROM players`, `SELECT COUNT(*) FROM matches`
  - SQL: `SELECT m.game_id, COUNT(a.id) FROM matches m JOIN appearances a ON a.game_id = m.game_id WHERE a.type = 'starting_lineup' GROUP BY m.game_id HAVING COUNT(a.id) = 11 LIMIT 5`

##### Task 2.4: Create position mapping utility

- **Description**: Build a utility that maps `sub_position` or `position` strings to tactic-board x/y coordinates. This is used by the API to position shirts on the pitch.
- **Files to create/modify**:
  - `backend/src/services/positionMapping.ts` — mapping dictionary + lookup function
- **Mapping details**:
  ```typescript
  // Core position groups (x/y as percentage of pitch dimensions)
  // Y-axis: 0 = top (attacking end), 100 = bottom (own goal)
  // X-axis: 0 = left, 100 = right
  // Coordinates match the pitch position mapping defined in Project.md.
  // LCB/RCB split and LCM/RCM split are handled at render time via FORMATION_SPLIT_COORDS.
  
  const POSITION_COORDS: Record<string, { x: number; y: number }> = {
    "Goalkeeper": { x: 50, y: 90 },
    "Centre-Back": { x: 50, y: 72 },
    "Left-Back": { x: 10, y: 60 },
    "Right-Back": { x: 90, y: 60 },
    "Defensive Midfield": { x: 50, y: 50 },
    "Central Midfield": { x: 50, y: 45 },
    "Attacking Midfield": { x: 50, y: 35 },
    "Left Midfield": { x: 15, y: 42 },
    "Right Midfield": { x: 85, y: 42 },
    "Left Winger": { x: 15, y: 25 },
    "Right Winger": { x: 85, y: 25 },
    "Centre-Forward": { x: 50, y: 15 },
    "Second Striker": { x: 50, y: 25 },
  };
  
  // Formation-specific split positions (used at render time to spread
  // Centre-Backs into LCB/RCB and Central Midfielders into LCM/RCM).
  const FORMATION_SPLIT_COORDS: Record<string, { x: number; y: number }> = {
    "LCB": { x: 30, y: 72 },
    "RCB": { x: 70, y: 72 },
    "LCM": { x: 30, y: 45 },
    "RCM": { x: 70, y: 45 },
  };
  
  // Fallback mapping when position string isn't recognized
  // Maps the general position group to a reasonable default
  const POSITION_GROUP_FALLBACK: Record<string, { x: number; y: number }> = {
    "Goalkeeper": { x: 50, y: 90 },
    "Defender": { x: 50, y: 72 },
    "Midfield": { x: 50, y: 45 },
    "Forward": { x: 50, y: 15 },
  };
  ```
- **Acceptance criteria**:
  - [ ] All common `sub_position` values have coordinate mappings
  - [ ] Unknown positions fall back gracefully to a group-based default
  - [ ] Function signature: `getPositionCoords(position: string, subPosition?: string): { x: number; y: number }`
  - [ ] Coordinates are percentages (0-100) for both x and y
- **Validation**: `npx ts-node -e "const { getPositionCoords } = require('./backend/src/services/positionMapping'); console.log(getPositionCoords('Goalkeeper'));"` outputs `{ x: 50, y: 90 }`.

##### Task 2.5: Data integrity verification script

- **Description**: Build a standalone verification script that validates database integrity after seeding.
- **Files to create/modify**:
  - `scripts/src/verify-data.ts` — integrity checks
- **Checks**:
  1. Row counts within expected ranges
  2. No orphaned appearances (join checks)
  3. Every match has at least one lineup with 11 starting players
  4. `display_name` uniqueness check (log duplicates)
  5. Random spot-check: query 5 random matches, verify each has 11+ appearances
- **Acceptance criteria**:
  - [ ] Script reports PASS/FAIL for each check
  - [ ] All checks pass on seeded data
  - [ ] Failed checks include actionable error messages
- **Validation**: `npx ts-node scripts/src/verify-data.ts` shows "All checks passed".

#### 2.2.4 Dependencies

- **Dev 1 (Repo Scaffold & Prisma Schema)** — Prisma schema must exist, PostgreSQL must be running

#### 2.2.5 Effort Estimate

**M (3-5 days)**

Breakdown:
- Task 2.1 (download script): 0.5 day
- Task 2.2 (name cleaning): 1-2 days (RISK: unknown scope)
- Task 2.3 (seed script + lineup filtering): 1.5 days
- Task 2.4 (position mapping): 0.25 day
- Task 2.5 (verification): 0.25 day
- Buffer: 0.5-1 day

#### 2.2.6 Risk Factors

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Name cleaning scope larger than expected** | **High** | Medium | Budget 2 days. Log ambiguous cases for manual review. Seed 50+ overrides. Defer edge cases to v1.2 name override table. |
| CSV parsing edge cases (encoding, commas in names) | Medium | Medium | Use robust CSV parser (`csv-parse` with `relax_column_count: true`). Validate row counts after parse. |
| Large dataset causes memory issues | Medium | Medium | Batch inserts (500-1000 rows). Use streaming CSV parser to avoid loading all rows into memory. |
| Lineup filtering eliminates too many matches | Medium | Medium | Test filtering logic early with a sample. Report filtering stats (e.g., "79k games → 35k valid after lineup filter"). |
| transfermarkt-datasets schema changes | Low | Medium | Pin to specific release tag. Validate columns before parsing. |

#### 2.2.7 "Done" Checklist

- [ ] `npx prisma db seed` completes within 10 minutes
- [ ] Database reports expected row counts (37k+ players, 10k+ teams, ~300 competitions, 30k+ matches, 700k+ appearances) — these are estimates based on the current transfermarkt-datasets release; actual counts may vary
- [ ] Every player has a non-null `display_name`
- [ ] Known name overrides work (Messi → "Messi", Ronaldo → "Ronaldo", etc.)
- [ ] No orphaned records (all foreign keys reference valid rows)
- [ ] Every match has at least 11 starting lineup appearances
- [ ] Position mapping covers all commonly occurring `sub_position` values
- [ ] `scripts/src/verify-data.ts` passes all checks
- [ ] Ambiguous names logged to file for manual override seeding
- [ ] All changes committed to `dev-2/*` branch

---

### Development 3: Core REST API

#### 2.3.1 Objective

Build the three Express API endpoints that power the Missing Eleven game. By the end of this development, the backend serves match data with full lineups, individual match details, and player search — all with consistent error handling and logging.

#### 2.3.2 Approach

**Express app structure**: The backend scaffold from Dev 1 is extended with proper middleware, route files, and a service layer. Controllers are minimal — they parse the request, delegate to a service, and format the response.

**Endpoint design**:

1. `GET /api/matches/random`
   - Returns a random match with full lineup data for both teams
   - Uses PostgreSQL `ORDER BY RANDOM() LIMIT 1` (acceptable for ~35k rows)
   - Returns: match metadata (date, score, competition, formation) + both lineups with player details (id, display_name, shirt number, position, coordinates)
   - Response shape:
     ```json
     {
       "match": {
         "id": 123,
         "date": "2023-05-28",
         "season": "2022/2023",
         "competition": "Premier League",
         "homeClub": { "id": 15, "name": "Manchester City" },
         "awayClub": { "id": 42, "name": "Chelsea" },
         "homeScore": 4,
         "awayScore": 1,
         "homeFormation": "4-3-3",
         "awayFormation": "4-2-3-1"
       },
       "homeLineup": [
         { "playerId": 1, "displayName": "Ederson", "shirtNumber": 31, "position": "Goalkeeper", "coords": { "x": 50, "y": 92 } },
         { "playerId": 2, "displayName": "Walker", "shirtNumber": 2, "position": "Right-Back", "coords": { "x": 88, "y": 68 } },
         ...
       ],
       "awayLineup": [...]
     }
     ```

2. `GET /api/matches/:id`
   - Same response shape as `/random` but for a specific match ID
   - Returns 404 if match not found

3. `GET /api/players?q=`
   - Debounced server-side search by `display_name` (case-insensitive, partial match)
   - Returns top 20 matches, sorted by popularity or alphabetically
   - Query parameter: `q` (string, min 2 characters)
   - Response:
     ```json
     {
       "results": [
         { "id": 1, "displayName": "Messi", "team": "Inter Miami" },
         ...
       ]
     }
     ```

**Error handling**: Middleware that catches all errors and returns a consistent JSON shape. Validation middleware checks required parameters.

**Logging**: Morgan middleware for request logging (method, path, status, duration).

**CORS**: Configured to allow frontend origin (default: `http://localhost:3000`).

#### 2.3.3 Detailed Tasks

##### Task 3.1: Set up Express middleware stack

- **Description**: Add CORS, JSON body parser, Morgan logging, and error handling middleware to the Express app.
- **Files to create/modify**:
  - `backend/src/index.ts` — add middleware imports and `.use()` calls
  - `backend/src/middleware/errorHandler.ts` — catch-all error handler, returns `{ error: string, code: string }`
  - `backend/src/middleware/logger.ts` — Morgan configuration (or use directly in index.ts)
  - `backend/src/middleware/validate.ts` — param validation helpers
- **Acceptance criteria**:
  - [ ] CORS allows requests from `http://localhost:3000` (configurable via env)
  - [ ] All errors return JSON shape: `{ error: string, code: string }`
  - [ ] Request logs appear in console with method, path, status, duration
  - [ ] `Content-Type: application/json` is set on all responses
- **Validation**: Hit a non-existent route: `curl http://localhost:4000/api/nonexistent` returns `{ "error": "Not found", "code": "NOT_FOUND" }` with status 404.

##### Task 3.2: Implement GET /api/matches/random

- **Description**: Build the endpoint that returns a random match with full lineups, player details, and position coordinates.
- **Files to create/modify**:
  - `backend/src/routes/matches.ts` — route definitions
  - `backend/src/services/matchService.ts` — Prisma query logic
  - `backend/src/services/positionMapping.ts` — reuse from Dev 2 (or create stub if not yet available)
- **Query logic**: Include the competition relation so the response can resolve `competition_id` to a human-readable name (e.g. "Premier League").
  ```typescript
  // Select a random match that has at least one complete lineup
  const match = await prisma.match.findFirst({
    orderBy: { id: 'asc' }, // Or use raw SQL for RANDOM()
    skip: Math.floor(Math.random() * totalMatches),
    take: 1,
    include: {
      homeClub: true,
      awayClub: true,
      competition: true, // Resolves competition_id → name via Competition model
      appearances: {
        where: { type: 'starting_lineup' },
        include: { player: true },
      },
    },
  });
  ```
  
  **Alternative (more efficient random selection)**:
  ```sql
  SELECT * FROM matches OFFSET floor(random() * (SELECT COUNT(*) FROM matches)) LIMIT 1;
  ```
  
  Then fetch lineups in a second query. This avoids loading the random offset into application memory.
  
  **Competition name**: Populated from `match.competition.name`. The `competition` field in the API response is the resolved name, not the raw ID.
- **Acceptance criteria**:
  - [ ] Returns 200 with valid JSON response
  - [ ] Response includes match metadata (date, score, competition name, formations)
  - [ ] Response includes `homeLineup` and `awayLineup` arrays
  - [ ] Each lineup entry has: playerId, displayName, shirtNumber, position, coords
  - [ ] Each lineup has exactly 11 players (the filtered guarantee from Dev 2)
  - [ ] Response time < 500ms for typical queries
- **Validation**: `curl http://localhost:4000/api/matches/random | jq '.homeLineup | length'` returns 11. Run 5 times, verify different matches each time.

##### Task 3.3: Implement GET /api/matches/:id

- **Description**: Build the endpoint for fetching a specific match by its internal ID.
- **Files to modify**:
  - `backend/src/routes/matches.ts` — add `:id` route
  - `backend/src/services/matchService.ts` — add `getMatchById(id)` function
- **Acceptance criteria**:
  - [ ] `GET /api/matches/1` returns a valid match with full lineup
  - [ ] `GET /api/matches/9999999` returns 404 with error JSON
  - [ ] Same response shape as `/random`
  - [ ] Invalid ID (non-numeric) returns 400 with validation error
- **Validation**: `curl http://localhost:4000/api/matches/1 | jq '.match.id'` returns 1. `curl http://localhost:4000/api/matches/invalid` returns 400.

##### Task 3.4: Implement GET /api/players?q=

- **Description**: Build the debounced player search endpoint.
- **Files to create/modify**:
  - `backend/src/routes/players.ts` — route definitions
  - `backend/src/services/playerService.ts` — Prisma search query
  - `backend/src/index.ts` — register players route
- **Query logic**:
  ```typescript
  const players = await prisma.player.findMany({
    where: {
      displayName: {
        contains: query,
        mode: 'insensitive',
      },
    },
    take: 20,
    orderBy: { displayName: 'asc' },
    include: {
      appearances: {
        take: 1,
        include: { club: true },
      },
    },
  });
  ```
- **Validation**:
  - Minimum query length: 2 characters (return 400 if shorter)
  - Case-insensitive matching
  - Return top 20 results
  - Each result: player ID, display name, team (from most recent appearance if available)
- **Performance target**: Respond within 300ms for partial queries on 37k players
- **Acceptance criteria**:
  - [ ] `GET /api/players?q=ron` returns players matching "ron" in display_name
  - [ ] Empty `?q=` returns 400 (minimum 2 characters)
  - [ ] Results limited to 20
  - [ ] Case-insensitive: `?q=Ron` and `?q=ron` return same results
  - [ ] Response time < 300ms for typical queries
  - [ ] Each result includes player ID, display name
- **Validation**: `curl "http://localhost:4000/api/players?q=ron" | jq '.results | length'` returns ≤ 20. `curl "http://localhost:4000/api/players?q=r"` returns 400.

##### Task 3.5: Add request validation and error response consistency

- **Description**: Ensure all endpoints validate inputs and return consistent error shapes.
- **Files to modify**:
  - `backend/src/middleware/validate.ts` — add validation helpers
  - `backend/src/routes/matches.ts` — add ID validation
  - `backend/src/routes/players.ts` — add query parameter validation
- **Error shapes**:
  ```json
  // 400 Bad Request
  { "error": "Query parameter 'q' must be at least 2 characters", "code": "INVALID_PARAMETER" }
  
  // 404 Not Found
  { "error": "Match with id 999999 not found", "code": "NOT_FOUND" }
  
  // 500 Internal Server Error
  { "error": "Internal server error", "code": "INTERNAL_ERROR" }
  ```
- **Acceptance criteria**:
  - [ ] Every possible error case returns one of the three shapes above
  - [ ] Validation errors include the specific field that failed
  - [ ] Stack traces are NOT exposed in production error responses
- **Validation**: Test all error cases manually with curl.

#### 2.3.4 Dependencies

- **Dev 2 (Data Pipeline)** — Database must be seeded with data

#### 2.3.5 Effort Estimate

**M (2-4 days)**

Breakdown:
- Task 3.1 (middleware): 0.5 day
- Task 3.2 (matches/random): 1 day
- Task 3.3 (matches/:id): 0.5 day
- Task 3.4 (players search): 0.5 day
- Task 3.5 (validation + error consistency): 0.5 day
- Buffer: 0.5 day

#### 2.3.6 Risk Factors

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Random match query performance | Low | Medium | `ORDER BY RANDOM()` is acceptable for 35k rows. If slow, use `OFFSET floor(random() * count)` approach. |
| Player search under 300ms with 37k records | Medium | Medium | Add database index on `display_name`. Prisma `contains` with `insensitive` mode uses ILIKE which can be slow — monitor and add trigram index if needed. |
| Large response payloads (full lineup = lots of data) | Low | Low | Response is ~5-10 KB per match. Acceptable. No pagination needed for single-match endpoints. |

#### 2.3.7 "Done" Checklist

- [ ] `GET /api/matches/random` returns random match with 11-player lineup on each team
- [ ] `GET /api/matches/:id` returns specific match with full lineup
- [ ] `GET /api/matches/:id` returns 404 for non-existent or invalid IDs
- [ ] `GET /api/players?q=ron` returns ≤ 20 results within 300ms
- [ ] `GET /api/players?q=r` returns 400 (minimum 2 chars)
- [ ] All errors return consistent JSON shape `{ error, code }`
- [ ] Request logging shows method, path, status, duration
- [ ] CORS configured for frontend origin
- [ ] No stack traces exposed in error responses
- [ ] `npm run lint` passes
- [ ] All changes committed to `dev-3/*` branch

---

### Development 4: Frontend Shell & Layout

#### 2.4.1 Objective

Build the frontend foundation — shared layout, page structure, and all game components in their initial form. By the end of this development, the `/missing-eleven` route renders a tactic board with 11 shirts, match info, and interactive shirt state changes — all driven by **mock data** (no real API dependency yet). This development can run in parallel with Dev 2 and Dev 3.

#### 2.4.2 Approach

**Component tree**:
```
Layout
├── Navbar
├── /missing-eleven/page.tsx (game wrapper)
│   ├── MatchInfo (score, date, competition)
│   └── TacticBoard (pitch background)
│       └── Shirt × 11 (position-based, state-driven)
└── Footer
```

**State management**: Components accept props and optional callback functions. Game state (which shirt is active, which state each shirt is in) is managed by a parent state container that will be replaced by the game state machine in Dev 5. For now, the page can use `useState` for demo interactions.

**Mock data**: A static mock object in `frontend/src/lib/mockData.ts` mimics the API response shape from Dev 3. This allows development to proceed without the real API.

**Shirt component states** (from Project.md):
1. **Default**: Shirt color with player number
2. **In progress**: Below shirt, guessed letters displayed (e.g., `..R...`)
3. **Correct**: Full player name below shirt in default color
4. **Failed**: Correct name below shirt in red

For this development, shirt states are driven by mock data and local click handlers. The Wordle modal is not yet functional — clicking a shirt toggles between default and "in progress" states to demonstrate state rendering.

**TacticBoard rendering**: CSS-based pitch with shirts positioned using absolute positioning (top/left percentages from the position mapping). The pitch is rendered as a green rectangle with white pitch markings (center circle, penalty areas) using CSS/SVG.

**Responsive design**: Desktop-first. On mobile, the pitch scales down proportionally. Shirts are large enough to be tappable on mobile (minimum 44px touch target).

#### 2.4.3 Detailed Tasks

##### Task 4.1: Create shared Layout, Navbar, and Footer components

- **Description**: Build the reusable site shell that wraps all pages.
- **Files to create/modify**:
  - `frontend/src/app/layout.tsx` — modify to use Layout component
  - `frontend/src/components/Layout.tsx` — Nav + main + Footer wrapper
  - `frontend/src/components/Navbar.tsx` — site logo, navigation links
  - `frontend/src/components/Footer.tsx` — copyright, links
- **Acceptance criteria**:
  - [ ] Layout renders on all pages
  - [ ] Navbar shows "FootPlay" logo and "Missing Eleven" link
   - [ ] Footer shows copyright
  - [ ] Responsive: Navbar collapses hamburger menu on mobile
- **Validation**: Run frontend, verify layout renders correctly at desktop and mobile viewport sizes.

##### Task 4.2: Create TypeScript type definitions

- **Description**: Define all game-related types matching the API response shape.
- **Files to create/modify**:
  - `frontend/src/types/index.ts` — all shared types
- **Type definitions**:
  ```typescript
  export interface Match {
    id: number;
    date: string;
    season: string;
    competition: string;
    homeClub: Club;
    awayClub: Club;
    homeScore: number;
    awayScore: number;
    homeFormation: string;
    awayFormation: string;
  }
  
  export interface Club {
    id: number;
    name: string;
  }
  
  export interface LineupPlayer {
    playerId: number;
    displayName: string;
    shirtNumber: number;
    position: string;
    coords: PositionCoords;
  }
  
  export interface PositionCoords {
    x: number; // 0-100 percentage
    y: number; // 0-100 percentage
  }
  
  export interface MatchResponse {
    match: Match;
    homeLineup: LineupPlayer[];
    awayLineup: LineupPlayer[];
  }
  
  export interface PlayerSearchResult {
    id: number;
    displayName: string;
  }
  
  export interface PlayerSearchResponse {
    results: PlayerSearchResult[];
  }
  
  export type ShirtState = 'default' | 'in-progress' | 'correct' | 'failed';
  
  export interface ShirtData {
    player: LineupPlayer;
    state: ShirtState;
    guessedLetters: string; // e.g., "..R..." for in-progress
    attemptsRemaining: number;
  }
  
  export type TeamSide = 'home' | 'away';
  ```
- **Acceptance criteria**:
  - [ ] All types compile without errors
  - [ ] Types match the API response shape from Dev 3
  - [ ] `ShirtState` is a union type with 4 values
- **Validation**: `npm run build` in frontend passes TypeScript compilation.

##### Task 4.3: Create API client module (with mock data fallback)

- **Description**: Build the API client (`lib/api.ts`) that fetches from the real API. Include a `USE_MOCK` flag that switches to mock data during development.
- **Files to create/modify**:
  - `frontend/src/lib/api.ts` — fetch wrapper with error handling
  - `frontend/src/lib/mockData.ts` — static mock match response
- **API client functions**:
  ```typescript
  export async function fetchRandomMatch(): Promise<MatchResponse>
  export async function fetchMatchById(id: number): Promise<MatchResponse>
  export async function searchPlayers(query: string): Promise<PlayerSearchResponse>
  ```
- **Mock data**: At least 2 mock matches with complete 11-player lineups for both teams.
- **Acceptance criteria**:
  - [ ] `fetchRandomMatch()` returns a `MatchResponse` object (mock or real)
  - [ ] `fetchMatchById(1)` returns a match
  - [ ] `searchPlayers("ron")` returns results
  - [ ] API functions throw on network errors (caller handles)
- **Validation**: Import and call each function in a test or browser console.

##### Task 4.4: Build TacticBoard component

- **Description**: Render a football pitch with shirts positioned at coordinates. This is the visual centerpiece of the game.
- **Files to create/modify**:
  - `frontend/src/components/TacticBoard.tsx` — pitch SVG/CSS + shirt placement
  - `frontend/src/components/Pitch.tsx` — optional sub-component for pitch background
- **Rendering approach**: 
  - Use a `div` with `position: relative` and `aspect-ratio: 2/3` (portrait pitch)
  - Pitch background: green via CSS, white markings via SVG overlay (center circle, halfway line, penalty areas, goal area)
  - Each shirt is positioned with `position: absolute; left: ${x}%; top: ${y}%; transform: translate(-50%, -50%)`
  - The 11 shirts for one team are rendered based on the lineup data
  - Formation label displayed above the pitch (e.g., "4-3-3")
  - Team name displayed above formation
- **Acceptance criteria**:
  - [ ] Pitch renders as a green rectangle with correct proportions
  - [ ] Pitch markings are visible (center circle, halfway line, penalty areas)
  - [ ] 11 shirts are positioned according to their coordinate data
  - [ ] Shirts are evenly distributed and not overlapping
  - [ ] Formation label displays above the pitch
- **Validation**: Render page with mock data. Visually inspect shirt positions resemble a football formation. Use browser DevTools to verify positioning percentages.

##### Task 4.5: Build Shirt component (4 states)

- **Description**: Render an individual shirt with 4 visual states. Each state must be clearly distinguishable.
- **Files to create/modify**:
  - `frontend/src/components/Shirt.tsx` — shirt component
- **State rendering**:
  - **Default**: Colored shirt SVG/icon with shirt number displayed centrally. Player name NOT shown.
  - **In progress**: Same shirt icon. Below it, guessed letters in a monospace display (e.g., `_ _ R _ _ _`). Non-guessed positions show underscore. Empty state = all underscores.
  - **Correct**: Shirt icon + full player name displayed below in default (white/black) text color.
  - **Failed**: Shirt icon + full player name displayed below in red text. The shirt may have a subtle visual indicator (e.g., slightly faded or red-tinted).
- **Props interface**:
  ```typescript
  interface ShirtProps {
    player: LineupPlayer;
    state: ShirtState;
    guessedLetters?: string; // Only for 'in-progress'
    onClick?: () => void;
  }
  ```
- **Acceptance criteria**:
  - [ ] All 4 states render distinctly
  - [ ] Shirt number is visible in default state
  - [ ] In-progress state shows underscores for unguessed letters
  - [ ] Correct state shows full player name
  - [ ] Failed state shows full player name in red
  - [ ] Component is clickable (onClick handler fires)
- **Validation**: Render each state with test props. Visually verify distinct styling.

##### Task 4.6: Build MatchInfo component

- **Description**: Display match metadata — home team vs away team with score, date, competition.
- **Files to create/modify**:
  - `frontend/src/components/MatchInfo.tsx`
- **Props interface**:
  ```typescript
  interface MatchInfoProps {
    match: Match;
  }
  ```
- **Acceptance criteria**:
  - [ ] Shows team names: "Manchester City 4-1 Chelsea"
  - [ ] Shows date below score
  - [ ] Shows competition name below date
  - [ ] Responsive: scores are prominent on mobile
- **Validation**: Render with mock match data. Visually verify layout.

##### Task 4.7: Create the /missing-eleven page route

- **Description**: Wire up the game page at `/missing-eleven` that composes MatchInfo, TacticBoard, and Shirt components with mock data.
- **Files to create/modify**:
  - `frontend/src/app/missing-eleven/page.tsx` — game page
  - `frontend/src/app/page.tsx` — update home page with link to game (required)
- **Page logic**:
  1. On mount, fetch mock match data (or real if API available)
  2. Display MatchInfo at top
  3. Display TacticBoard with 11 shirts below
  4. Each shirt click cycles states (default → in-progress → correct → failed → default) — TEMPORARY, for Dev 4 only
  5. On match load, randomly select one team (home or away) as the active team — only that team's lineup is shown on the tactic board
- **State management (minimal, replaced in Dev 5)**:
  ```typescript
  const [shirts, setShirts] = useState<ShirtData[]>(mockLineup.map(p => ({
    player: p,
    state: 'default',
    guessedLetters: '',
    attemptsRemaining: 6,
  })));
  ```
- **Acceptance criteria**:
  - [ ] `/missing-eleven` renders MatchInfo and TacticBoard
  - [ ] 11 shirts visible in formation layout
  - [ ] Clicking a shirt cycles through states (Dev 4 temp behavior)
  - [ ] Page is responsive (mobile-friendly)
  - [ ] No API server required — works entirely with mock data
- **Validation**: Navigate to `/missing-eleven`. Visually verify layout. Click shirts to cycle states.

##### Task 4.8: Tailwind configuration and responsive design

- **Description**: Set up Tailwind with custom theme values for the game, ensure responsive breakpoints work.
- **Files to modify**:
  - `frontend/tailwind.config.ts` — add custom colors, fonts, breakpoints
- **Additions**:
  - Custom color: `pitch-green` (#2e7d32 or similar)
  - Custom font: system font stack (no external font dependency)
  - Ensure Tailwind JIT compiles all used classes
- **Acceptance criteria**:
  - [ ] Custom theme values are available as Tailwind classes
  - [ ] Page renders correctly at 375px (mobile), 768px (tablet), 1280px (desktop)
  - [ ] Shirts meet 44px minimum touch target on mobile
- **Validation**: Use Chrome DevTools responsive mode to test all three breakpoints.

#### 2.4.4 Dependencies

- **Dev 1 (Repo Scaffold & Prisma Schema)** — Next.js app must exist
- **No dependency on Dev 2 or Dev 3** — uses mock data

#### 2.4.5 Effort Estimate

**S (2-3 days)**

Breakdown:
- Task 4.1 (Layout, Navbar, Footer): 0.5 day
- Task 4.2 (TypeScript types): 0.25 day
- Task 4.3 (API client + mock data): 0.5 day
- Task 4.4 (TacticBoard): 0.75 day
- Task 4.5 (Shirt): 0.5 day
- Task 4.6 (MatchInfo): 0.25 day
- Task 4.7 (/missing-eleven page): 0.5 day
- Task 4.8 (Tailwind config + responsive): 0.25 day

#### 2.4.6 Risk Factors

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Shirt positioning overlaps for some formations | Medium | Medium | Test with 5 common formations during development. Add minimum distance constraint. |
| Pitch SVG markings complex to render | Low | Low | Use simplified markings (center circle + halfway line + penalty areas). SVG overlay is well-documented. |
| Responsive layout breaks on very small screens | Low | Low | Set minimum width for game container, allow horizontal scroll on tiny screens. |

#### 2.4.7 "Done" Checklist

- [ ] `/missing-eleven` renders with mock data (no API required)
- [ ] MatchInfo shows score, teams, date, competition
- [ ] TacticBoard renders a green pitch with 11 shirts in formation
- [ ] Pitch markings visible (center circle, halfway line, penalty areas)
- [ ] Shirt component has 4 distinct visual states
- [ ] Clicking a shirt changes its state
- [ ] Layout, Navbar, Footer render correctly
- [ ] Responsive design works on mobile, tablet, desktop
- [ ] TypeScript types defined and compile
- [ ] API client module exists with mock data fallback
- [ ] `npm run lint` passes
- [ ] All changes committed to `dev-4/*` branch

---

### Development 5: Wordle Algorithm & Game Loop

#### 2.5.1 Objective

Build the core game mechanics — the Wordle algorithm, the Wordle modal UI, the game state machine, and game completion flow. Then wire everything to the real API. By the end of this development, a complete game loop is playable: click shirt → Wordle guesses → colored feedback → correct/failed → all 11 shirts done → game complete.

**This is the integration point** — it combines the API (Dev 3) with the frontend shell (Dev 4) into a working game.

#### 2.5.2 Approach

**Wordle algorithm** (`lib/wordle.ts`): A pure function that compares a guess string against the target `display_name` and returns an array of letter results (green/orange/grey). Input is normalized: lowercase, diacritics stripped. Output matches the classic Wordle feedback model.

**WordleModal component**: A modal dialog that appears when a shirt is clicked. Contains:
- Target player position hint (optional: "Position: Centre-Forward")
- Text input field (autofocused, max length = target name length)
- 6-row feedback grid showing all guesses for this player
- On-screen keyboard (optional for v1.0, can be just physical keyboard)
- Submit button (Enter key also submits)
- Close/minimize button (player can switch to another shirt mid-guess)

**Game state machine** (`lib/gameState.ts`): Uses `useReducer` for predictable state transitions. State includes:
- `match`: The current match data (from API)
- `teamSide`: 'home' | 'away'
- `shirts`: Array of ShirtData objects (one per lineup player)
- Each ShirtData has: player info, state, guesses[], attemptsRemaining
- `activeShirtIndex`: Index of the shirt currently being guessed (null = no modal open)
- `gameStatus`: 'playing' | 'won' | 'lost'

**Persistence**: Game state is serialized to localStorage on every state change. On page load, check localStorage for existing session. If found, restore state. Session key includes the match ID so refreshing resets to the same game.

**Integration**: Replace mock data with real API calls. The `fetchRandomMatch()` function now hits `GET /api/matches/random`. Error handling shows a retry UI if the API is down.

**Name matching**: When a player submits a guess, the Wordle algorithm compares it against `display_name` of the target player. Case-insensitive, diacritic-insensitive comparison.

#### 2.5.3 Detailed Tasks

##### Task 5.1: Build the Wordle algorithm utility

- **Description**: Create a pure function `evaluateGuess(guess: string, target: string): LetterResult[]` that returns per-letter feedback.
- **Files to create/modify**:
  - `frontend/src/lib/wordle.ts` — algorithm
  - (No test file in v1.0 scope, but algorithm should be structured for easy testing)
- **Algorithm details**:
  ```typescript
  export type LetterResult = 'correct' | 'present' | 'absent';
  
  export interface LetterFeedback {
    letter: string;
    result: LetterResult;
  }
  
  export function evaluateGuess(guess: string, target: string): LetterFeedback[] {
    // 1. Normalize both strings: lowercase, strip diacritics
    // 2. First pass: mark correct positions (green)
    // 3. Second pass: mark present-but-wrong-position (orange)
    //    - Count remaining letters in target after greens
    //    - Ensure we don't over-mark duplicates
    // 4. Remaining letters: absent (grey)
    // 5. Return array of { letter, result }
  }
  ```
- **Duplication handling** (classic Wordle rule): If a letter appears twice in the guess but only once in the target, only one instance gets "present". Priority: correct positions first, then present positions left-to-right.
- **Normalization**:
  ```typescript
  function normalize(str: string): string {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Strip diacritics
      .replace(/[^a-z0-9\s-]/g, '');   // Keep letters, numbers, spaces, hyphens
  }
  ```
- **Acceptance criteria**:
  - [ ] `evaluateGuess("MESSI", "Messi")` → all correct
  - [ ] `evaluateGuess("MEESI", "Messi")` → M: correct, E: correct, E: absent, S: present, I: correct
  - [ ] `evaluateGuess("MMMMM", "Messi")` → M: correct, M: absent, M: absent, M: absent, M: absent
  - [ ] `evaluateGuess("ronaldo", "Ronaldo")` → all correct (case-insensitive)
  - [ ] `evaluateGuess("messi", "Ronaldo")` → all absent
  - [ ] Handles diacritics: `evaluateGuess("Pele", "Pelé")` → all correct
  - [ ] Handles spaces and hyphens: `evaluateGuess("van dijk", "Van Dijk")` → all correct
- **Validation**: Write 10+ test cases in a Node script or browser console. Verify expected outputs match.

##### Task 5.2: Build WordleModal component

- **Description**: Create the modal dialog for entering and reviewing Wordle guesses for a single player.
- **Files to create/modify**:
  - `frontend/src/components/WordleModal.tsx` — modal component
- **Component features**:
  - Modal overlay (darkens background, centers content)
  - Close button (×) in top right
  - Player position hint: "Guess the Centre-Forward"
  - Display of player shirt number (for context)
  - Current attempt input: text input limited to target name length
  - Submit button (disabled if input empty or wrong length)
  - Feedback grid: shows all previous guesses with colored letter boxes (6 rows max)
  - Row coloring matches Wordle: green background for correct, orange for present, dark grey for absent
  - Submit on Enter key
  - On final guess (6th), show result: correct animation or failure reveal
  - Auto-focus input on open
  - Letters displayed in uppercase
- **Props interface**:
  ```typescript
  interface WordleModalProps {
    isOpen: boolean;
    player: LineupPlayer;
    guesses: string[];         // Previous guesses
    attemptsRemaining: number; // Starting from 6, counting down
    maxAttempts: number;       // 6 for Normal mode
    onGuess: (guess: string) => void;
    onClose: () => void;
  }
  ```
- **State management** (internal to modal):
  - Current input value
  - Feedback results for each guess row
  - Animation state for latest guess
- **Acceptance criteria**:
  - [ ] Modal opens when a shirt is clicked (from parent state)
  - [ ] Modal closes with × button or click outside (parent decides)
  - [ ] Text input accepts letters only (max length = target name length)
  - [ ] Submit button is disabled when input is empty or wrong length
  - [ ] Previous guesses display in colored rows (green/orange/grey)
  - [ ] After 6 attempts, modal shows failure state with correct name
  - [ ] Guess that matches target triggers success state
  - [ ] Input clears after each submit
  - [ ] On-screen letter feedback updates immediately after submit
- **Validation**: Render modal with mock props. Manually test all states.

##### Task 5.3: Build game state machine (useReducer + localStorage)

- **Description**: Implement the game state reducer that manages all shirts, guesses, and game status. Add localStorage persistence.
- **Files to create/modify**:
  - `frontend/src/lib/gameState.ts` — reducer, actions, localStorage helpers
- **Actions**:
  ```typescript
  type GameAction =
    | { type: 'SET_MATCH'; payload: MatchResponse }
    | { type: 'SELECT_TEAM'; payload: TeamSide }
    | { type: 'OPEN_SHIRT'; payload: number }       // Set active shirt index
    | { type: 'CLOSE_SHIRT' }
    | { type: 'SUBMIT_GUESS'; payload: string }      // Submit guess for active shirt
    | { type: 'RESTORE_SESSION'; payload: GameState } // Restore from localStorage
    | { type: 'NEW_GAME' }                           // Reset state
  ```
- **Reducer logic**:
  - `SUBMIT_GUESS`: 
    1. Normalize guess and compare against active shirt's `displayName`
    2. Add guess to shirt's `guesses[]`
    3. Decrement `attemptsRemaining`
    4. If guess matches target → set shirt state to 'correct'
    5. If attemptsRemaining reaches 0 → set shirt state to 'failed', and immediately set gameStatus to 'lost'
    6. If all 11 shirts are 'correct' → set gameStatus to 'won'
  - `NEW_GAME`: Clear state, fetch new match
- **Persistence**: Subscribe to state changes, debounce writes to localStorage key `footplay-game-session`.
- **Initial state shape**:
  ```typescript
  export interface GameState {
    match: MatchResponse | null;
    teamSide: TeamSide;
    shirts: ShirtData[];
    activeShirtIndex: number | null;
    gameStatus: 'idle' | 'loading' | 'playing' | 'won' | 'lost';
  }
  ```
- **Acceptance criteria**:
  - [ ] `SUBMIT_GUESS` correctly updates shirt state (correct/failed)
  - [ ] Game status transitions correctly (idle → loading → playing → won/lost)
  - [ ] Game ends immediately (gameStatus → 'lost') as soon as any single shirt transitions to 'failed', without waiting for other shirts to be resolved
  - [ ] Win condition (gameStatus → 'won') only fires when all 11 shirts are 'correct'
  - [ ] State persists across page refresh (check localStorage)
  - [ ] `NEW_GAME` resets all state
  - [ ] All letters tracked per shirt
- **Validation**: Simulate a game in browser, refresh page, verify state restored. Complete a game, verify won/lost status persisted.

##### Task 5.4: Build GameComplete component

- **Description**: Create the game-end overlay shown when all shirts are resolved.
- **Files to create/modify**:
  - `frontend/src/components/GameComplete.tsx`
- **Features**:
  - Shows win/loss message: "Congratulations!" or "Better luck next time!"
  - Win: all correct names shown in green, statistics (total guesses used)
  - Loss: shows which players were failed (correct names revealed)
  - "Play Again" button → triggers NEW_GAME action
  - Match summary replayed: score, teams, date
- **Props interface**:
  ```typescript
  interface GameCompleteProps {
    gameState: GameState;
    onPlayAgain: () => void;
  }
  ```
- **Acceptance criteria**:
  - [ ] Win state: congratulatory message + correct player names + Play Again button
  - [ ] Loss state: consolation message + revealed failed names + Play Again button
  - [ ] Match summary visible below the game result
- **Validation**: Force a win/loss in the game state, verify component renders correctly.

##### Task 5.5: Wire /missing-eleven page to real API (remove mock data)

- **Description**: Update the game page to use real API calls instead of mock data. Handle loading, error, and empty states.
- **Files to modify**:
  - `frontend/src/app/missing-eleven/page.tsx` — integrate game state machine + API + modal + game complete
- **Page orchestration**:
  1. On mount: check localStorage for existing session
  2. If valid session exists: restore it (skip API call)
  3. If no session: call `fetchRandomMatch()`, create new game state
  4. Handle loading state: show spinner/skeleton
  5. Handle error state: show retry button with error message
  6. Render match info + tactic board + shirts
  7. On shirt click: if shirt is in default state → open WordleModal
  8. WordleModal onGuess → dispatch SUBMIT_GUESS → update shirt state
  9. After each guess, save state to localStorage
  10. When game status is 'won' or 'lost' → show GameComplete
- **Integration flow**:
  ```typescript
  // On mount
  useEffect(() => {
    const saved = loadGameState();
    if (saved) {
      dispatch({ type: 'RESTORE_SESSION', payload: saved });
    } else {
      dispatch({ type: 'SET_LOADING' });
      fetchRandomMatch()
        .then(data => dispatch({ type: 'SET_MATCH', payload: data }))
        .catch(() => dispatch({ type: 'SET_ERROR' }));
    }
  }, []);
  ```
- **Removing mock dependency**: Delete or disable `mockData.ts` integration. The app must work with real API data.
- **Acceptance criteria**:
  - [ ] Home page loads match from real API (Dev 3)
  - [ ] Loading state shows spinner while fetching
  - [ ] Error state shows "Could not load match. Try again." with retry button
  - [ ] Error state recovers on retry
  - [ ] After Dev 5, app no longer uses mock data by default (mock data still present in codebase as fallback but not primary)
- **Validation**: Stop backend, refresh frontend → error state shown. Start backend, click retry → game loads.

##### Task 5.6: Full game loop integration and polish

- **Description**: End-to-end testing of the complete game flow. Fix any integration issues.
- **No new files** — integration testing and fixes to existing components.
- **Test scenarios**:
  1. Click shirt → WordleModal opens with correct player context
  2. Type a guess → submit → feedback renders → modal updates
  3. Correct guess → shirt state changes to 'correct' → modal closes
  4. 6 wrong guesses → shirt state → 'failed' → modal shows failure
  5. All 11 correct → GameComplete shows win
  6. First shirt failed → immediate GameComplete shows loss (game ends on first failure)
  7. Refresh page mid-game → session restored
  8. Play Again → new match loads
  9. Switch between shirts mid-guess (close modal on one, open another)
- **Acceptance criteria**:
  - [ ] Complete game loop works end-to-end
  - [ ] All 11 shirts are interactive
  - [ ] Wordle feedback is accurate (test with known guesses)
  - [ ] Game ends correctly in both win and loss scenarios
  - [ ] Game state persists across refresh
  - [ ] Play Again starts a fresh game
- **Validation**: Play through 3 complete games manually. Test edge cases (refresh mid-guess, rapid clicking).

#### 2.5.4 Dependencies

- **Dev 3 (Core REST API)** — Real API endpoints must exist and serve data
- **Dev 4 (Frontend Shell & Layout)** — Components (TacticBoard, Shirt, MatchInfo, Layout) must exist

#### 2.5.5 Effort Estimate

**M (3-5 days)**

Breakdown:
- Task 5.1 (Wordle algorithm): 0.5 day
- Task 5.2 (WordleModal): 1 day
- Task 5.3 (Game state machine): 1 day
- Task 5.4 (GameComplete): 0.5 day
- Task 5.5 (Integration): 1 day
- Task 5.6 (Test and polish): 0.5 day
- Buffer: 0.5 day

#### 2.5.6 Risk Factors

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Wordle duplicate letter handling edge cases | Medium | Medium | Follow classic Wordle algorithm exactly. Test with 20+ cases including edge cases (triple letters, all same letter). |
| Game state localStorage serialization issues | Low | Medium | Store only serializable state. Validate on restore (check required fields exist, discard if corrupted). |
| Integration bugs between components | Medium | Medium | Systematic scenario testing (Task 5.6). Each component was tested individually in Dev 4. |
| Player names with special characters | Medium | Low | Normalization function handles most cases. Log if issues found during testing. |

#### 2.5.7 "Done" Checklist

- [ ] `evaluateGuess()` function produces correct Wordle feedback for 20+ test cases
- [ ] WordleModal renders with input, feedback grid, submit, close
- [ ] Game state machine correctly transitions between all states
- [ ] Game state persists across page refresh (localStorage)
- [ ] GameComplete shows win/loss screen with Play Again
- [ ] Full game loop works: click shirt → guess → feedback → correct/failed → game ends immediately on first failed shirt
- [ ] Win condition triggers only when all 11 shirts are correct
- [ ] App fetches real data from API (mock data disabled by default)
- [ ] Loading, error, and empty states handled gracefully
- [ ] Play Again button starts a new game
- [ ] `npm run lint` passes
- [ ] All changes committed to `dev-5/*` branch

---

### Development 6: Docker, CI/CD & Deploy

#### 2.6.1 Objective

Package the full application stack for production deployment. By the end of this development, the Missing Eleven game is accessible at a public URL over HTTPS, deployed to Oracle Cloud Free Tier, with automated CI/CD via GitHub Actions. Docker images are ARM64-compatible for the Oracle Ampere A1 instance.

#### 2.6.2 Approach

**Docker strategy**: Multi-stage Dockerfiles for both frontend and backend to minimize image size. Frontend uses Next.js standalone output. Backend uses Prisma generate + build in separate stages. Both images are built for `linux/arm64` platform.

**Production stack**: Five services managed by `docker-compose.yml`:
1. `frontend` — Next.js standalone server (port 3000)
2. `backend` — Express API (port 4000)
3. `postgres` — PostgreSQL 16 (internal port 5432)
4. `nginx` — Reverse proxy (port 80 → frontend, /api/* → backend)
5. `certbot` — Let's Encrypt SSL certificate management (auto-renewal)

**Nginx configuration**: Reverse proxy that serves frontend at `/` and proxies `/api/*` to the backend. Static assets cached with far-future expiry headers. SSL termination with certificates managed by certbot.

**CI/CD pipeline**: GitHub Actions workflow triggered on push to `main`:
1. Build frontend Docker image (with `--platform linux/arm64`)
2. Build backend Docker image (with `--platform linux/arm64`)
3. Run linting
4. SSH into Oracle Cloud instance
5. Pull `docker-compose.yml` from repo
6. Pull updated images
7. Run database migrations (`npx prisma migrate deploy`)
8. Restart services via `docker compose up -d`
9. Health check against public URL

**Oracle Cloud provisioning**: Script to:
1. Create an Oracle Cloud Free Tier ARM instance (Ampere A1, 2 OCPUs, 4 GB RAM)
2. Install Docker + Docker Compose
3. Configure firewall (ports 22, 80, 443)
4. Clone the repository
5. Run `docker compose up -d`

**Health check**: `GET /api/health` returns `{ "status": "ok", "version": "1.0.0", "timestamp": "..." }`. CI/CD pipeline pings this after deploy to verify.

#### 2.6.3 Detailed Tasks

##### Task 6.1: Create ARM64 Dockerfile for frontend

- **Description**: Multi-stage Dockerfile that builds Next.js for production and serves with the standalone server.
- **Files to create/modify**:
  - `frontend/Dockerfile` — multi-stage build
- **Dockerfile structure**:
  ```dockerfile
  # Stage 1: Dependencies
  FROM --platform=linux/arm64 node:20-alpine AS deps
  WORKDIR /app
  COPY package.json package-lock.json ./
  RUN npm ci --only=production
  
  # Stage 2: Build
  FROM --platform=linux/arm64 node:20-alpine AS build
  WORKDIR /app
  COPY --from=deps /app/node_modules ./node_modules
  COPY . .
  RUN npm run build
  
  # Stage 3: Production
  FROM --platform=linux/arm64 node:20-alpine AS runner
  WORKDIR /app
  ENV NODE_ENV=production
  COPY --from=build /app/.next/standalone ./
  COPY --from=build /app/public ./public
  COPY --from=build /app/.next/static ./.next/static
  EXPOSE 3000
  CMD ["node", "server.js"]
  ```
- **Sub-task**: Set `output: 'standalone'` in `frontend/next.config.js` (or `next.config.mjs`) to enable the standalone output mode used by the Docker build.
- **Acceptance criteria**:
  - [ ] `frontend/next.config.js` includes `output: 'standalone'`
  - [ ] `docker build --platform linux/arm64 -t footplay-frontend ./frontend` succeeds
  - [ ] Image size < 200 MB
  - [ ] Container starts and responds on port 3000
- **Validation**: Build and run container locally with `docker run -p 3000:3000 footplay-frontend`. Verify home page loads.

##### Task 6.2: Create ARM64 Dockerfile for backend

- **Description**: Multi-stage Dockerfile for Express + Prisma.
- **Files to create/modify**:
  - `backend/Dockerfile` — multi-stage build
- **Dockerfile structure**:
  ```dockerfile
  # Stage 1: Dependencies
  FROM --platform=linux/arm64 node:20-alpine AS deps
  WORKDIR /app
  COPY package.json package-lock.json ./
  RUN npm ci --only=production
  
  # Stage 2: Build
  FROM --platform=linux/arm64 node:20-alpine AS build
  WORKDIR /app
  COPY --from=deps /app/node_modules ./node_modules
  COPY . .
  RUN npx prisma generate
  RUN npm run build
  
  # Stage 3: Production
  FROM --platform=linux/arm64 node:20-alpine AS runner
  WORKDIR /app
  ENV NODE_ENV=production
  COPY --from=build /app/dist ./dist
  COPY --from=build /app/node_modules ./node_modules
  COPY --from=build /app/prisma ./prisma
  COPY --from=build /app/package.json ./
  EXPOSE 4000
  CMD ["node", "dist/index.js"]
  ```
- **Acceptance criteria**:
  - [ ] `docker build --platform linux/arm64 -t footplay-backend ./backend` succeeds
  - [ ] Image size < 300 MB (includes Prisma engine + node_modules)
  - [ ] Container starts and responds on port 4000
- **Validation**: Build and run locally with `docker run -p 4000:4000 --env-file .env footplay-backend`. Verify health endpoint.

##### Task 6.3: Create Nginx configuration

- **Description**: Production reverse proxy configuration for the stack.
- **Files to create/modify**:
  - `nginx/nginx.conf` — full config
  - `nginx/conf.d/default.conf` — site config
  - `nginx/Dockerfile` — (optional, can use official nginx image with custom conf)
- **Nginx config**:
  ```nginx
  server {
      listen 80;
      server_name footplay.example.com;  # Replace with actual domain
      return 301 https://$server_name$request_uri;
  }
  
  server {
      listen 443 ssl;
      server_name footplay.example.com;
      
      ssl_certificate /etc/letsencrypt/live/footplay.example.com/fullchain.pem;
      ssl_certificate_key /etc/letsencrypt/live/footplay.example.com/privkey.pem;
      
      # Frontend
      location / {
          proxy_pass http://frontend:3000;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
      }
      
      # API
      location /api/ {
          proxy_pass http://backend:4000;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
      }
      
      # Static assets (long cache)
      location /_next/static/ {
          proxy_pass http://frontend:3000;
          expires 365d;
          add_header Cache-Control "public, immutable";
      }
  }
  ```
- **Acceptance criteria**:
  - [ ] Nginx config is syntactically valid: `nginx -t`
  - [ ] Frontend available at `/`
  - [ ] API available at `/api/matches/random`
  - [ ] Static assets have cache headers
  - [ ] HTTP → HTTPS redirect works
- **Validation**: `docker compose up nginx` and test routing.

##### Task 6.4: Create production docker-compose.yml

- **Description**: Production Compose file that wires all services together with environment variables.
- **Files to create/modify**:
  - `docker-compose.yml` (or `docker-compose.prod.yml`) — production stack
- **Service definitions**:
  - `frontend`: build from `./frontend`, ports `3000`, depends on backend (for build order only)
  - `backend`: build from `./backend`, ports `4000`, env vars from `.env`, depends on postgres
  - `postgres`: image `postgres:16-alpine`, volume for data, healthcheck
  - `nginx`: image `nginx:alpine`, ports `80:80` `443:443`, volumes for conf + certs + Let's Encrypt
  - `certbot`: image `certbot/certbot`, volumes for certs, entrypoint for renewal
- **Acceptance criteria**:
  - [ ] `docker compose up -d` starts all services
  - [ ] Frontend accessible at `http://localhost:80`
  - [ ] API accessible at `http://localhost/api/health`
  - [ ] Services restart on failure (restart: unless-stopped)
- **Validation**: `docker compose up -d` on a fresh machine. Test web access.

##### Task 6.5: Create GitHub Actions CI/CD pipeline

- **Description**: Automate build, test, and deploy on push to `main`.
- **Files to create/modify**:
  - `.github/workflows/deploy.yml` — CI/CD workflow
- **Workflow stages**:
  1. **Build**: Checkout, set up Docker Buildx, build ARM64 images
  2. **Test**: Run `npm run lint`
  3. **Deploy**: SSH into Oracle Cloud instance, pull docker-compose, update images, run migrations, restart
- **Secrets required**:
  - `DEPLOY_HOST` — Oracle Cloud instance IP
  - `DEPLOY_USER` — SSH user
  - `DEPLOY_KEY` — SSH private key
  - `DATABASE_URL` — production database URL
- **Workflow structure**:
  ```yaml
  name: Deploy
  on:
    push:
      branches: [main]
  
  jobs:
    build:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - name: Set up Docker Buildx
          uses: docker/setup-buildx-action@v3
        - name: Build frontend
          run: docker build --platform linux/arm64 -t footplay-frontend ./frontend
        - name: Build backend
          run: docker build --platform linux/arm64 -t footplay-backend ./backend
        - name: Lint
          run: npm run lint
    
    deploy:
      needs: build
      runs-on: ubuntu-latest
      steps:
        - name: Deploy via SSH
          uses: appleboy/ssh-action@v1.0.3
          with:
            host: ${{ secrets.DEPLOY_HOST }}
            username: ${{ secrets.DEPLOY_USER }}
            key: ${{ secrets.DEPLOY_KEY }}
            script: |
              cd ~/footplay
              git pull
              docker compose pull
              docker compose up -d --build
              docker image prune -f
  ```
- **Acceptance criteria**:
  - [ ] Workflow appears in GitHub Actions tab
  - [ ] `npm run lint` passes in CI
  - [ ] Docker images build successfully in CI
  - [ ] SSH deploy executes without errors
- **Validation**: Push to main, monitor GitHub Actions run. Verify deployment completes.

##### Task 6.6: Oracle Cloud Free Tier provisioning + SSL setup

- **Description**: Document and execute the Oracle Cloud setup. Scripts for initial provisioning.
- **Files to create/modify**:
  - `scripts/provision-oracle.sh` — setup script
  - `docs/deployment.md` — deployment guide
- **Provisioning steps** (documented, not fully automated):
  1. Create Oracle Cloud Free Tier account
  2. Launch ARM instance (Canonical Ubuntu 22.04 LTS, Ampere A1)
  3. Configure security list (allow ports 22, 80, 443)
  4. SSH into instance
  5. Run `scripts/provision-oracle.sh` which:
     - Installs Docker + Docker Compose
     - Clones the repository
     - Sets up `.env` with secrets
     - Runs `docker compose up -d`
     - Runs certbot for initial SSL certificate
  6. Set up DNS A record pointing to instance IP
  7. Run certbot for SSL
- **Certbot setup**:
  ```bash
  # Initial SSL setup
  docker compose run --rm certbot certonly --webroot \
    --webroot-path=/var/www/html \
    -d footplay.example.com
  
  # Auto-renewal: cron job runs monthly
  0 0 1 * * docker compose run --rm certbot renew && docker compose exec nginx nginx -s reload
  ```
- **Acceptance criteria**:
  - [ ] Server accessible over SSH
  - [ ] Docker and Docker Compose installed and working
  - [ ] Stack starts with `docker compose up -d`
  - [ ] SSL certificate is valid and auto-renews
  - [ ] Public URL resolves and shows the game
- **Validation**: Visit the public URL over HTTPS. Play a full game.

##### Task 6.7: Add health check endpoint to backend

- **Description**: Add a production health check endpoint that reports status, version, and database connectivity.
- **Files to modify**:
  - `backend/src/index.ts` — update `/api/health` route
- **Health check response**:
  ```json
  {
    "status": "ok",
    "version": "1.0.0",
    "timestamp": "2026-07-21T12:00:00Z",
    "database": "connected"
  }
  ```
- **Acceptance criteria**:
  - [ ] `GET /api/health` returns status, version, timestamp
  - [ ] Database connectivity checked (query `SELECT 1`)
  - [ ] CI/CD pipeline pings this endpoint after deployment
- **Validation**: `curl https://footplay.example.com/api/health` returns valid JSON.

#### 2.6.4 Dependencies

- **Dev 1 (Repo Scaffold & Prisma Schema)** — directory structure, package.json, Prisma setup
- **(Implicit) Dev 5 (Wordle Algorithm & Game Loop)** — full app must be working for deployment
- Docker can be developed incrementally alongside Dev 2-5; final hardening is Done checklist

#### 2.6.5 Effort Estimate

**M (3-5 days)**

Breakdown:
- Task 6.1 (Frontend Dockerfile): 0.5 day
- Task 6.2 (Backend Dockerfile): 0.5 day
- Task 6.3 (Nginx config): 0.5 day
- Task 6.4 (Production docker-compose): 0.5 day
- Task 6.5 (GitHub Actions): 0.5 day
- Task 6.6 (Oracle provisioning + SSL): 1 day
- Task 6.7 (Health check): 0.25 day
- Buffer: 0.5 day (ARM64 build issues, DNS propagation, SSL setup)

#### 2.6.6 Risk Factors

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| ARM64 Docker build failures in CI | Medium | High | Test ARM64 build locally with emulation first. Use Docker Buildx with QEMU. Pin base images to arm64-compatible tags. |
| SSL certificate setup complexity | Medium | Medium | Use certbot with webroot method. Document exact steps. Test on staging domain first. |
| Oracle Cloud Free Tier resource limits (4 GB RAM) | Low | Medium | Monitor resource usage. Consider splitting PostgreSQL to external service if needed. |
| DNS propagation delay | Low | Low | Document DNS setup. Use Cloudflare for fast propagation. Test with IP directly first. |
| CI/CD secrets management | Low | Low | Use GitHub Actions secrets. Never commit secrets to repo. |

#### 2.6.7 "Done" Checklist

- [ ] Frontend Dockerfile builds ARM64 image < 200 MB
- [ ] Backend Dockerfile builds ARM64 image < 300 MB
- [ ] Nginx config correctly proxies frontend and API
- [ ] docker-compose.yml starts all services (frontend, backend, postgres, nginx, certbot)
- [ ] `docker compose up` on a fresh machine starts the full stack
- [ ] GitHub Actions workflow builds, lints, and deploys on push to main
- [ ] Oracle Cloud instance provisioned with Docker + Compose
- [ ] SSL certificate valid and auto-renewal configured
- [ ] Public URL accessible over HTTPS
- [ ] `GET /api/health` returns status, version, database connectivity
- [ ] Full game loop works on deployed instance
- [ ] README updated with deployment instructions
- [ ] Repo tagged `v1.0.0`
- [ ] All changes committed to `dev-6/*` branch

---

## 3. Task Contract

```markdown
## Task Contract
- **Branch convention**: Each development is an independent branch with prefix `dev-N/`, where N is the development number (e.g., `dev-1/scaffold`, `dev-5/game-loop`).
- **Do not merge downstream** developments before their dependencies (see Dependency Graph below). Dev 4 can merge to main before Dev 2/3 (it uses mock data), but Dev 5 must wait for both Dev 3 and Dev 4.
- **Run `npm run lint`** before every commit. No lint warnings or errors.
- **Every PR must pass** its development's "Done" checklist (Section 2.N.7 above) before merging.
- **Update README** with key architecture decisions as they are made (tech stack choices, schema decisions, deployment config). Reference relevant decisions from docs/roadmap.md Decision Log.
- **Tag the repo at v1.0.0** when Development 6 completes successfully and the game is live.
- **PR merge strategy**: Squash-merge into `main` with a clean commit message (e.g., "dev-1: Repo scaffold & Prisma schema").
- **Changelog**: Update `CHANGELOG.md` at the end of each development with a one-line summary.
```

---

## 4. Dependency Graph

```
Dev 1 (Repo Scaffold & Prisma Schema)
  July 21 ──────────────────────────────────────────────────────────────┐
  │                                                                      │
  ├── Dev 2 (Data Pipeline) ─── Dev 3 (Core REST API) ──────────────────┤
  │      July 22-26              July 28-31                              │
  │                                                                      │
  └── Dev 4 (Frontend Shell & Layout) ──────────────────────────────────┤
         July 22-25 (parallel with Dev 2/3)                              │
                                                                         │
                                   ┌─────────────────────────────────────┘
                                   │
                              Dev 5 (Wordle Algorithm & Game Loop)
                              August 1-7 (depends on Dev 3 + Dev 4)
                                   │
                                   └── Dev 6 (Docker, CI/CD & Deploy)
                                          August 8-14 (hardens full stack)
                                               ↓
                                          v1.0.0 RELEASE
```

**Parallel execution note**: If resources permit, Dev 6 Docker/CI/CD work can begin during Dev 5 (or even Dev 3-4) since Dockerfiles are independent of game logic. The "Done" checklist for Dev 6 requires the full stack, but individual Dockerfiles can be developed and tested earlier.

---

## 5. Handoff Packet

```markdown
## Handoff Packet

- **Project**: FootPlay — v1.0 Missing Eleven MVP (fully decomposed)
- **Current phase**: Pre-development — all planning complete
- **Next step**: Start Development 1 (Repo Scaffold & Prisma Schema)
- **Responsible agent**: `developer`
- **Key reference documents**:
  - `Project.md` — project overview, full tech stack, architecture, component list
  - `docs/roadmap.md` — product roadmap with milestone scope, decisions, risks
  - `docs/plan-v1.0-decomposition.md` — THIS FILE: detailed implementation plan
  - `research-roadmap.md` — technical research, data schema verification, claims
- **Locked decisions (DO NOT reopen)**:
  1. Game state: Client-side (localStorage) — NO server-side game session endpoints in v1.0
  2. Name matching: display_name column + manual override table
  3. Filters: Deferred from v1.0
  4. Auth/Users: Deferred from v1.0
  5. Formations: 5 common (4-3-3, 4-4-2, 4-2-3-1, 3-5-2, 4-1-4-1)
  6. Data refresh: One-time seed only
  7. v1.0 API: Only GET /api/matches/random, GET /api/matches/:id, GET /api/players?q=
  8. Monorepo tool: npm workspaces
  9. Name display field: Use `name` (full name) as primary, add `display_name` override column
- **Known unknowns to watch during implementation**:
  1. Name cleaning scope (resolved during Dev 2 — budget 2 days, log edge cases)
  2. ARM64 Docker build performance in CI (monitor during Dev 6)
  3. Player search response time with 37k seeded players (test during Dev 3)
  4. Random match query performance with filtered dataset (monitor during Dev 3)
- **Blocking questions**: None — all v1.0 decisions are locked
- **Key decisions already made**:
  - Prisma schema uses internal auto-increment IDs + source IDs for traceability
  - display_name defaults to last_name with manual override approach
  - Position coordinates use percentage-based CSS positioning
  - Wordle algorithm follows classic duplicate-letter rules (correct > present > absent priority)
  - Game state persists via localStorage with debounced writes
```

---

## Appendix A: Effort Summary per Development

| Dev | Name | Effort | Min Days | Max Days |
|-----|------|--------|----------|----------|
| 1 | Repo Scaffold & Prisma Schema | S | 2 | 3 |
| 2 | Data Pipeline | M | 3 | 5 |
| 3 | Core REST API | M | 2 | 4 |
| 4 | Frontend Shell & Layout | S | 2 | 3 |
| 5 | Wordle Algorithm & Game Loop | M | 3 | 5 |
| 6 | Docker, CI/CD & Deploy | M | 3 | 5 |
| **Total** | | | **15** | **25** |

**Estimated calendar duration**: 3-5 weeks (full-time solo). Parallel execution of Dev 2 + Dev 4 can reduce wall-clock time by 2-3 days.

---

## Appendix B: Files Created/Modified per Development

| Dev | New Files | Modified Files |
|-----|-----------|----------------|
| 1 | `package.json` (root), `.eslintrc.json`, `.prettierrc`, `tsconfig.base.json`, `.gitignore`, `.env.example`, `frontend/` (scaffold), `backend/` (scaffold), `backend/prisma/schema.prisma`, `docker-compose.yml` | None |
| 2 | `scripts/package.json`, `scripts/tsconfig.json`, `scripts/src/download-data.ts`, `scripts/src/name-cleaning.ts`, `scripts/src/name-overrides.ts`, `backend/prisma/seed.ts`, `backend/src/services/positionMapping.ts`, `scripts/src/verify-data.ts` | `.gitignore`, `backend/package.json` |
| 3 | `backend/src/middleware/errorHandler.ts`, `backend/src/middleware/logger.ts`, `backend/src/middleware/validate.ts`, `backend/src/routes/matches.ts`, `backend/src/routes/players.ts`, `backend/src/services/matchService.ts`, `backend/src/services/playerService.ts` | `backend/src/index.ts` |
| 4 | `frontend/src/components/Layout.tsx`, `frontend/src/components/Navbar.tsx`, `frontend/src/components/Footer.tsx`, `frontend/src/types/index.ts`, `frontend/src/lib/api.ts`, `frontend/src/lib/mockData.ts`, `frontend/src/components/TacticBoard.tsx`, `frontend/src/components/Shirt.tsx`, `frontend/src/components/MatchInfo.tsx`, `frontend/src/app/missing-eleven/page.tsx` | `frontend/src/app/layout.tsx`, `frontend/src/app/page.tsx`, `frontend/tailwind.config.ts` |
| 5 | `frontend/src/lib/wordle.ts`, `frontend/src/components/WordleModal.tsx`, `frontend/src/lib/gameState.ts`, `frontend/src/components/GameComplete.tsx` | `frontend/src/app/missing-eleven/page.tsx` |
| 6 | `frontend/Dockerfile`, `backend/Dockerfile`, `nginx/nginx.conf`, `nginx/conf.d/default.conf`, `.github/workflows/deploy.yml`, `scripts/provision-oracle.sh`, `docs/deployment.md` | `backend/src/index.ts` (health check), `frontend/next.config.js` (standalone output) |

---

## Appendix C: Key Architecture Decisions (ADRs to Write)

These decisions should be recorded as ADRs in `docs/decisions/` as each development proceeds. They are documented here so the developer can write them alongside implementation.

| Decision | When to Write | Rationale |
|----------|---------------|-----------|
| ADR-001: npm workspaces for monorepo | Dev 1 | Core architectural choice |
| ADR-002: Prisma schema design (internal + source IDs) | Dev 1 | Data model foundation |
| ADR-003: Client-side game state (localStorage) | Dev 1 | Game state decision |
| ADR-004: Name display with display_name override | Dev 2 | Player name strategy |
| ADR-005: Position coordinate mapping | Dev 2 | Tactic board placement |
| ADR-006: REST API design (three endpoints) | Dev 3 | API contract |
| ADR-007: Wordle algorithm duplicate-letter rules | Dev 5 | Game logic |
| ADR-008: ARM64 Docker strategy | Dev 6 | Deployment architecture |
| ADR-009: Oracle Cloud Free Tier deployment | Dev 6 | Hosting decision |
| ADR-010: Nginx reverse proxy + Let's Encrypt SSL | Dev 6 | Production networking |

---

*End of v1.0 decomposition plan. Start with Development 1.*
