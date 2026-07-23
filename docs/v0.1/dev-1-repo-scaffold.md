# Development 1: Repo Scaffold & Prisma Schema

**Status**: `ready for implementation`
**Source**: `docs/v0.1/plan-v1.0-decomposition.md` (Development 1)
**Estimated Effort**: S (2-3 days)

---

## Objective

Create the monorepo foundation that all future development builds upon. By the end of this development, a developer can run `npm install && npm run dev` and see both a Next.js frontend (port 3000) and an Express backend (port 4000) running simultaneously. The Prisma schema defines the five core entities (Player, Club, Competition, Game, Appearance), and the database is accessible via Docker Compose.

---

## Approach

**Monorepo structure**: npm workspaces with three packages:
- `frontend/` — Next.js (App Router) + TypeScript + Tailwind CSS
- `backend/` — Express 4 + TypeScript + Prisma
- `scripts/` — TypeScript scripts for data pipeline (no framework)

**Root `package.json`** orchestrates dev scripts using `concurrently` to run both servers. ESLint and Prettier configs live at the root and extend into each workspace.

**Docker Compose** starts a PostgreSQL 16 container for local development. The backend connects to it via `DATABASE_URL` in `.env`.

**Prisma schema** models the five core entities (Player, Club, Competition, Game, Appearance) directly from the transfermarkt-datasets source CSV columns, with internal auto-increment IDs plus source IDs for traceability.

**Key decisions**:
- **Game-focused schema**: Only fields needed for the Missing Eleven game are modeled. Extra columns from the source CSVs are ignored — they can be added later if the game evolves.
- Entity names match the source CSV files: **Club** (not Team), **Game** (not Match). This avoids translation overhead in the data pipeline.
- `name` on Player stores the full name (`"Cristiano Ronaldo"`). `displayName` is optional for a shorter display variant.
- Lineup info (`type`, `position`, `number`, `isCaptain`) comes from `game_lineups.csv`, not from `appearances.csv`. During Dev 2 both CSVs are joined per player per game to populate the Appearance table.
- Appearance includes optional stat fields (`goals`, `assists`, `redCards`) for potential in-game hints, but they are not required for the core game mechanic.
- Every model has both an auto-increment `id` (internal) and a unique source ID (`playerId`, `clubId`, `gameId`, `competitionId`) for traceability to the original dataset.

---

## Detailed Tasks

### Task 1.1: Initialize monorepo structure

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

### Task 1.2: Scaffold Next.js frontend

- **Description**: Create `frontend/` with Next.js, App Router, TypeScript, Tailwind CSS. Add a minimal home page that renders a "FootPlay" heading.
- **Files to create/modify**:
  - `frontend/package.json` — next, react, react-dom, typescript, tailwindcss, postcss, autoprefixer
  - `frontend/tsconfig.json` — extends `../tsconfig.base.json`, jsx: preserve, paths alias
  - `frontend/next.config.js` or `next.config.mjs` — minimal config
  - `frontend/tailwind.config.ts` — content paths, theme extension
  - `frontend/postcss.config.js` — tailwind + autoprefixer
  - `frontend/src/app/globals.css` — Tailwind directives
  - `frontend/src/app/layout.tsx` — root layout with html/lang, metadata
  - `frontend/src/app/page.tsx` — simple home page rendering "FootPlay"
- **Acceptance criteria**:
  - [ ] `npm run dev` from `frontend/` starts on port 3000
  - [ ] Home page renders without errors
  - [ ] Tailwind classes work (test with `text-3xl font-bold`)
  - [ ] TypeScript compiles without errors
- **Validation**: `npm run build` in `frontend/` produces a production build with no errors.

### Task 1.3: Scaffold Express 4 backend

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

### Task 1.4: Configure root dev scripts

- **Description**: Wire root `package.json` scripts so `npm run dev` starts both frontend and backend concurrently.
- **Files to modify**:
  - `package.json` (root) — add `concurrently` dependency, wire `dev` script
- **Acceptance criteria**:
  - [ ] `npm run dev` from root starts frontend (port 3000) and backend (port 4000)
  - [ ] Stopping the process stops both servers
- **Validation**: Run `npm run dev`, verify both ports respond, Ctrl+C stops both.

### Task 1.5: Create Prisma schema (five entities)

- **Description**: Define the Prisma schema with Player, Club, Competition, Game, and Appearance models. Only fields relevant to the Missing Eleven game are included. Create initial migration.
- **Files to create/modify**:
  - `backend/prisma/schema.prisma` — datasource postgresql, generator client, five models
  - `backend/prisma/migrations/` — initial migration via `npx prisma migrate dev`
- **Prisma schema** (game-focused, trimmed from source CSVs):

  **Competition**: Lookup table for league/tournament names.
  - `id` (autoincrement), `competitionId` (unique, e.g. "GB1"), `name` (e.g. "Premier League")
  - Relations: `games Game[]`

  **Club**: Team participating in matches.
  - `id` (autoincrement), `clubId` (unique, from CSV), `name`

  **Player**: Player profiles.
  - `id` (autoincrement), `playerId` (unique, from CSV), `name`, `displayName?`, `position?`, `subPosition?`
  - Relations: `appearances Appearance[]`

  **Game**: A single match between two clubs in a competition.
  - `id` (autoincrement), `gameId` (unique, from CSV), `competitionId`, `season?`, `round?`, `date?`, `homeClubId`, `awayClubId`, `homeClubGoals?`, `awayClubGoals?`, `homeClubFormation?` (e.g. "4-3-3"), `awayClubFormation?`, `stadium?`
  - Relations: `competition Competition` (via `competitionId`), `appearances Appearance[]`
  - Index: `@@index([competitionId])`

  **Appearance**: One row per player per game — the lineup + stats.
  - `id` (autoincrement), `gameId`, `playerId`, `number?`, `type` ("starting_lineup" \| "substitutes"), `position?`, `isCaptain?`, `goals` (default 0), `assists` (default 0), `redCards` (default 0)
  - Relations: `game Game` (via `gameId`), `player Player` (via `playerId`)
  - Unique: `@@unique([gameId, playerId])`
  - Index: `@@index([gameId])`

- **Source CSV mapping**:

  | Model | Source CSV | Key columns used |
  |-------|-----------|-----------------|
  | Competition | `competitions.csv` | competition_id, name |
  | Club | `clubs.csv` | club_id, name |
  | Player | `players.csv` | player_id, name, position, sub_position |
  | Game | `games.csv` | game_id, competition_id, season, round, date, home_club_id, away_club_id, home_club_goals, away_club_goals, home_club_formation, away_club_formation, stadium |
  | Appearance | `game_lineups.csv` + `appearances.csv` | game_id, player_id, type, position, number, team_captain, goals, assists, red_cards |

  **Note**: Appearance is populated by joining `game_lineups.csv` (lineup data: type, position, number, team_captain) and `appearances.csv` (stats: goals, assists, red_cards) on `game_id` + `player_id` during Dev 2.

- **Acceptance criteria**:
  - [ ] `npx prisma validate` passes with no errors
  - [ ] `npx prisma migrate dev --name init` creates migration and applies it to local PostgreSQL
  - [ ] `npx prisma generate` produces the client
  - [ ] Prisma client can be imported in backend code
- **Validation**: Run `npx prisma studio` and verify all five tables appear with correct columns.

### Task 1.6: Add Docker Compose for PostgreSQL

- **Description**: Create `docker-compose.yml` at root that starts PostgreSQL 16 for local development.
- **Files to create/modify**:
  - `docker-compose.yml` — postgres service (port 5432, volume for data persistence)
  - `.env.example` — update with PostgreSQL connection string
- **Docker Compose**:
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

### Task 1.7: Add root-level linting and formatting scripts

- **Description**: Wire `npm run lint` to run ESLint across all workspaces. Wire `npm run format` to run Prettier.
- **Files to modify**:
  - `package.json` (root) — add `lint` and `format` scripts
- **Acceptance criteria**:
  - [ ] `npm run lint` runs without errors on the current codebase
  - [ ] `npm run format` formats all supported files
- **Validation**: Introduce a deliberate formatting error, run `npm run format`, verify it's fixed.

---

## Dependencies

None. This is the foundation.

---

## Effort Estimate

**S (2-3 days)**

| Task | Estimate |
|------|----------|
| Task 1.1 (monorepo init) | 0.5 day |
| Task 1.2 (Next.js scaffold) | 0.5 day |
| Task 1.3 (Express scaffold) | 0.5 day |
| Task 1.4 (dev scripts) | 0.25 day |
| Task 1.5 (Prisma schema) | 0.5 day |
| Task 1.6 (Docker Compose) | 0.25 day |
| Task 1.7 (linting) | 0.25 day |
| Buffer | 0.25 day |

---

## Risk Factors

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| npm workspaces dependency resolution conflicts | Low | Medium | Use exact versions in initial install. Test `npm install` on clean clone. |
| Prisma schema misalignment with transfermarkt-datasets | Low | Medium | Schema designed from verified source CSV columns. Validate during Dev 2 seeding. |
| PostgreSQL Docker port conflict (5432 already in use) | Low | Low | Document port change procedure in README. |

---

## "Done" Checklist

- [ ] `npm install && npm run dev` starts frontend (:3000) and backend (:4000) with no errors
- [ ] `curl http://localhost:4000/api/health` returns `{ "status": "ok" }`
- [ ] `npx prisma validate` passes
- [ ] `npx prisma migrate dev` creates all 5 tables (Player, Club, Competition, Game, Appearance) in local PostgreSQL
- [ ] `npm run lint` passes with zero warnings
- [ ] `.gitignore` covers node_modules, .next, dist, .env, .prisma
- [ ] `.env.example` documents all required variables
- [ ] `docker compose up -d` starts PostgreSQL, backend connects to it
- [ ] All changes committed to `dev-1/*` branch
