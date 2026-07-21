# FootPlay — Product Roadmap

**Status**: `active`
**Last updated**: 2026-07-21
**Source research**: `research-roadmap.md`

---

## Table of Contents

1. [Versioning Scheme](#1-versioning-scheme)
2. [Milestone Map](#2-milestone-map)
3. [Dependency Graph](#3-dependency-graph)
4. [Parallel Track Options](#4-parallel-track-options)
5. [Decision Log Per Milestone](#5-decision-log-per-milestone)
6. [Risk Register](#6-risk-register)
7. [Release Criteria](#7-release-criteria)
8. [Task Contract](#8-task-contract)
9. [Handoff Packet](#9-handoff-packet)

---

## 1. Versioning Scheme

FootPlay follows **SemVer 2.0.0** with the following mapping:

| Bump | Trigger | Examples |
|------|---------|---------|
| **Major** | New game added, platform-identity change, breaking API change for consumers | Adding Guess the Formation (v1.x → 2.0.0), adding Kit Quiz (v2.x → 3.0.0) |
| **Minor** | New platform feature, new shared capability, new game-independent feature | Auth/user system (v1.0.x → 1.2.0), filters & difficulty (v1.2.x → 1.3.0) |
| **Patch** | Bugfix, performance, infrastructure hardening, dependency update | Testing setup (v1.0.0 → 1.0.1), logging/backup improvements |

**Rationale**: Major bumps signal "the platform has grown" to users and stakeholders. Minor bumps add user-visible features without changing the game set. Patches are invisible to users but improve quality.

**Tag format**: `git tag vX.Y.Z`

---

## 2. Milestone Map

### v1.0 — Missing Eleven MVP

| Field | Value |
|-------|-------|
| **Version** | `1.0.0` |
| **Theme** | "One game, working, public" |
| **Goal** | Single playable game deployed to a public URL |
| **Duration** | 3–5 weeks (full-time solo) |
| **Branch prefix** | `v1.0/*` |

#### In Scope

- Project scaffolding: Next.js + Express + Prisma + TypeScript + Tailwind CSS monorepo (npm workspaces)
- Docker Compose setup: frontend, backend, PostgreSQL, Nginx reverse proxy (ARM64-compatible)
- GitHub Actions CI/CD: push-to-main triggers build + SSH deploy to Oracle Cloud Free Tier
- Nginx config with Let's Encrypt SSL (certbot auto-renewal)
- Prisma schema: Player, Team (Club), Match, Appearance (GameLineup)
- Data pipeline: download transfermarkt-datasets CSVs → parse → clean names → seed PostgreSQL (one-time seed for v1.0)
- Core REST API: `GET /api/matches/random`, `GET /api/matches/:id`, `GET /api/players?q=`, `POST /api/games`, `PUT /api/games/:id/guess`
- Missing Eleven game frontend: TacticBoard, Shirt, WordleModal, MatchInfo, GameComplete components
- Wordle-style letter feedback algorithm (green/orange/grey per player guess)
- Game state machine with localStorage persistence
- Client-side player name guessing with autocomplete (server-side debounced search)
- Shared layout: Navbar + Footer + Layout wrapper
- Responsive CSS (desktop-first, mobile-friendly)
- **Normal difficulty only** (6 attempts, no hints)
- All 11 shirts guessable per match, game ends correctly when all guessed or all failed
- Deployed to Oracle Cloud Free Tier with public URL

#### Explicitly Out of Scope

- Auth/user accounts (v1.2)
- Filters (team, league, era, nation) — v1.3
- Difficulty modes (Easy, Hard) — v1.3
- Name override table/UI — v1.2
- Second game — v2.0
- Testing infrastructure — v1.1
- Error logging/monitoring — v1.1
- Database backups — v1.1
- Data refresh pipeline — v1.1
- Kit colors or team-specific styling (all shirts use default color)
- Animations, transitions, or visual polish beyond functional gameplay

#### Key Deliverables

1. Working monorepo with `npm run dev` running frontend (:3000) and backend (:4000)
2. Seeded PostgreSQL database with 79k+ matches and 37k+ players
3. Playable Missing Eleven game at `/missing-eleven`
4. Docker Compose stack that runs all services
5. GitHub Actions pipeline that deploys to Oracle Cloud
6. Public URL where anyone can play

#### Acceptance Criteria for Milestone Sign-off

- [ ] `npm install && npm run dev` starts both frontend and backend locally
- [ ] `GET /api/matches/random` returns a valid match with full lineup
- [ ] `GET /api/players?q=ron` returns 10+ player results within 300ms
- [ ] Game loads at `/missing-eleven`, shows tactic board with 11 shirts
- [ ] Clicking a shirt opens WordleModal with keyboard input
- [ ] Wordle feedback renders green/orange/grey correctly for each guess
- [ ] Correctly guessed shirt shows full player name below it
- [ ] After 6 failed attempts, correct name shown in red
- [ ] Game ends when all 11 shirts are correct or any shirt fails → GameComplete screen
- [ ] Game state persists across page refresh (localStorage)
- [ ] `docker compose up` starts all services on fresh machine
- [ ] Public URL accessible over HTTPS with valid SSL certificate
- [ ] All 11 shirts are guessable (no data gaps in returned lineup)

#### Risk Factors Specific to v1.0

- **Name matching ambiguity** — multiple players share last names; display_name + manual override table needed. Test with real data during pipeline development.
- **ARM64 compatibility** — Docker images must use ARM-compatible tags. Test with `--platform linux/arm64` emulation before deployment.
- **Random match quality** — 79k matches may include incomplete lineups. Must filter for matches where all 11 starting lineup players exist in the database.
- **Player autocomplete performance** — 37k-player search must respond within 300ms. Debounced server-side search is the approach; test with seeded data.

---

### v1.1 — Infrastructure & Quality

| Field | Value |
|-------|-------|
| **Version** | `1.1.0` |
| **Theme** | "Solid foundation" |
| **Goal** | Production hardening before adding complexity |
| **Duration** | 1–2 weeks |
| **Branch prefix** | `v1.1/*` |
| **Parallelizable** | Yes — can start as soon as v1.0 scaffold exists |

#### In Scope

- Testing infrastructure: Vitest for backend unit tests, React Testing Library for frontend component tests, Playwright for E2E critical paths
- Error handling middleware: structured error responses across all API endpoints
- Server-side request logging (morgan or pino)
- Environment config validation (Zod schema for .env vars)
- Database backup automation: cron-based `pg_dump` + Oracle block volume snapshot script
- Data refresh pipeline design (incremental CSV re-import with stable references — do not cascade deletes)
- Monitoring setup: uptime check, Sentry free tier for error tracking (optional)

#### Out of Scope

- Any game changes or new features
- Auth or user features
- Filters or difficulty
- Performance optimization beyond what's needed for stability

#### Acceptance Criteria for Milestone Sign-off

- [ ] Backend unit tests cover 80%+ of game logic (Wordle algorithm, match selection)
- [ ] `npm test` runs all tests with zero failures
- [ ] Error middleware returns consistent JSON shape `{ error: string, code: string }`
- [ ] Logs include timestamp, method, path, status code, duration
- [ ] Missing/invalid env vars cause startup to fail with clear message
- [ ] `pg_dump` cron job exists and produces valid SQL dump
- [ ] Backup restore procedure documented

> **Note**: v1.1 can be merged into v1.0 if the developer prefers to build testing alongside the game. The decision to ship as 1.1.0 or bundle into 1.0.0 is at the developer's discretion.

---

### v1.2 — User Features

| Field | Value |
|-------|-------|
| **Version** | `1.2.0` |
| **Theme** | "Your progress, your way" |
| **Goal** | Retention mechanics — user accounts, stats, personal progress |
| **Duration** | 2–3 weeks |
| **Branch prefix** | `v1.2/*` |

#### In Scope

- Auth system: `POST /api/auth/register`, `POST /api/auth/login`, JWT-based auth middleware
- Prisma schema additions: User model + UserStats model
- User registration and login flows (frontend pages)
- JWT storage in httpOnly cookie (secure, XSS-protected)
- Anonymous play allowed — prompt to create account after game completion to save progress
- Password hashing with bcrypt
- User stats tracking: games played, games won, current streak, best streak (tracked per game type)
- Profile page at `/profile` with stats display
- Name display override table: seed table for player name variations/corrections (admin seed script, no admin UI)

#### Out of Scope

- Social features (friends, leaderboards, sharing)
- Email verification or password reset
- OAuth (Google, Apple login)
- Admin dashboard
- Email notifications

#### Acceptance Criteria for Milestone Sign-off

- [ ] New user can register with email + password at `/register`
- [ ] Registered user can log in at `/login`
- [ ] Logged-in user's stats persist across sessions
- [ ] Anonymous player can play without login; prompted to create account after game ends
- [ ] Profile page at `/profile` shows: games played, games won, current streak, best streak
- [ ] Streaks track across multiple game sessions within same day
- [ ] Name override table corrects at least 5 known ambiguous names (seeded)
- [ ] Logout clears session

#### Risk Factors Specific to v1.2

- **JWT security** — httpOnly cookies require CSRF consideration if the API and frontend are on different origins. Since both are served through the same Nginx proxy, this risk is minimal.
- **Anonymous-to-auth migration** — need to handle the case where an anonymous player has a game in progress and then logs in. Decision: prompt to save only after game completion, not mid-game.

---

### v1.3 — Filters & Difficulty

| Field | Value |
|-------|-------|
| **Version** | `1.3.0` |
| **Theme** | "Your game, your rules" |
| **Goal** | Player agency over match selection and difficulty |
| **Duration** | 1–2 weeks |
| **Branch prefix** | `v1.3/*` |

#### In Scope

- Backend filter query parameters on `/api/matches/random`: `?team=`, `?league=`, `?era=`, `?nation=`
- Backend filter combination logic (e.g., `?league=PL&era=2010-2020`)
- Frontend `FilterPanel` component: dropdown/checkbox UI for filters
- Difficulty system: Easy (unlimited attempts + letter hint every 3 wrong guesses), Normal (6 attempts, no hints), Hard (4 attempts, no hints)
- Backend game session creation respects difficulty mode
- Frontend difficulty selector (dropdown/toggle at game start)

#### Out of Scope

- Saved filter preferences per user (deferred to v1.3.x if needed)
- Saved difficulty preference per user (deferred)
- Per-game difficulty customization (all games share same difficulty setting for now)
- Filter presets or "favorites"

#### Acceptance Criteria for Milestone Sign-off

- [ ] `GET /api/matches/random?team=15` returns a match involving club ID 15
- [ ] `GET /api/matches/random?league=GB1&era=2020-2025` returns a Premier League match from 2020-2025
- [ ] Multiple filters combined return correct intersection
- [ ] `FilterPanel` component renders filter form and updates game state
- [ ] Player can select difficulty before starting a game
- [ ] Easy mode: unlimited attempts per player, hint appears after 3 wrong guesses
- [ ] Normal mode: 6 attempts per player (existing behavior)
- [ ] Hard mode: 4 attempts per player
- [ ] Difficulty affects game session creation (stored in game state)

#### Risk Factors Specific to v1.3

- **Filter performance** — querying 79k matches with multiple filter joins must remain fast. Ensure indexes on `competition_id`, `date`, `home_club_id`, `away_club_id`. Monitor query performance with seeded data.
- **Combinatorial edge cases** — some filter combinations may return zero matches. Graceful fallback to "no matches found" with suggestion to relax filters.

---

### v2.0 — Guess the Formation

| Field | Value |
|-------|-------|
| **Version** | `2.0.0` |
| **Theme** | "Two games" |
| **Goal** | Validate multi-game architecture with a second game |
| **Duration** | ~1 week |
| **Branch prefix** | `v2.0/*` |

#### Why This Justifies a Major Version Bump

Adding a second game changes the product identity from "a game" (single-purpose app) to "a platform" (multi-game hub). The architecture must support:
- Multiple game types, each with its own route
- Shared vs game-specific components
- A game hub landing page (`/`) that lists available games
- Stats tracking per game type (if v1.2 shipped)
- A uniform game session lifecycle

This is a product-identity boundary, not just a feature addition.

#### In Scope

- Guess the Formation game at `/guess-the-formation`
- `FormationSelector` component: clickable grid of 3–9 formation buttons (4-3-3, 4-4-2, 4-2-3-1, 3-5-2, 4-1-4-1)
- `FormationHint` component: position-by-position reveal system
- Game logic: formation string comparison (normalize variant names like "4-4-2 diamond")
- **No new API endpoints** — reuses `GET /api/matches/:id` (formation string already in response)
- Shared `MatchInfo` and `GameComplete` components (same as Missing Eleven)
- Game hub landing page at `/` showing both games with descriptions
- Navbar updated to show both games
- Stats tracking integration (if v1.2 shipped, stats track Formation games separately)

#### Out of Scope

- Formation position animation on the tactic board
- Historical formation trends or stats
- Difficulty modes for formation game (deferred to v1.3 integration)
- Squad number guessing alongside formation

#### Acceptance Criteria for Milestone Sign-off

- [ ] `/guess-the-formation` loads a match with formation data
- [ ] Player can select a formation from 5 options
- [ ] Correct formation → win screen; incorrect → retry or reveal
- [ ] Position-by-position hint reveals individual player positions
- [ ] Game hub at `/` shows both "Missing Eleven" and "Guess the Formation"
- [ ] Navbar has links to both games
- [ ] If v1.2 shipped: stats track Formation games separately

---

### v2.1 — Transfer Links

| Field | Value |
|-------|-------|
| **Version** | `2.1.0` |
| **Theme** | "Chain puzzle" |
| **Goal** | Add the most architecturally distinct game |
| **Duration** | 2–3 weeks |
| **Branch prefix** | `v2.1/*` |

#### In Scope

- Transfer Links game at `/transfer-links`
- Backend graph traversal service: BFS-based shortest path with minimum length filter (prefer chains of 3–5 steps)
- `GET /api/games/transfer-links/random` — generates a chain puzzle (player A → ... → player B)
- `GET /api/players/:id/transfers` — returns a player's transfer history
- `POST /api/games/transfer-links/:id/guess` — submit a guess in the chain
- Frontend `TransferChainBracket` component: visual chain with arrows between club crests
- `ChainNode` component: club crest + player name display
- `ChainGuessInput` component: player search with autocomplete
- Chain generation strategy: BFS with minimum length filter + curated seed chains for classic connections
- Shared `GameComplete` component

#### Out of Scope

- Weighted graph or shortest-path prioritization by fee/season
- Interactive transfer timeline visualization
- Club-level chain guessing (player-to-player only)
- "Infinite mode" or endless chains

#### Acceptance Criteria for Milestone Sign-off

- [ ] `/transfer-links` loads a chain puzzle with start and target players
- [ ] Player can guess intermediate players in the chain
- [ ] Chain validation correctly accepts/rejects guesses
- [ ] Minimum chain length of 3 steps (excluding start/target)
- [ ] No trivial chains (e.g., direct transfer between start and target)
- [ ] Visual chain display updates as guesses are submitted
- [ ] Game ends when full chain is completed or attempts exhausted

#### Risk Factors Specific to v2.1

- **Chain quality risk (High probability, Medium impact)**: Random BFS chains may be boring or too short. Mitigation: minimum length filter + curated seed chains. Test against real 87k-transfer data before shipping.
- **Graph traversal performance (Medium probability, Medium impact)**: BFS on 87k transfers is fast in memory, but must be tuned. Implement in-memory graph on server start with periodic refresh.
- **Chain solvability**: Some player pairs may have no connection. Fallback: regenerate until a valid chain of minimum length is found.

---

### v2.2 — Career Path

| Field | Value |
|-------|-------|
| **Version** | `2.2.0` |
| **Theme** | "Progressive reveal" |
| **Goal** | Add a career guessing game using transfer data |
| **Duration** | ~2 weeks |
| **Branch prefix** | `v2.2/*` |

#### In Scope

- Career Path game at `/career-path`
- Backend: `GET /api/games/career-path/random` — generates a career path puzzle for a random player
- Backend: `GET /api/players/:id/career` — returns full career timeline
- Backend: `POST /api/games/career-path/:id/guess` — submit player name guess
- Frontend `CareerTimeline` component: progressive reveal of clubs/years (one step at a time)
- `CareerClueReveal` component: staged clue system (year ranges, clubs, positions)
- `CareerGuessInput` component: player name guessing with autocomplete
- Progressive reveal logic: clue difficulty curve (obscure early clubs first, famous clubs later)
- Shared `GameComplete` component

#### Out of Scope

- Player appearance/goals stats alongside career steps
- Timeline visualization with club crests
- Difficulty modes for career path
- Player nationality or position clues (name-only guessing)

#### Acceptance Criteria for Milestone Sign-off

- [ ] `/career-path` loads a career puzzle from a random player
- [ ] First clue reveals earliest club + year range
- [ ] Each subsequent clue reveals next career step
- [ ] Player can submit a name guess at any time
- [ ] Correct guess ends game; incorrect guess reveals next clue
- [ ] Clues progress from less informative to more informative
- [ ] Game ends when player is identified or all clues exhausted

#### Risk Factors Specific to v2.2

- **Too easy/too hard balance** — career clues may immediately identify famous players. Need difficulty tuning: filter by career length (minimum 3 clubs) and avoid currently famous players for harder puzzles.
- **Transfer data completeness** — some players have sparse transfer histories (youth academy → one club → retired). Filter players with at least 3 transfer events.

---

### v3.0 — Kit Quiz + Monetization

| Field | Value |
|-------|-------|
| **Version** | `3.0.0` |
| **Theme** | "Kit Quiz + platform sustainability" |
| **Goal** | Add the most visually distinct game. Begin monetization. |
| **Duration** | 3–4 weeks (high uncertainty — depends on data sourcing) |
| **Branch prefix** | `v3.0/*` |

#### In Scope

- Kit Quiz game at `/kit-quiz`
- Game logic: show a kit image, player identifies the club/season from multiple choice options
- Frontend `KitImage` component: image display with loading/error states
- `KitOptionGrid` component: multiple choice option buttons
- `KitReveal` component: answer display with fun fact
- Ad integration: non-intrusive ad placement (banner or interstitial between games)
- Ad-free experience for logged-in users (optional, pending ad provider terms)
- **Requires Kit Quiz data sourcing to be resolved first** — see Decision Log

#### Out of Scope

- Video ads or auto-playing ads
- Premium subscription tier
- Affiliate links or sponsored content
- User-submitted kit designs

#### Pre-requisites (Must Be Resolved Before v3.0 Starts)

- [ ] Kit image data source selected and verified (Wikipedia Commons / third-party API / manual assets)
- [ ] Licensing terms confirmed for free web use
- [ ] Storage strategy: CDN or served from Oracle Cloud storage bucket
- [ ] Fallback plan: text-only kit quiz if image sourcing fails

#### Acceptance Criteria for Milestone Sign-off

- [ ] `/kit-quiz` displays a kit image (or text description if text-only fallback)
- [ ] Player selects from 4 multiple-choice options (club name + season)
- [ ] Correct selection → win; incorrect → show correct answer
- [ ] New kit puzzle can be generated on completion
- [ ] Ads display on game pages (non-intrusive placement)
- [ ] Ad-free experience for logged-in users (if implemented)
- [ ] Kit Quiz stats tracked alongside other games (if v1.2 shipped)

#### Risk Factors Specific to v3.0

- **External data dependency (High probability, High impact)**: Kit images are NOT in transfermarkt-datasets. This is the highest-risk game in the roadmap.
- **Licensing/copyright (Medium probability, High impact)**: Club kits are trademarked. Displaying them may require rights clearance. Wikipedia Commons images are typically free-use but must be verified per image.
- **Storage costs (Low probability, Medium impact)**: Kit images at scale require storage and bandwidth. Oracle Cloud Free Tier has 10 TB/mo bandwidth — sufficient for low-traffic use.

---

## 3. Dependency Graph

### Critical Path

```
v1.0: Scaffold ──► Data Pipeline ──► Core API ──► Frontend Game ──► Docker/Deploy
        │               │               │               │
        └─────── CI/CD ─┴── Docker ─────┘               │
                                                         │
                         Everything depends on v1.0 ═════╝
```

### Full Dependency Map

```
v1.0 (Missing Eleven MVP)
  ├── Blocks: v1.1 (can start after scaffold)
  ├── Blocks: v1.2 (needs core API + game working)
  │     ├── Blocks: v1.3 (needs core API + auth optional)
  │     └── Blocks: v2.0 (needs core API for match data)
  ├── Blocks: v2.1 (needs core API + data pipeline with transfers)
  └── Blocks: v2.2 (needs core API + data pipeline with transfers)
        └── Blocks: v3.0 (needs all games + kit data sourcing)
```

### Shared vs Game-Specific Dependencies

```
SHARED (blocks everything)           GAME-SPECIFIC (can build in parallel)
══════════════════════════           ═══════════════════════════════════════
Project scaffolding                  Missing Eleven game components (v1.0)
Prisma schema + migrations           Guess the Formation (v2.0)
Data pipeline (CSV → DB)            Transfer Links (v2.1)
Core REST API                        Career Path (v2.2)
Layout/Navbar/Footer                 Kit Quiz (v3.0)
Auth system (v1.2)
User stats (v1.2)
Filter support (v1.3)
Docker + Nginx + SSL
CI/CD pipeline
```

### Strict Blockers

| Item | Blocked By | Reason |
|------|-----------|--------|
| Any game | v1.0 scaffold + Prisma + data pipeline | No game can exist without data |
| Second game | v1.0 core API (match endpoints) | Game needs match data to display |
| User stats per game | v1.2 auth system | Stats require user identity |
| Cross-game stats dashboard | v1.2 auth + all games | Dashboard needs all games collecting stats |
| Difficulty modes | v1.3 backend filter support | Difficulty changes query and game logic |
| Kit Quiz | v3.0 data sourcing decision | No kit images available in dataset |
| Monetization | Platform must have traffic + game content | Ads need audience first |

---

## 4. Parallel Track Options

If two developers work simultaneously, the work splits naturally because game-specific code and shared infrastructure can be developed independently.

### Recommended Dual-Track Split

```
Week    Track A                           Track B
────    ───────                           ───────
1-2     v1.0 Scaffold + CI/CD             (waiting for scaffold)
3-5     v1.0 Data Pipeline + API + Game   v1.1 Infrastructure (tests, logging, backup)
6-7     v1.2 Auth + User Stats             v2.0 Guess the Formation
8       v1.3 Filters + Difficulty          (sync point: both complete)
9-12    v2.1 Transfer Links                v2.2 Career Path
13-15   v3.0 Kit Quiz + Ads               (waiting for v2.1/v2.2 merge)
```

### Constraints for Parallel Work

- **Track B cannot start before Week 3** (needs v1.0 scaffold + Prisma schema)
- **v2.0 (Track B) blocks on core API** — needs `GET /api/matches/:id` to exist
- **v1.2 (Track A) does NOT block v2.0 (Track B)** — auth is independent of game content
- **v1.3 (Track A) does NOT block v2.0 (Track B)** — filters are independent of new games
- **v2.1 and v2.2 (both tracks) each block on data pipeline having `transfers` table seeded**
- **Merge point after Week 8**: both tracks converge and release as v2.0
- After merge, continue with Track A → v2.1, Track B → v2.2 (or vice versa)

### Single-Developer Sequence

If one developer works alone:

```
v1.0 ───► v1.1 ───► v1.2 ───► v1.3 ───► v2.0 ───► v2.1 ───► v2.2 ───► v3.0
3-5w      1-2w      2-3w      1-2w       1w        2-3w      2w        3-4w
                                                                    Total: ~16-20 weeks
```

If v1.1 is bundled into v1.0: subtract 1-2 weeks → **~15-18 weeks total**.

---

## 5. Decision Log Per Milestone

### Decisions Required Before v1.0

| # | Decision | Status | Choice | Rationale |
|---|----------|--------|--------|-----------|
| D1 | Monorepo tool | **Open** | npm workspaces (recommended) | Simplest option for 2-package monorepo. Turborepo/Nx are overkill at this scale. |
| D2 | Player name matching field | **Closed** | `display_name` column + manual override table | MVP spec decision. Do not reopen. |
| D3 | Player autocomplete source | **Closed** | Server-side debounced search | MVP spec decision. `GET /api/players?q=`. |
| D4 | Game session persistence | **Closed** | localStorage | MVP spec decision. Do not reopen. |
| D5 | Formations to support | **Closed** | 5 common: 4-3-3, 4-4-2, 4-2-3-1, 3-5-2, 4-1-4-1 | MVP spec decision. Do not reopen. |
| D6 | Data refresh strategy | **Closed** | One-time seed only for MVP | MVP spec decision. Do not reopen. |
| D7 | Filter/Auth deferral | **Closed** | Deferred from v1.0 | MVP spec decision. Do not reopen. |
| D8 | Name display derivation | **Open** | Use `name` field (full name) as primary, `last_name` as fallback, `display_name` override table for known shortening rules | Must be decided before data pipeline. See research Section 7. |

### Decisions Required Before v1.2

| # | Decision | Status | Choice | Rationale |
|---|----------|--------|--------|-----------|
| D9 | JWT storage method | **Open** | httpOnly cookie | More secure (XSS-protected). Both API and frontend served through same Nginx proxy, so CSRF risk is minimal. |
| D10 | Anonymous play support | **Open** | Allow anonymous + prompt to save | Maximizes adoption funnel. Login required before play would reduce conversion. |
| D11 | Password hashing | **Open** | bcrypt | Simpler, well-supported, sufficient for this project. argon2 is more modern but adds complexity. |
| D12 | Anonymous-to-auth migration | **Open** | Prompt to save only after game completion | Mid-game login adds complexity. Keep it simple: save anonymous data as a session, link to account on creation. |

### Decisions Required Before v2.1 / v2.2

| # | Decision | Status | Choice | Rationale |
|---|----------|--------|--------|-----------|
| D13 | Chain generation strategy | **Open** | BFS with minimum length filter + curated seed chains | Multi-strategy approach gives best puzzle quality. BFS alone produces trivial chains. |
| D14 | Transfer links guess format | **Open** | Player-to-player | Club info shown as clues, but guesses are player names. Simpler UX than club-to-club. |
| D15 | Career path clue difficulty | **Open** | Obscure-to-famous progression | Early clues are less informative (smaller clubs, early years). Later clues reveal famous clubs. |
| D16 | Minimum career length for puzzles | **Open** | Minimum 3 clubs in transfer history | Ensures enough clues for interesting gameplay. Filter players with few transfers. |

### Decisions Required Before v3.0

| # | Decision | Status | Choice | Rationale |
|---|----------|--------|--------|-----------|
| D17 | Kit image source | **Blocking** | **UNRESOLVED** — must be decided before v3.0 starts | Highest-risk decision. Evaluate: Wikipedia Commons (free), third-party sports API (check licensing cost), manual asset creation (labor-intensive), text-only fallback (no images). |
| D18 | Kit Quiz game format | **Open** | Multiple choice (4 options) | Simplest format. Open-ended text input for kit identification would be too ambiguous. |
| D19 | Ad provider | **Open** | Carbon Ads / EthicalAds / Google AdSense | Must be non-intrusive. Carbon Ads is developer-friendly but may not be football-relevant. Research when approaching v3.0. |

### Decision Log Legend

- **Closed**: Decision made in MVP spec. Do not reopen.
- **Open**: Decision needed before milestone starts.
- **Blocking**: Milestone cannot start until this is resolved.

---

## 6. Risk Register

### Per-Milestone Risk Table

| ID | Milestone | Risk | Probability | Impact | Mitigation |
|----|-----------|------|------------|--------|------------|
| R01 | v1.0 | ARM64 Docker compatibility surprises | Medium | High | Pin Docker images to ARM-compatible tags. Test with `--platform linux/arm64` emulation locally. |
| R02 | v1.0 | Name matching ambiguity (shared last names) | High | Medium | `display_name` + manual override table (spec decision). Test with real data. Seed at least 50 known edge cases. |
| R03 | v1.0 | Random match returns incomplete lineup | Medium | High | SQL query must filter for matches where all 11 starting lineup players exist. Add validation query in data pipeline. |
| R04 | v1.0 | Player autocomplete performance too slow | Medium | Medium | Server-side debounced search. Test response time with 37k seeded players. Add index on `name` column. |
| R05 | v1.0 | Data pipeline name cleaning scope larger than expected | Medium | Medium | The biggest estimation risk. Budget 3 days for name cleaning + override table seeding. |
| R06 | v1.0 | Oracle Cloud Free Tier ARM Docker build slow in CI | Medium | Medium | Use Docker buildx + caching. Consider GitHub Actions ARM runner. |
| R07 | v1.0 | transfermarkt-datasets schema changes | Low | Medium | Pin to specific release version. Write schema validation in pipeline. |
| R08 | v1.1 | Data refresh breaks existing game references | Medium | Medium | Use stable `game_id` references. Don't cascade deletes on seed refresh. Document refresh procedure. |
| R09 | v1.2 | User session security issue | Low | High | Use httpOnly cookies for JWT. Test CSRF protection. |
| R10 | v1.3 | Filter query performance with multiple joins | Medium | Medium | Add database indexes on `competition_id`, `date`, `home_club_id`, `away_club_id`. Test with worst-case queries. |
| R11 | v1.3 | Filter combination returns zero matches | Low | Low | Graceful UI fallback: "No matches found. Try relaxing your filters." |
| R12 | v2.0 | Formation string normalization edge cases | Low | Low | Handle variant names ("4-4-2 diamond" → "4-4-2"). Test against real formation data distribution. |
| R13 | v2.1 | Transfer chain algorithm produces boring puzzles | High | Medium | Minimum chain length filter (3+ steps). Add curated seed chains. Test algorithm against 87k transfers before shipping. |
| R14 | v2.1 | BFS graph traversal performance | Medium | Medium | In-memory graph loaded on server start. Refresh periodically. Handle disconnected subgraphs gracefully. |
| R15 | v2.1 | Chain impossible to solve (no connection) | Medium | Low | Regenerate until valid chain found. Pre-generate pool of verified chains at server start. |
| R16 | v2.2 | Career path too easy (famous players) | Medium | Medium | Filter by minimum 3 transfers. Avoid currently famous players. Add difficulty scoring. |
| R17 | v3.0 | Kit image external data sourcing fails | **High** | **High** | Defer to v3.0 (last game). Research alternatives early. Fallback: text-only kit quiz with descriptive text. |
| R18 | v3.0 | Kit image licensing/copyright issues | Medium | High | Verify license per image. Wikipedia Commons is generally free. Document all image sources. Have text-only fallback ready. |
| R19 | v3.0 | Ad integration breaks UX | Low | Medium | Non-intrusive placement only (static banner, no video/auto-play). Test on mobile. A/B test ad placement. |
| R20 | Cross-cutting | Oracle Cloud Free Tier account termination (inactivity) | Low | High | Set up periodic health check ping (e.g., GitHub Actions weekly). Document recovery procedure. |
| R21 | Cross-cutting | transfermarkt-datasets discontinued | Low | High | One-time seed sufficient for MVP. For ongoing updates, fork dataset or cache locally. |

### Risk Probability Scale

| Term | Likelihood |
|------|-----------|
| Low | < 20% |
| Medium | 20-60% |
| High | > 60% |

### Risk Impact Scale

| Term | Effect |
|------|--------|
| Low | Inconvenience, minor delay (< 1 day) |
| Medium | Moderate delay (1-5 days), feature impact |
| High | Critical delay (> 1 week), feature blocked or fundamentally changed |

---

## 7. Release Criteria

### v1.0 — Missing Eleven MVP

- [ ] Game is playable at a public URL over HTTPS
- [ ] All 11 shirts in a match are guessable via Wordle mechanics
- [ ] Game ends correctly: all guessed → winning state, any shirt failed after 6 attempts → name revealed in red
- [ ] Game state persists through browser refresh (localStorage)
- [ ] Player search autocomplete responds within 300ms for partial queries
- [ ] Docker Compose stack starts fresh with `docker compose up`
- [ ] CI/CD pipeline deploys on push to `main`
- [ ] Match selection never returns an incomplete lineup
- [ ] All API endpoints return structured JSON with appropriate HTTP status codes
- [ ] `GET /api/matches/random` returns at least ~79k possible matches (high variety, low repeat probability)

### v1.1 — Infrastructure & Quality

- [ ] `npm test` or equivalent passes with 80%+ coverage on game-logic modules
- [ ] All API errors return consistent JSON format: `{ error: string, code: string }`
- [ ] Database backup cron job produces valid `.sql` dump
- [ ] Restore procedure is documented (either in `docs/` or `scripts/` README)
- [ ] Environment variables validated at startup (missing vars cause clear error)

### v1.2 — User Features

- [ ] New users can register with email + password
- [ ] Returning users can log in
- [ ] Anonymous users can play without login
- [ ] After game completion, anonymous users are prompted to create an account to save progress
- [ ] Logged-in users see their stats: games played, games won, current streak, best streak
- [ ] Profile page (`/profile`) renders stats
- [ ] Name override table is seeded with 5+ known ambiguous-name corrections
- [ ] JWT authentication works via httpOnly cookie

### v1.3 — Filters & Difficulty

- [ ] Filters work: team, league, era, nation — singly and in combination
- [ ] Invalid/empty filter results show fallback UI
- [ ] Easy mode: unlimited attempts, hints enabled
- [ ] Normal mode: 6 attempts, no hints (backward-compatible)
- [ ] Hard mode: 4 attempts, no hints
- [ ] Difficulty selection persists for the duration of a game session
- [ ] `FilterPanel` component is usable on mobile

### v2.0 — Guess the Formation

- [ ] Formation game is playable and uses existing match endpoint
- [ ] 5 formation options are selectable
- [ ] Correct/incorrect feedback works
- [ ] Game hub landing page lists both Missing Eleven and Guess the Formation
- [ ] If v1.2 shipped: stats track Formation games separately

### v2.1 — Transfer Links

- [ ] Chain puzzle is generated with minimum 3-step length
- [ ] Player-to-player guessing works with autocomplete
- [ ] Chain visual display updates on each correct guess
- [ ] No trivial chains (direct player-to-player transfer connection)
- [ ] Curated seed chains included for at least 5 classic transfer connections

### v2.2 — Career Path

- [ ] Career puzzle loads from a random player with 3+ transfers
- [ ] Clues reveal progressively (club + year range per step)
- [ ] Player can guess at any point in the reveal sequence
- [ ] Correct guess ends game; incorrect guess reveals next clue
- [ ] Game ends when player identified or all clues shown

### v3.0 — Kit Quiz + Monetization

- [ ] Kit display works (image or text fallback)
- [ ] Multiple choice options are plausible and distinct
- [ ] Ads display on game pages (non-intrusive placement)
- [ ] Ad-free experience for logged-in users (if implemented)
- [ ] Kit Quiz stats tracked alongside other games

---

## 8. Task Contract

### Branch Conventions

```
v1.0/scaffold          ✓
v1.0/data-pipeline     ✓
v1.0/core-api          ✓
v1.0/frontend-game     ✓
v1.0/docker-deploy     ✓
v1.1/testing           ✓
v1.2/auth              ✓
v1.2/user-stats        ✓
v1.2/profile-page      ✓
v1.3/filters           ✓
v1.3/difficulty        ✓
v2.0/guess-formation   ✓
v2.1/transfer-links    ✓
v2.2/career-path       ✓
v3.0/kit-quiz          ✓
v3.0/monetization      ✓
```

### PR Rules

1. **No mixed milestones in a single PR** — each PR must target exactly one milestone.
2. Each PR title must start with the milestone version, e.g., `v1.0: Add data pipeline`.
3. Squash-merge into `main` with a clean message.
4. Reviewer must verify acceptance criteria before merging.

### Testing Requirements

- **v1.0**: Manual verification of all acceptance criteria. Unit tests for Wordle algorithm and game state machine.
- **v1.1+**: Run full test suite (`npm test`) before milestone release.
- **E2E tests**: Critical paths only for v1.1+ (game playthrough, auth flow, filter interaction).

### Changelog

- Update `CHANGELOG.md` per milestone with summary of changes.
- Group changes into: `Added`, `Changed`, `Fixed`, `Infrastructure`.
- Reference issue/PR numbers where applicable.

### Release Tagging

- Every milestone release is tagged: `git tag vX.Y.Z`
- Tags are pushed to GitHub: `git push origin vX.Y.Z`
- Release notes are published on GitHub Releases for each tag.

### Milestone Release Checklist

- [ ] All acceptance criteria verified
- [ ] Full test suite passes
- [ ] Changelog updated
- [ ] Git tag created and pushed
- [ ] GitHub Release published
- [ ] Deployed to production (Oracle Cloud)
- [ ] Smoke test on production URL

---

## 9. Handoff Packet

```markdown
## Handoff Packet

- **Project**: FootPlay Platform Roadmap
- **Current milestone**: v1.0 (Missing Eleven MVP)
- **Next decision needed**: Monorepo tool (npm workspaces recommended — see D1)
- **Secondary decision needed**: Name display derivation (D8) — before data pipeline
- **Key docs**:
  - `Project.md` — project overview, architecture, tech stack
  - `research-roadmap.md` — full research (537 lines) with game analysis, risks, dependency graph
  - `docs/roadmap.md` — this document (the product roadmap)
- **Blockers**: None for v1.0
- **Start with**: Data pipeline spec (it blocks everything else)
- **Known unknowns to resolve during v1.0**:
  1. Real-world performance of 37k-player autocomplete with debounced search
  2. Quality and variety of random match selection from 79k games
  3. Size and complexity of name cleaning required (biggest estimation risk)
  4. Oracle Cloud ARM Docker build performance in CI
```

---

## Appendix A: Effort Summary

| Milestone | Version | Effort | Relative to v1.0 |
|-----------|---------|--------|-------------------|
| Missing Eleven MVP | 1.0.0 | **L** (3-5 weeks) | Baseline |
| Infrastructure & Quality | 1.1.0 | **M** (1-2 weeks) | ~40% |
| User Features | 1.2.0 | **M** (2-3 weeks) | ~50% |
| Filters & Difficulty | 1.3.0 | **M** (1-2 weeks) | ~35% |
| Guess the Formation | 2.0.0 | **S** (~1 week) | ~15% |
| Transfer Links | 2.1.0 | **M** (2-3 weeks) | ~40% |
| Career Path | 2.2.0 | **M** (~2 weeks) | ~35% |
| Kit Quiz + Monetization | 3.0.0 | **L** (3-4 weeks) | ~60% (high uncertainty) |

**Total estimated timeline**: ~16-20 weeks (full-time solo), ~10-14 weeks (dual-track parallel)

## Appendix B: Open Decision Register

| ID | Decision | Blocks | Deadline | Recommended |
|----|----------|--------|----------|-------------|
| D1 | Monorepo tool | v1.0 scaffold | Before v1.0 dev start | npm workspaces |
| D8 | Name display field | v1.0 data pipeline | Before v1.0 data pipeline | Use `name` field with `display_name` override |
| D9 | JWT storage | v1.2 auth | Before v1.2 dev start | httpOnly cookie |
| D10 | Anonymous play | v1.2 auth | Before v1.2 dev start | Allow anonymous + prompt to save |
| D11 | Password hashing | v1.2 auth | Before v1.2 dev start | bcrypt |
| D12 | Anonymous-to-auth migration | v1.2 auth | Before v1.2 dev start | Save after completion |
| D13 | Chain generation strategy | v2.1 dev | Before v2.1 dev start | BFS + min length + curated seeds |
| D14 | Transfer guess format | v2.1 dev | Before v2.1 dev start | Player-to-player |
| D15 | Career clue difficulty | v2.2 dev | Before v2.2 dev start | Obscure-to-famous |
| D16 | Min career length | v2.2 dev | Before v2.2 dev start | 3 transfers |
| D17 | Kit image source | **v3.0 start** | **Before v3.0** | **UNRESOLVED** — research needed |
| D18 | Kit Quiz format | v3.0 dev | Before v3.0 dev start | Multiple choice (4 options) |
| D19 | Ad provider | v3.0 monetization | Before v3.0 monetization | Research when approaching v3.0 |

---

*Roadmap prepared from `research-roadmap.md` (Section 1-9). This is a living document — update as decisions are made and milestones are shipped.*
