# FootPlay — Full Product Roadmap Research

**Researcher**: technical + product research
**Date**: 2026-07-21
**State**: `ready for spec`

---

## 1. Game Analysis

Each game is analyzed against the transfermarkt-datasets source to determine data requirements, backend/frontend needs, unique algorithms, and relative complexity.

### 1.1 Missing Eleven (v1.0) — Small/Medium (the MVP)

| Dimension | Analysis |
|---|---|
| **Data needed** | `games` (home_club_goals, away_club_goals, date, competition_id, home_club_formation, away_club_formation, season, round), `game_lineups` (starting_lineup only: player_id, player_name, position, number), `players` (name for guessing), `clubs` (name for display), `competitions` (name for display) |
| **Available in source?** | ✅ **All fields present.** `game_lineups` has a `type` field that distinguishes `starting_lineup` from `substitutes`. Player position data exists in both `game_lineups.position` and `players.position`/`players.sub_position`. Formation string (e.g. "4-3-3") is available in `games.home_club_formation`. |
| **Backend endpoints** | `GET /api/matches/random` (random match + full lineup), `GET /api/matches/:id` (single match), `GET /api/players?q=` (name search with autocomplete) — as designed in the MVP spec |
| **Frontend components** | `TacticBoard`, `Shirt`, `WordleModal`, `MatchInfo`, `GameComplete`, `FilterPanel` (deferred from v1.0 per earlier decisions) |
| **Unique game logic** | Wordle-style letter feedback algorithm (position-correct/yellow/grey); match lineup extraction; game state machine (per-player attempts, solved/failed tracking) |
| **Relative complexity** | **S-M**. The game logic is contained and well-understood. The tactic board rendering and Wordle modal are the primary surface area. Data pipeline (CSV → DB) is a one-time build. |
| **Key previous decisions** | Client-side game state (localStorage), `display_name` + manual name override table, one-time data seed, no auth, no filters in v1 |

<details>
<summary>claims_verified — Data completeness for MVP</summary>

- `games` table has: game_id, competition_id, season, date, home_club_id, away_club_id, home_club_goals, away_club_goals, home_club_formation, away_club_formation, stadium, attendance, round, url ✅
- `game_lineups` table has: game_id, club_id, type (starting_lineup/substitutes), number, player_id, player_name, team_captain, position ✅
- `players` table has: player_id, name (concatenated first + last), first_name, last_name, position, sub_position ✅
- 79,000+ games, 37,000+ players, 1,800,000+ appearances available ✅
</details>

---

### 1.2 Guess the Formation — Small

| Dimension | Analysis |
|---|---|
| **Data needed** | Same as Missing Eleven: `games` (home_club_formation, away_club_formation), `game_lineups` (position data), `clubs`, `competitions`, `players` |
| **Available in source?** | ✅ `home_club_formation` and `away_club_formation` are strings in `games` (e.g. "4-3-3", "4-2-3-1", "3-5-2"). game_lineups contains each player's position on the pitch. Player `sub_position` in `players` gives granular roles (Centre-Back, Left Winger, etc.). |
| **Backend endpoints** | **No new endpoints needed.** Reuses `GET /api/matches/:id` — the formation string is already returned in match data. |
| **Frontend components** | New: `FormationSelector` (clickable formation grid of 3-9 buttons), `FormationHint` (position-by-position reveal). Shared: `MatchInfo`, `GameComplete`. |
| **Unique game logic** | Formation string comparison (normalizing "4-4-2" vs "4-4-2 diamond" variants); optional position-by-position hint system; different win condition (1 formation guess vs 11 player guesses) |
| **Relative complexity** | **S**. Lightest game to build — mostly shared infrastructure, minimal backend work, single frontend component with a formation guessing UI. Could be built as a minor version after v1.0 stabilizes. |
| **Note** | This game is the easiest "second win" for the platform. It validates the multi-game architecture with minimal new code. |

---

### 1.3 Transfer Links — Medium

| Dimension | Analysis |
|---|---|
| **Data needed** | `transfers` table (player_id, from_club_id, to_club_id, from_club_name, to_club_name, transfer_date, transfer_season, transfer_fee), `players` (name), `clubs` (name) |
| **Available in source?** | ✅ `transfers` table has **87,000+ records** covering player_id, from_club_id, to_club_id, from_club_name, to_club_name, transfer_date, transfer_fee. Self-join via club_id enables chain building. |
| **Backend endpoints** | `GET /api/games/transfer-links/random` — generates a transfer chain puzzle. `GET /api/players/:id/transfers` — returns a player's transfer history. `POST /api/games/transfer-links/:id/guess` — submit a guess in the chain. |
| **Frontend components** | New: `TransferChainBracket` (visual chain with arrows/scales), `ChainNode` (club crest + player name), `ChainGuessInput` (player or club search). Shared: `GameComplete`. |
| **Unique game logic** | **Graph traversal algorithm**: given a starting player and target player, find the shortest path (or a curated interesting path) where consecutive players share a club. This is the most algorithmically interesting game. Need to decide: shortest path, weighted path, or manually curated chains? |
| **Relative complexity** | **M**. The graph algorithm is non-trivial. Need to decide chain generation strategy. Backend needs a new service layer for transfer graph traversal. Frontend needs a chain visualization component. |
| **Key risk** | Chain quality: random chains may be boring (too short/obvious) or impossible (no connection). May need curated seeds or difficulty-based chain filtering. |

---

### 1.4 Career Path — Medium

| Dimension | Analysis |
|---|---|
| **Data needed** | `transfers` table (full career history per player), `appearances` (optional: games played per club), `players` (name, position, date_of_birth, country_of_citizenship), `clubs` (name, domestic_competition_id) |
| **Available in source?** | ✅ `transfers` gives full transfer history. `players` gives basic info. `clubs` gives club names. |
| **Backend endpoints** | `GET /api/games/career-path/random` — generates a career path puzzle. `GET /api/players/:id/career` — returns full career timeline. `POST /api/games/career-path/:id/guess` — submit player name guess. |
| **Frontend components** | New: `CareerTimeline` (progressive reveal of clubs/years), `CareerGuessInput` (name guessing with autocomplete), `CareerClueReveal` (staged clue system). Shared: `GameComplete`. |
| **Unique game logic** | **Progressive reveal system**: reveal career steps one at a time (e.g. "Played for Club A from 2010-2014", then "Played for Club B from 2014-2018"). Player must identify who it is. Clue difficulty curve matters. |
| **Relative complexity** | **M**. Progressive reveal + name guessing is similar to Missing Eleven. The career data extraction from transfers is straightforward. Main complexity is the staged clue UX and difficulty tuning. |

---

### 1.5 Kit Quiz — Medium-Large (highest uncertainty)

| Dimension | Analysis |
|---|---|
| **Data needed** | Player/club data is secondary. **Primary need**: kit image database — Transfermarkt has image URLs but **kit images are NOT part of the dataset**. |
| **Available in source?** | ❌ **Kit images are NOT in transfermarkt-datasets.** The `clubs` table has `stadium_name` and `url` but no kit image URL. `players` table has `image_url` for player photos, but no kit images. **This game requires an external data source or manual curation.** |
| **Alternative sources** | Possible: Wikipedia Commons (club kit pages), CSS/vector approximations (colored shirt + pattern), manual asset creation, or third-party sports API. Each has licensing/quality tradeoffs. |
| **Backend endpoints** | `GET /api/games/kit-quiz/random` — returns a kit image + options. Minimal backend if kits are static assets. |
| **Frontend components** | New: `KitImage` (image display), `KitOptionGrid` (multiple choice), `KitReveal` (answer display with fact). |
| **Unique game logic** | Multiple choice or open-ended team/season identification. No Wordle-style mechanic. |
| **Relative complexity** | **M-L**. The game logic is simple (multiple choice). The complexity is entirely in **data acquisition**: sourcing kit images legally, storing them efficiently, keeping them current. |
| **Key risk** | **External data dependency.** No clean automated source for kit images. Copyright/licensing concerns with club kits. This is the highest-risk game. |
| **Recommendation** | Defer Kit Quiz to last game. Re-evaluate when other games are shipped. Consider simplifying to "text-based kit quiz" (describe the kit, no image) or partnering with a kit image provider. |

---

## 2. Platform Capability Map

What needs to be built, when, and whether it's shared infrastructure or game-specific.

### Layer 1: Foundation (v1.0 — Missing Eleven MVP)

| Capability | Type | Effort | Notes |
|---|---|---|---|
| Project scaffolding (Next.js + Express + Prisma + TS + Tailwind config) | Shared | S | Monorepo structure, `frontend/`, `backend/`, `scripts/` directories |
| Docker Compose setup (frontend, backend, postgres, nginx) | Shared | M | Dockerfiles for ARM64 (Oracle Free Tier). Must include Nginx + Let's Encrypt config. |
| GitHub Actions CI/CD | Shared | S | Push-to-main triggers build + SSH deploy. Must handle ARM64 builds. |
| Prisma schema (Player, Team, Match, Appearance, GameSession) | Shared | S | Core entities. Future entities (User, UserStats) deferred. |
| Data pipeline (CSV → PostgreSQL seed) | Shared | M | Download CSVs, parse, clean names, insert via Prisma. One-time seed for MVP. |
| Core REST API (matches, players, game sessions, guesses) | Shared | M | `GET /api/matches/random`, `GET /api/matches/:id`, `GET /api/players?q=`, `POST /api/games`, `PUT /api/games/:id/guess` |
| Missing Eleven game components (TacticBoard, Shirt, WordleModal, MatchInfo, GameComplete) | Game-specific | M | Core game UI |
| Missing Eleven game logic (Wordle algorithm, game state machine, localStorage persistence) | Game-specific | S | Client-side state via localStorage per earlier decision |
| Shared frontend layout (Layout, Navbar, Footer) | Shared | S | Navbar shows available games, currently just Missing Eleven |
| Responsive CSS (Tailwind) | Shared | S | Desktop-first + mobile-friendly |

**Total v1.0 effort**: **M** (the MVP scope is well-contained)

### Layer 2: Infrastructure Hardening (v1.1 — can overlap with v1.0)

| Capability | Type | Effort | Notes |
|---|---|---|---|
| Testing infrastructure (Jest/Vitest + Playwright or Cypress) | Shared | M | Unit tests for backend, component tests for frontend, E2E for critical paths |
| Error handling + logging middleware | Shared | S | Structured error responses, server-side logging |
| Environment config management (.env, validation) | Shared | S | Zod or similar for env validation |
| Monitoring (uptime, error tracking, basic analytics) | Shared | S | Oracle Cloud Free Tier has basic monitoring. Consider Sentry free tier. |
| Database backup automation (pg_dump cron + volume snapshots) | Shared | S | As specified in Project.md |
| Data refresh pipeline (weekly CSV re-import) | Shared | M | Incremental data updates — how to handle new matches/players without breaking existing game references |

**Total v1.1 effort**: **M**

### Layer 3: User Features (v1.2)

| Capability | Type | Effort | Notes |
|---|---|---|---|
| Auth system (JWT, register, login, middleware) | Shared | M | `POST /api/auth/register`, `POST /api/auth/login`, auth middleware for protected routes |
| User model + UserStats model | Shared | S | Prisma schema additions |
| User stats tracking (games played, won, streaks) | Shared | S | Track per-user stats across all games |
| User profile page | Shared | S | `/profile` route showing stats |
| Name display override table (admin UI or seed) | Shared | S | Manual table for player name variations/corrections |

**Total v1.2 effort**: **M**

### Layer 4: Filters & Difficulty (v1.3)

| Capability | Type | Effort | Notes |
|---|---|---|---|
| Backend filter support (team, league, era, nation) | Shared | M | Query parameter filtering on `GET /api/matches` |
| FilterPanel frontend component | Shared | S | Shared UI for all games to use |
| Difficulty modes (Easy with hints, Hard with fewer attempts) | Shared | M | Impacts game session creation + Wordle logic + hint system |
| Frontend difficulty selector | Shared | S | Dropdown/toggle in game UI |

**Total v1.3 effort**: **M**

### Layer 5: Game Expansion (v2.0+)

| Capability | Type | Effort | Notes |
|---|---|---|---|
| Guess the Formation | Game-specific | S | See Section 1.2 |
| Transfer Links | Game-specific | M | See Section 1.3 |
| Career Path | Game-specific | M | See Section 1.4 |
| Kit Quiz | Game-specific | M-L | See Section 1.5 |
| Game hub / landing page | Shared | S | `/` route showing all games with descriptions |

### Layer 6: Monetization (v3.0+)

| Capability | Type | Effort | Notes |
|---|---|---|---|
| Ad integration (non-intrusive) | Shared | S | Ad script + layout placement |
| Ad-free option (future consideration) | Shared | S | Only if user accounts exist |

---

## 3. Dependency Graph

### Critical Path

```
┌─────────────────────────────────────────────────────────────────┐
│ v1.0 Missing Eleven MVP                                          │
│                                                                   │
│  Scaffold ──► Data Pipeline ──► Core API ──► Frontend Game       │
│     │              │               │              │              │
│     └── Docker/Deploy ────────────┴── CI/CD ──────┘              │
│                                                                   │
│  (EVERYTHING depends on Scaffold + Data Pipeline)                 │
└─────────────────────────────────────────────────────────────────┘
```

### Shared vs Game-Specific

```
SHARED (blocks everything)         GAME-SPECIFIC (can build in parallel)
══════════════════════════         ═══════════════════════════════════
Project scaffolding               Missing Eleven game components
Prisma schema + migrations        Guess the Formation components
Data pipeline                     Transfer Links components
Core REST API                     Career Path components
Layout/Navbar/Footer              Kit Quiz components
Auth system                       
User stats                        
Filter support                    
Docker + Nginx + SSL              
CI/CD pipeline                    
```

### What Can Be Parallelized

| Parallelizable | Constraints |
|---|---|
| **Guess the Formation** can be built alongside v1.2/v1.3 work | Needs the core API (matches endpoints) to exist. No blocking dependency on auth or filters. |
| **Career Path** can be built after data pipeline + transfers table | Needs the core API infrastructure to exist. |
| **Transfer Links** can be built after data pipeline + transfers table | Graph algorithm is independent. Needs core API infrastructure. |
| **Kit Quiz** deferred until data sourcing is resolved | Blocks on external data decision. |
| **Auth + User Stats** can be built after v1.0 scaffold | No game dependency. Standalone feature. |
| **Filters** can be built after core API | Extension of existing match query system. |

### What Cannot Be Parallelized (Strict Dependencies)

| Item | Blocked By |
|---|---|
| **Any game** | Project scaffold + Prisma schema + data pipeline |
| **Second game** | Core API (matches endpoints). Must exist before any game can display data. |
| **User stats per game** | Auth system must exist first |
| **Cross-game stats dashboard** | Auth system + all games must be collecting stats |
| **Monetization** | Platform must have traffic. Game content must exist. |

---

## 4. Milestone Boundary Analysis

### v1.0 — Missing Eleven MVP (Smallest Shippable Increment)

**Version**: `1.0.0`
**Theme**: "One game, working, public"
**Goal**: A single playable game deployed to a public URL.

**Scope**:
- Project scaffold + Docker + CI/CD
- Data pipeline (one-time seed)
- Missing Eleven game (no filters, no auth, Normal difficulty only)
- Core API (matches, players, game sessions, guesses)
- Client-side game state (localStorage)
- Deployed to Oracle Cloud Free Tier with Nginx + SSL

**What justifies its own version**: This is the playable MVP. Everything ships as one coherent feature. Splitting finer (e.g., scaffold without game) would ship nothing functional.

**Estimated duration**: **3-5 weeks** (full-time solo)

---

### v1.1 — Infrastructure & Quality (Optional Parallel)

**Version**: `1.1.0`
**Theme**: "Solid foundation"
**Goal**: Production hardening before adding complexity.

**Scope**:
- Testing infrastructure (unit, component, E2E)
- Error handling + logging
- Database backup automation
- Monitoring setup
- Data refresh pipeline (if needed before second game)

**Could merge into v1.0**: Yes, if the developer prefers to build testing alongside the game rather than as a separate version.

---

### v1.2 — User Features

**Version**: `1.2.0`
**Theme**: "Your progress, your way"
**Goal**: Retention mechanics — user accounts, stats, and the feeling of personal progress.

**Scope**:
- Auth system (register, login, JWT)
- User model + UserStats
- Stats tracking across all games (starting with Missing Eleven)
- Profile page (`/profile`)
- Name override table (admin seed)

**Why now**: Users benefit from persistence. Stats drive engagement. Auth enables future monetization. This is the natural cap before expanding to more games.

**What justifies its own version**: Auth is a cross-cutting concern. It touches the database, adds middleware, changes the frontend layout (login/signup buttons), and changes the game experience (logged-in vs anonymous play). It's too complex to bundle with game content changes.

---

### v1.3 — Filters & Difficulty

**Version**: `1.3.0`
**Theme**: "Your game, your rules"
**Goal**: Player agency over which matches they play and at what difficulty.

**Scope**:
- Backend filter support (team, league, era, nation)
- `FilterPanel` frontend component
- Difficulty modes (Easy, Normal, Hard)
- Frontend difficulty selector

**Why now**: Filters increase replayability significantly. Adding them after auth means logged-in users can save their filter preferences. Difficulty modes broaden the audience.

**What could be split**: Filters could ship as `1.3.0` and difficulty as `1.4.0` if either scope grows large.

---

### v2.0 — Second Game (Guess the Formation)

**Version**: `2.0.0`
**Theme**: "Two games"
**Goal**: Validate the multi-game architecture with a second game. This is a significant milestone.

**Scope**:
- Guess the Formation game + route
- Game hub landing page (`/`)
- Navbar updated to show both games
- Shared `GameComplete` + `MatchInfo` components
- Streaks/stats tracking works for both games (if v1.2 shipped)

**Why this justifies `2.0.0`**: Adding a second game changes the product from "a game" to "a platform." Architecture must support multiple game types, each with its own route, state, and logic. This is the natural major version boundary.

---

### v2.1 / v2.2 — More Games

**Version**: `2.1.0` — Transfer Links, `2.2.0` — Career Path
**Theme**: "Game library grows"
**Goal**: Expand the platform's game library.

**Scope per game**:
- New game components + route + state machine
- New API endpoints where needed
- Stats integration (if v1.2 shipped)

**Order**: Transfer Links is the more unique/different game. Career Path shares DNA with Missing Eleven (name guessing with progressive reveals). Recommend Transfer Links first for variety.

---

### v3.0 — Kit Quiz (if data sourced) + Monetization

**Version**: `3.0.0`
**Theme**: "Kit Quiz + platform sustainability"
**Goal**: Add the most visually different game. Begin monetization.

**Scope**:
- Kit Quiz game (requires data sourcing resolution first)
- Ad integration
- Optional: ad-free for logged-in users

**Why this version**: Kit Quiz is the highest-risk game. By v3.0, the platform has 4+ games, user accounts, and traffic — making it a reasonable time to monetize.

---

## 5. Effort & Sequencing Recommendations

### Effort Summary (T-Shirt Sizes)

| Milestone | Scope | Effort | Relative to v1.0 |
|---|---|---|---|
| **v1.0** | Missing Eleven MVP | **L** (not XL) | Baseline |
| **v1.1** | Infrastructure | **M** | ~40% of v1.0 |
| **v1.2** | User Features | **M** | ~50% of v1.0 |
| **v1.3** | Filters & Difficulty | **M** | ~35% of v1.0 |
| **v2.0** | Guess the Formation | **S** | ~15% of v1.0 |
| **v2.1** | Transfer Links | **M** | ~40% of v1.0 |
| **v2.2** | Career Path | **M** | ~35% of v1.0 |
| **v3.0** | Kit Quiz + Monetization | **L** | ~60% of v1.0 (high uncertainty) |

### Recommended Sequence

```
Timeline (weeks, full-time solo dev)
─────────────────────────────────────────────────────────────
v1.0  ─────────────────────────────────────  (3-5 weeks)
      Scaffold  Data  API  Game  Deploy
      
v1.1  ───────────── (1-2 weeks, parallel start)
      Tests  Logging  Backup  Monitoring
      
v1.2  ────────────────────────── (2-3 weeks)
      Auth  User model  Stats  Profile
      
v1.3  ──────────────────── (1-2 weeks)
      Filters  Difficulty modes
      
      [Optional: collect user feedback, fix bugs, iterate]
      
v2.0  ────────────── (1 week)
      Guess the Formation
      
v2.1  ──────────────────── (2-3 weeks)
      Transfer Links
      
v2.2  ────────────────── (2 weeks)
      Career Path
      
      [Platform has 4+ games, user base growing]
      
v3.0  ────────────────────────── (3-4 weeks)
      Kit Quiz (if data resolved) + Ads
```

### Alternative: Aggressive Parallel Track

If two developers are available:

```
Track A: v1.0 (Missing Eleven) ─── v1.2 (Auth) ─── v1.3 (Filters) ─── v2.1 (Transfer Links)
Track B: v1.1 (Infrastructure) ─── v2.0 (Formation) ─── v2.2 (Career Path)
                                          └── Merges at v2.0 release
```

This is feasible because Guess the Formation (v2.0) depends only on the core API from v1.0, not on auth or filters. Track B could build the formation game as soon as the first match endpoints exist.

---

## 6. Risk Factors

### High Probability / High Impact

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| **ARM64 compatibility surprises** | Medium | High | Pin Docker images to ARM-compatible tags. Test Docker build locally with `--platform linux/arm64` emulation. |
| **transfermarkt-datasets schema changes** | Low | Medium | The dataset is stable (12 tables, mature project, 1,077 commits). Pin to a specific release version. Write schema validation in the data pipeline. |
| **Name matching ambiguity** | High | Medium | Multiple players share last names. The `display_name` + manual override table (already decided in MVP spec) handles this. Must test with real data. |
| **Client-side game state lost on browser clear** | Low | Medium | Acceptable for MVP (no auth). Add user accounts in v1.2 to solve this. |
| **Oracle Cloud Free Tier capacity** | Low | Medium | 2 OCPUs + 4 GB RAM for 3 Docker containers + PostgreSQL. Fine for low traffic. Monitor before scaling. |

### Medium Probability / High Impact

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| **Kit Quiz external data sourcing fails** | High | High | Defer to v3.0. Consider text-only variant. Evaluate Wikipedia Commons or manual curation. |
| **Transfer chain algorithm produces boring puzzles** | High | Medium | Add difficulty filtering (minimum chain length, curated seeds). Test with real data before shipping. |
| **Docker + Nginx + SSL complexity** | Medium | Medium | Use docker-compose with documented Nginx config. Certbot auto-renewal. This is well-trodden ground. |
| **Data refresh breaks existing game references** | Medium | Medium | Use stable game references (game_id is stable in the dataset). Don't cascade deletes on seed refresh. |

### Low Probability / High Impact

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| **Oracle Cloud Free Tier account termination (inactivity)** | Low | High | Set up periodic health check ping. Document recovery procedure. |
| **transfermarkt-datasets dataset discontinued** | Low | High | One-time seed is sufficient for MVP. For ongoing updates, fork the dataset or cache locally. |

---

## 7. Decisions Required

These decisions must be made before certain milestones can proceed. They are **not resolved** in the current documentation.

### Before v1.0 Development Starts

| Decision | Options | Impact | Recommended |
|---|---|---|---|
| **Monorepo tool** | npm workspaces / Turborepo / Nx / none (separate packages) | Affects dev scripts, CI build steps, local development experience | npm workspaces (simplest, sufficient for 2-package monorepo) |
| **Name matching: exact field to use** | `name` (first+last), `last_name`, custom `display_name` field | Core to Wordle guessing mechanic. Must decide before data pipeline. | Use `name` (full name) as primary, add `display_name` override table for known shortening rules. Seed display_name with last_name. |
| **Player autocomplete source** | Client-side (load all players) / Server-side (search API) | Client-side feasible for 37k names? 37k names × ~20 bytes = ~740 KB. Manageable. | Server-side with debounced search (already in MVP API design). |
| **Game session persistence** | localStorage / sessionStorage / in-memory only | localStorage survives page refresh. Session data lost on browser clear. | localStorage (as decided in MVP spec). |

### Before v1.2 (Auth)

| Decision | Options | Impact | Recommended |
|---|---|---|---|
| **JWT storage** | httpOnly cookie / localStorage | Security vs simplicity tradeoff. httpOnly cookie is more secure (XSS protection). | httpOnly cookie for production quality. localStorage for simpler MVP. |
| **Anonymous play support** | Always require login / Allow anonymous + prompt to save | Affects adoption funnel. Requiring login before playing reduces conversion. | Allow anonymous play. Prompt to create account to save progress. |
| **Password hashing** | bcrypt / argon2 | bcrypt is standard, argon2 is more modern. Both have Node.js implementations. | bcrypt (simpler, well-supported, sufficient for this project). |

### Before v2.1 (Transfer Links) / v2.2 (Career Path)

| Decision | Options | Impact | Recommended |
|---|---|---|---|
| **Chain generation strategy** | Shortest-path BFS / Weighted graph / Curated chains / Difficulty-based | Directly affects puzzle quality. BFS can produce trivial chains. | Multi-strategy: prefer chains of length 3-5, use BFS with minimum length filter, add curated seeds for "classic" chains. |
| **Transfer links: guess format** | Player-to-player / Club-to-club / Both | Game mechanics decision. | Player-to-player (current player in chain must be guessed, club info shown as clues). |

### Before v3.0 (Kit Quiz)

| Decision | Options | Impact | Recommended |
|---|---|---|---|
| **Kit image source** | Wikipedia Commons / Manual assets / Third-party API / Text-only (no images) | Determines whether this game ships at all. | Research third-party sports APIs (check licensing cost). If none viable, ship text-only variant. Defer to last milestone. |

---

## 8. Known Unknowns

| Unknown | Why It Matters | When It Must Be Resolved |
|---|---|---|
| Real-world performance of 37k-player autocomplete with debounced server search | Player search responsiveness during gameplay | Before v1.0 ships. Test with actual data. |
| Quality and variety of random match selection from 79k games | Will players see the same 10 matches repeatedly? Need dedup/history tracking. | Before v1.0 ships. Test random distribution. |
| Size and complexity of name cleaning required | Manual override table scope. Are names consistently formatted in the dataset? | During v1.0 data pipeline development. |
| Oracle Cloud Free Tier ARM Docker build performance | Slow CI/CD builds for ARM architecture | During v1.0 CI/CD setup. Consider Docker buildx + caching strategies. |
| Transfer chain graph density | What percentage of 87k transfers produce interesting chains? Need to measure. | Before v2.1 development. Write analysis script against raw data. |
| Kit image licensing terms for third-party sources | Can we legally display kit images on a free web platform? | Before v3.0 planning. Must be researched when approaching v3.0. |
| User adoption patterns (how many daily puzzles, session length, retention) | Informs whether monetization makes sense, whether difficulty modes matter | After v1.0 launch. Use basic analytics (page views, game completions). |

---

## 9. Readiness for Spec

**State**: `ready for spec`

**v1.0 (Missing Eleven MVP)** is well-defined. The previous MVP spec produced key decisions that remain valid. The transfermarkt-datasets schema is fully understood and supports all v1.0 requirements.

**Areas of clarity**:
- ✅ Data model understood for all games
- ✅ Platform dependency graph mapped
- ✅ Milestone boundaries defined
- ✅ Effort estimates produced
- ✅ Risk factors documented
- ✅ Decisions required before implementation surfaced

**What the specifier should prioritize**:
1. v1.0 Missing Eleven MVP — atomic tasks for scaffold, data pipeline, core API, game frontend, Docker/CI-CD
2. Document any decisions from Section 7 that haven't been made yet
3. Begin with the data pipeline spec (it blocks everything else)

<details>
<summary>claims_verified — Source data claims</summary>

- transfermarkt-datasets: 12 tables, 79k+ games, 37k+ players, 87k+ transfers ✅ (verified against GitHub README)
- `games` table has formation data (`home_club_formation`, `away_club_formation`) ✅ (verified in `base_games.sql`)
- `game_lineups` distinguishes starting lineup vs substitutes via `type` field ✅ (verified in `base_game_lineups.sql`)
- `transfers` table has `from_club_id`, `to_club_id`, `from_club_name`, `to_club_name`, `transfer_date`, `transfer_fee` ✅ (verified in `curated/transfers.sql`)
- Kit images are NOT in the dataset — `clubs` table has no image URL for kits ✅ (verified in `base_clubs.sql`)
- ARM64 compatibility: Next.js, Express, PostgreSQL, Nginx all have ARM Docker images ✅ (well-known)
</details>

<details>
<summary>contradictions_found</summary>

- **Project.md** says "Player" entity has `name (display)`, `fullName`, `position`, `nationality`. The transfermarkt-datasets `players` table has `first_name`, `last_name`, `name` (concatenated), `position`, `sub_position`, `country_of_citizenship`. The MVP spec said "last name or most commonly known name" — but the dataset provides a single `name` field (e.g. "Cristiano Ronaldo") and separate `first_name`/`last_name`. The data pipeline must extract the "display name" from these fields. This contradicts a simple `name` column.
- **Project.md** lists the first endpoint as `GET /api/matches` with filters. The previous MVP spec scoped it to `GET /api/matches/random` and `GET /api/matches/:id` (without list endpoint). The `GET /api/matches` (list with filters) is a future endpoint per the latest decisions.
</details>

<details>
<summary>unknowns_remaining</summary>

- The exact SQL query complexity for random match selection (accounting for game_lineups completeness, formation presence, filter combinations) needs to be tested against real data.
- The name cleaning effort: what percentage of player names in the dataset need manual overrides? This is the biggest estimation risk for the data pipeline.
</details>

---

*Report prepared for `specifier` to begin task decomposition.*
