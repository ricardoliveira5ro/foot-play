# FootPlay

## What This Is

FootPlay is a web platform hosting football-themed mini-games, starting with "Missing Eleven" — a Wordle-style puzzle where players guess the 11 starting lineup from a match's tactic board. Built for football fans worldwide who enjoy trivia and word games.

## Core Value

Players can guess a football match's full starting lineup through interactive Wordle-style mechanics on a tactic board.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] **Missing Eleven game** — Full tactic board with 11 shirts, Wordle-style guessing per player, match info display
- [ ] **Match/puzzle generation** — Random match selection from dataset with filter support (team, league, era, nation)
- [ ] **Player data pipeline** — Import and clean data from transfermarkt-datasets CSV files into PostgreSQL
- [ ] **Game filters** — Filter matches by team, league, era/decade, nation, or random
- [ ] **REST API** — Endpoints for matches, players, game sessions, and guesses
- [ ] **Responsive UI** — Desktop pitch view + mobile-friendly tap interaction
- [ ] **Docker deployment** — Multi-service Docker Compose on Oracle Cloud ARM instance
- [ ] **CI/CD pipeline** — GitHub Actions automated build, test, and deploy

### Out of Scope

- User accounts / authentication — deferred to future
- Monetization / ads — deferred to future
- Additional mini-games (Guess the Formation, Transfer Links, etc.) — future scope
- Easy/Hard difficulty modes — future scope
- Kit colors per team — default shirt color for all teams
- Mobile app — web-first

## Context

FootPlay is a learning project designed to explore full-stack development with TypeScript, Next.js, Express, PostgreSQL, Docker, and CI/CD. The first game "Missing Eleven" is the core deliverable. Player data comes from the transfermarkt-datasets open dataset. The project runs on Oracle Cloud Free Tier ARM infrastructure.

## Constraints

- **Tech Stack**: TypeScript, Next.js (App Router), Express, PostgreSQL, Prisma, Tailwind CSS — as specified in Project.md
- **Hosting**: Oracle Cloud Free Tier ARM instance (2 OCPUs, 4 GB RAM) — $0/mo
- **Data Source**: transfermarkt-datasets CSV files — must be processed and cleaned
- **Language**: English only (player names + UI)
- **Architecture**: ARM64 compatible — all dependencies must support ARM

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Next.js (App Router) | File-based routing for multi-game platform, SSG for performance | — Pending |
| Express + PostgreSQL | Industry standard, great for learning full-stack patterns | — Pending |
| Prisma ORM | Type-safe DB queries, migrations, great DX with TypeScript | — Pending |
| Docker on Oracle Cloud ARM | $0/mo hosting, ARM-compatible stack | — Pending |
| Default shirt color | No external kit color dependency needed | — Pending |
| Last-name-only guessing | Simpler UX, follows Wordle conventions | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

*Last updated: 2026-07-21 after initialization*
