# FootPlay

## Project Overview

FootPlay is a web platform hosting football-themed mini-games. Each game lives at its own route (e.g., `/missing-eleven`). The goal is to challenge football fans' knowledge through interactive, fun puzzles.

**Target audience:** Football fans worldwide who enjoy trivia and word games.

**Language:** English only (player names + UI).

**Monetization (future):** Ad-supported.

---

## Game: Missing Eleven

**Route:** `/missing-eleven`

### Core Concept

You're shown a tactic board with a team's shirt layout (one team only) along with the match result and when it happened. Your mission: guess all 11 players.

### Gameplay Rules

#### Flow
1. Player sees a tactic board with 11 shirts (formation layout, e.g. 4-3-3)
2. Match information is shown: **final score**, **date/year**, and optionally **competition**
3. Player clicks on a shirt to start guessing that player's name
4. Each player guess follows **Wordle mechanics** (see below)
5. Game ends when all 11 players are correctly guessed OR all attempts are exhausted

#### Shirt Display
All shirts use a default color for all teams (no external dependency for kit colors).

#### Shirt States
- **Default:** Shirt shown in default color with the player's number
- **In progress:** User has guessed at least one letter — below the shirt, only guessed letters are displayed as feedback (e.g. `..R...` where 'R' was the only letter guessed correctly) in default color
- **Correct:** Full player name displayed below the shirt in default color
- **Failed:** All 6 attempts exhausted — correct name displayed below the shirt in red


### Wordle Mechanics (Per Player)

Each player name guess works like classic Wordle:

| Color | Meaning |
|---|---|
| 🟩 Green | Letter is correct and in the correct position |
| 🟧 Orange | Letter exists in the name but wrong position |
| ⬜ Grey | Letter does not exist in the name |

- **Attempts:** 6 guesses per player name (Wordle standard)
- **After 6 failed attempts:** The correct name is revealed, shirt marked as failed
- **No hints** in Normal difficulty

#### Name Matching Rules
- Last name or most commonly known name (e.g. "Messi", not "Lionel Messi")
- For players known by a single name (e.g. "Pelé", "Neymar"), use that
- For players with common nicknames (e.g. "Ronaldo" for Cristiano Ronaldo), use the most widely recognized version
- Accents/diacritics: match against the dataset's format
- If a player has multiple common variations, accept the most standard one

### Difficulty Modes

For initial development, only one mode:

| Mode | Hints | Attempts per Player |
|---|---|---|
| Normal | None | 6 |

Future modes (not in v1): Easy (hints enabled), Hard (fewer attempts), etc.

### Game Filters

Players can filter which matches/puzzles are generated:

| Filter | Options |
|---|---|
| Team | Select specific club or national team |
| League | Premier League, La Liga, Serie A, Bundesliga, Ligue 1, etc. |
| Era/Decade | 2000–2010, 2010–2020, 2020–present |
| Nation | Country-competition (World Cup, Copa America, Euros) |
| No Filter | Completely random from entire dataset |

Multiple filters can be combined (e.g., Premier League + 2020–present).

### Data Source

Player and match data will be sourced from [transfermarkt-datasets](https://github.com/dcaribou/transfermarkt-datasets), which provides:
- Player names
- Club/national team affiliations
- Match lineups
- Competitions
- Dates/seasons

---

## Technical Architecture

### Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | **Next.js** (App Router) | File-based routing for multiple games, SSG for performance |
| Backend | **Node.js + Express** | Industry standard REST API, largest ecosystem, great for learning |
| Database | **PostgreSQL** | Relational data (matches → lineups → players), industry standard SQL |
| ORM | **Prisma** | Type-safe DB queries, migrations, great DX with TypeScript |
| Language | **TypeScript** | Type safety across frontend and backend |
| Styling | **Tailwind CSS** | Fast UI dev (tactic board, Wordle grid, responsive) |
| Package Manager | **npm** | Standard |
| Version Control | **GitHub** | Standard Git workflow |
| Linting | **ESLint + Prettier** | Code quality + consistent formatting |
| Hosting | **Oracle Cloud Free Tier** | $0/mo, ARM instance with 4 GB RAM, 10 TB bandwidth |

### Architecture Overview

The project is split into two main applications — `frontend/` (Next.js) and `backend/` (Express API) — plus a `scripts/` directory for data processing. All three services run as Docker containers on a single Oracle Cloud ARM instance, fronted by an Nginx reverse proxy.

**Key directories:**

| Directory | Purpose |
|---|---|
| `frontend/src/app/` | Next.js pages and routes (one route per game) |
| `frontend/src/components/` | Shared UI components (Nav, Footer, Layout) |
| `frontend/src/lib/` | API client, Wordle algorithm, game state logic, filter logic |
| `frontend/src/types/` | TypeScript type definitions |
| `backend/src/routes/` | API route definitions (matches, players, games, auth) |
| `backend/src/controllers/` | Route handlers with business logic |
| `backend/src/middleware/` | Auth, validation, error handling |
| `backend/src/services/` | Reusable service layer |
| `backend/src/prisma/` | Database schema and migrations |
| `scripts/` | Data processing (CSV download, name cleaning, DB seeding) |

### Database Schema (PostgreSQL + Prisma)

**Core entities:**

| Entity | Key Fields | Purpose |
|---|---|---|
| **Player** | id, name (display), fullName, position, nationality | All player data |
| **Team** | id, name, league, country | Club/national team info |
| **Match** | id, date, season, competition, homeTeamId, awayTeamId, homeScore, awayScore | Match results |
| **Appearance** | id, matchId, playerId, shirtNumber, position | Links players to matches (lineups) |

**Future entities (user accounts):**

| Entity | Key Fields | Purpose |
|---|---|---|
| **User** | id, email, name, password (bcrypt hashed) | User authentication |
| **UserStats** | userId, gamesPlayed, gamesWon, currentStreak, bestStreak | Player statistics |

### REST API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/matches` | List matches with filters (team, league, era, nation) |
| `GET` | `/api/matches/:id` | Get single match with full lineup |
| `GET` | `/api/players` | Search players by name |
| `POST` | `/api/games` | Create a game session (selects random match) |
| `PUT` | `/api/games/:id/guess` | Submit a guess for a player |
| `POST` | `/api/auth/register` | Create user account |
| `POST` | `/api/auth/login` | Login, returns JWT |

### Data Pipeline (CSV → PostgreSQL)

1. Download CSVs from transfermarkt-datasets releases
2. Parse CSV files
3. Clean player names — extract last name / most famous name, with manual mapping for variations (e.g. "Cristiano Ronaldo" → "Ronaldo")
4. Insert into PostgreSQL via Prisma
5. Verify data integrity (no orphaned records, all lineups complete)

### Pitch Position Mapping

Each position maps to fixed x/y coordinates on the tactic board. Positions are normalized to fit the team's actual formation (e.g. 4-3-3 uses LW/RW, 4-4-2 uses LM/RM).

| Position | X | Y |
|---|---|---|
| GK | 50% | 90% |
| CB (LCB) | 30% | 72% |
| CB (RCB) | 70% | 72% |
| LB | 10% | 60% |
| RB | 90% | 60% |
| CM (LCM) | 30% | 45% |
| CM (RCM) | 70% | 45% |
| CAM | 50% | 35% |
| LW | 15% | 25% |
| RW | 85% | 25% |
| ST | 50% | 15% |

### UI/UX Technical Notes

- **Tactic Board:** CSS Grid / absolute positioning, shirts placed via position coordinates
- **Wordle Input:** Modal with autocomplete from player database, colored letter feedback
- **Responsive:** Desktop = full pitch view; Mobile = tap-friendly shirts, full-screen Wordle modal
- **Backend communication:** Frontend fetches from Express API, handles loading/error states

### Component Structure

**Game components (Missing Eleven):**

| Component | Purpose |
|---|---|
| `TacticBoard.tsx` | Pitch layout with shirt positions |
| `Shirt.tsx` | Individual shirt (state-driven rendering) |
| `WordleModal.tsx` | Guess input + Wordle feedback grid |
| `MatchInfo.tsx` | Score, date, competition display |
| `FilterPanel.tsx` | Filter selection UI |
| `GameComplete.tsx` | End screen (won/lost) |

**Shared components:**

| Component | Purpose |
|---|---|
| `Layout.tsx` | Nav + footer wrapper |
| `Navbar.tsx` | Navigation between games |
| `Footer.tsx` | Site footer |

### What You'll Learn

| Concept | Where |
|---|---|
| REST API design | Backend routes, controllers |
| SQL & relational data | Prisma schema, migrations, JOINs |
| Full-stack integration | Frontend fetching from API |
| Authentication | JWT-based auth middleware |
| Data processing | CSV parsing, name cleaning |
| Docker & containers | Docker Compose, multi-service setup |
| CI/CD pipelines | GitHub Actions, automated deployment |
| Error handling | Middleware, API responses |
| Environment management | .env files, config |

### Development Workflow

- `npm install` — install dependencies for frontend and backend
- `npx prisma migrate dev` — run database migrations
- `npx prisma db seed` — import data from CSVs into PostgreSQL
- `npm run dev` — start local dev servers (frontend on :3000, backend on :4000)
- `npm run lint` — ESLint + Prettier code quality checks
- `npm run build` — production build

### Deployment

**Provider:** Oracle Cloud Free Tier — $0/mo forever

| Resource | Config |
|---|---|
| Instance | ARM Ampere A1 (2 OCPUs, 4 GB RAM) |
| Storage | 100 GB block volume |
| Bandwidth | 10 TB/mo outbound |
| Database | PostgreSQL (Dockerized on same instance) |

#### Architecture
All three services (frontend, backend, database) run as Docker containers on a single Oracle Cloud ARM instance. An Nginx reverse proxy handles incoming traffic, routing `/` to the frontend and `/api/*` to the backend. SSL via Let's Encrypt.

#### CI/CD Pipeline
Automated deployments from the start via GitHub Actions. Push to `main` triggers:
1. Build and test on GitHub
2. SSH into Oracle instance
3. Pull latest code
4. Rebuild and restart Docker containers
5. Run database migrations if needed

#### Notes
- ARM64 architecture — all project dependencies (Next.js, Express, PostgreSQL) are ARM-compatible
- SSL certificates via certbot + Nginx reverse proxy
- Backups via periodic `pg_dump` + Oracle block volume snapshots
- Custom domain optional later

---

## Future Games (Not in Scope Yet)

Other mini-games planned for the platform:
- **Guess the Formation** — see lineups, guess the tactical shape
- **Transfer Links** — chain players by transfer history
- **Career Path** — guess a player's career path from clues
- **Kit Quiz** — identify team/season from shirt design

---

## Monetization Strategy

| Phase | Approach |
|---|---|
| Now | Free, no ads |
| Future | Ad-supported (non-intrusive) |
