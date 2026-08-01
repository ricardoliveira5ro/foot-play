# Development 2: Data Pipeline

**Status**: `ready for implementation`
**Source**: `docs/v0.1/plan-v1.0-decomposition.md` (Development 2)
**Estimated Effort**: M (3-5 days)

---

## Objective

Download, parse, clean, and seed a **curated subset** of the transfermarkt-datasets release into the PostgreSQL database. By the end of this development, the database contains exactly the clubs, national teams, players, competitions, matches, and appearances that the Missing Eleven game needs: the seed is filtered **top-down from a configurable team/nation set** (curated config), not "seed everything then delete". Only matches with complete starting XIs (11 players) are seeded. Display names are cleaned, position mappings exist, and a verification script proves integrity. This is the riskiest development because the real dataset has several verified data traps (see below) that the seed must handle explicitly.

---

## Approach

**Data source**: [transfermarkt-datasets](https://github.com/dcaribou/transfermarkt-datasets) — a stable, well-maintained open dataset (weekly release, includes live WC2026 data). We download the latest CSV release and parse it.

**Files used (6)**: `players.csv`, `clubs.csv`, `games.csv`, `game_lineups.csv`, `competitions.csv`, `national_teams.csv` (new).

**Files NOT needed for v1 (do not extract — YAGNI, future minigames only)**: `countries.csv` (confederation vocabulary mismatches standard codes: `'europa'`/`'asien'`/`'amerika'` vs UEFA/AFC/...; `national_teams.csv` is self-sufficient for name + confederation), `game_events.csv` (~1.1M rows), `club_games.csv` (~150k rows), `appearances.csv`, `player_valuations.csv`, `transfers.csv`.

**Download strategy**: The `scripts/` workspace contains a TypeScript script (`download-data.ts`) that:

1. Fetches the latest release archive from GitHub
2. Extracts the 6 relevant CSVs (`players.csv`, `clubs.csv`, `games.csv`, `game_lineups.csv`, `competitions.csv`, `national_teams.csv`)
3. Caches them locally for reproducibility
4. Validates column presence before proceeding

**Curated-set config**: A config file `scripts/curated-teams.json` defines which teams/nations are in the game:

- `clubIds`: explicit transfermarkt club ids
- `nationalTeamIds`: explicit national team ids (`national_team_id` values)
- `leagueCodes`: optional — rule-based inclusion (e.g. `["GB1", "ES1", "IT1", "FR1", "L1"]`)

The exact composition of the v1 list is an **OPEN decision** (the user fills it later). Suggested example: top-5 leagues (GB1/ES1/IT1/FR1/L1) + major national-team competitions (FIWC/EURO/COPA). Because the config drives the whole seed, "change config → re-seed" gives per-minigame control over which data is in the database.

**Name cleaning**: Simple approach. Strategy:

1. Use `last_name` as `display_name` — the data already has clean `first_name` / `last_name` split
2. If `last_name` is empty, fall back to `first_name`
3. If both are empty, fall back to `name`
4. **Normalize accents and diacritics** — convert characters like á, é, í, ó, ú, ü, ñ, ç to their ASCII equivalents (a, e, i, o, u, u, n, c). This way users can type "Di Maria" and find "Ángel Di María". Use `unicode.normalize('NFD')` + regex to strip combining marks.
5. No manual override mapping needed

**Position mapping**: Convert `sub_position` values to tactic-board x/y coordinates. Lives in `backend/src/services/positionMapping.ts`.

**Filter chain** (filter-first — replaces the old "seed everything then delete" approach; nothing invalid is ever inserted):

a. **Clubs**: filter `clubs.csv` by curated `clubIds` → base club set.
b. **National teams**: filter `national_teams.csv` by curated `nationalTeamIds` → seeded into the **same Club table** (`clubId = national_team_id`; zero id collisions with `clubs.csv` verified).
c. **Games**: filter `games.csv` keeping games where `home_club_id` OR `away_club_id` ∈ (curated clubs ∪ national teams). When the config uses `leagueCodes` for rule-based inclusion, filter by `competition_id ∈ leagueCodes` instead (this is how the verified example below was computed).
d. **Lineups**: filter `game_lineups.csv` by `game_id` ∈ kept games — keeps **both** teams' lineups (the dev-3 API needs both).
e. **Full-XI filter**: keep only `type = "starting_lineup"` rows; group by `(game_id, club_id)`; keep groups with count = 11; keep games with ≥ 1 full-XI group. Log excluded games with reason.
f. **Kept clubs**: all distinct `club_id`s appearing in kept lineups (curated clubs + opponents). Names from `clubs.csv` when present, else from `games.csv` `home_club_name`/`away_club_name` — this handles the verified trap that `game_lineups.csv` references more clubs than `clubs.csv` contains.
g. **Players**: filter `players.csv` by `player_id` ∈ kept lineups. Missing players are ASSUMED negligible for now (deferred decision — see Open/Deferred Decisions); they must not block seeding.
h. **Competitions**: filter by `competition_id` ∈ (kept games' `competition_id` ∪ kept clubs' `domestic_competition_id`) — deliberately **improves** on the earlier idea of filtering only by clubs' domestic ids, which would drop cup + national-team competitions.

**Verified dataset facts** (from real CSV analysis of `scripts/data/`, current release):

| Table | Rows |
| --- | --- |
| clubs.csv | 796 clubs |
| competitions.csv | 65 competitions |
| games.csv | 88,958 games |
| players.csv | 50,149 players |
| game_lineups.csv | 3,178,530 rows (1,780,759 `starting_lineup`) |

- **Full-XI filtering** (group `starting_lineup` by `(game_id, club_id)`, count = 11): 161,554 groups; 81,074 games with ≥ 1 full XI (91% of all games); 3,020 distinct clubs.
- **national_teams.csv** (add to download): 124 teams; join key `national_team_id` matches `games.csv` `home_club_id`/`away_club_id` for national-team competitions (FIWC/EURO/COPA; 81 distinct ids in those games). Coverage: 70/81 sampled ids (86%) present in `national_teams.csv`; **11 missing** (Cameroon, Ivory Coast, Angola, Togo, DR Congo, Cape Verde, Haiti, Curaçao, North Korea, Trinidad & Tobago, Serbia and Montenegro) — their names exist in `games.csv` `home_club_name`/`away_club_name`, so **fallback = use games.csv names**. Zero id collisions between `national_team_id` (124) and `clubs.csv` `club_id` (796).
- **countries.csv NOT needed** (confederation vocabulary mismatch; `national_teams.csv` is self-sufficient).
- **DATA TRAP — clubs**: `game_lineups.csv` references **3,144** distinct `club_id`s but `clubs.csv` only contains **796** — 386,777 lineup rows reference clubs absent from `clubs.csv`. The kept-club set must be built from the lineups themselves (step f).
- **DATA TRAP — players**: `players.csv` has 50,149 players but lineups reference **114,893** distinct `player_id`s. Seed filters `players.csv` by kept-lineup ids; anything missing is deferred (see Open/Deferred Decisions).
- **Verified curated example** (config = leagueCodes GB1/ES1/IT1/FR1/L1 + national comps FIWC/EURO/COPA): 25,880 games → **23,464** games with ≥ 1 full XI; **46,927** full-XI groups → **516,197** appearance rows; **226** distinct clubs (172 in `clubs.csv`, 54 name-fallback); **8,988** distinct players needed (8,967 in `players.csv`, 21 missing); **8** competitions.

**Data integrity verification**: After seeding, run validation queries (see Task 2.5).

---

## Detailed Tasks

### Task 2.1: Create data download script

- **Description**: Write a TypeScript script that downloads transfermarkt-datasets CSVs, extracts them, validates column headers, and caches them in a local `data/` directory. Extend `REQUIRED_FILES` with `national_teams.csv` (6 files total). Explicitly document `countries.csv`, `game_events.csv`, `club_games.csv`, `appearances.csv`, `player_valuations.csv`, `transfers.csv` as **not needed for v1** (do not extract).
- **Files to create/modify**:
  - `scripts/package.json` — typescript, ts-node, axios (or node-fetch), csv-parse, adm-zip (or tar)
  - `scripts/tsconfig.json` — extends base
  - `scripts/src/download-data.ts` — download, extract, validate, cache logic
  - `.gitignore` — add `data/` (cached CSVs, not committed)
- **Acceptance criteria**:
  - [ ] Script downloads 6 CSVs from GitHub release (incl. `national_teams.csv`)
  - [ ] Extracts and caches files to `scripts/data/`
  - [ ] Validates that all required columns exist in each CSV
  - [ ] Skips download if cached data exists (idempotent)
  - [ ] Logs progress and errors to console
- **Validation**: `npx ts-node scripts/src/download-data.ts` completes. `ls scripts/data/` shows 6 CSV files.

### Task 2.2: Implement display name normalization

**Note on order**: This task creates a **utility function** (`cleanDisplayName()`) used by Task 2.3's seed script. It does NOT run against the database or modify the CSV files. The seed script (Task 2.3) imports this function and applies it to each player row during the database import — so the cleaning happens in memory as data flows from CSV → DB.

- **Description**: Create a utility that populates `display_name` using `last_name` and normalizes accents/diacritics to plain ASCII. No manual override mapping needed — the CSV data already has a proper `first_name` / `last_name` split.
- **Files to create/modify**:
  - `scripts/src/name-cleaning.ts` — core logic: pick `last_name`, normalize diacritics
- **Strategy**:
  1. Use `last_name` as `display_name`
  2. If `last_name` is empty, use `first_name`
  3. If both are empty, fall back to `name`
  4. **Normalize**: apply Unicode NFD normalization + strip combining diacritical marks. Then keep only ASCII letters. This turns `"Ángel Di María"` into `"Angel Di Maria"`.
  5. No manual override mapping, no ambiguity logging — the data is clean enough
- **Acceptance criteria**:
  - [ ] Every player receives a non-null `display_name`
  - [ ] Diacritics are removed: `"Ángel Di María"` → `"Angel Di Maria"`, `"Vitória"` → `"Vitoria"`, `"Jérémy"` → `"Jeremy"`
  - [ ] ASCII letters and spaces are preserved unchanged
  - [ ] `last_name` alone is sufficient for > 99% of players
- **Validation**: `npx ts-node scripts/src/name-cleaning.ts` outputs a sample of cleaned names.

### Task 2.3: Create Prisma seed script with curated filtering

- **Description**: Write the main seed script that loads the curated config, filters the CSVs top-down (filter chain above), cleans names, and inserts only the curated subset via Prisma. This is the biggest task in Dev 2.
- **Files to create/modify**:
  - `backend/prisma/seed.ts` — main seed entry point
  - `backend/package.json` — add `"prisma": { "seed": "ts-node prisma/seed.ts" }`
  - `scripts/curated-teams.json` — curated config (structure per Approach; composition is an open decision, seed with the suggested example)
- **Seed flow**:
  1. Ensure CSVs are cached (invoke Task 2.1 download script if needed)
  2. Load curated config (`scripts/curated-teams.json`)
  3. Filter clubs.csv by curated `clubIds` → base club set
  4. Filter national_teams.csv by curated `nationalTeamIds` → national teams (same Club table; name fallback to games.csv for the 11 known-missing teams)
  5. Filter games.csv by `home_club_id`/`away_club_id` ∈ (curated clubs ∪ national teams), or by `competition_id` when league codes are used
  6. Filter game_lineups.csv by `game_id` ∈ kept games, then apply the full-XI filter (starting_lineup only, groups of 11 per `(game_id, club_id)`); keep games with ≥ 1 full-XI group
  7. Build kept-club set from kept lineups (curated + opponents); names from clubs.csv else games.csv
  8. Filter players.csv by `player_id` ∈ kept lineups; apply name cleaning
  9. Filter competitions by `competition_id` ∈ (kept games' competition_id ∪ kept clubs' domestic_competition_id)
  10. `createMany` batch inserts (500-1000) in dependency order: competitions → clubs → players → games → appearances
  11. Run integrity checks (see Task 2.5)
- **Note**: The old "delete matches that failed the lineup filter" step is **removed** — filter-first means nothing invalid is ever inserted.
- **Batch size**: Insert in batches of 500-1000. Use Prisma `createMany`.
- **Acceptance criteria** (counts are **config-dependent**; verified example below is for leagueCodes GB1/ES1/IT1/FR1/L1 + national comps FIWC/EURO/COPA):
  - [ ] `npx prisma db seed` completes within < 10 minutes
  - [ ] Matches table has ~23,464 records (games with ≥ 1 full XI; 25,880 games in → 23,464 out for the verified example)
  - [ ] Appearances table has ~516,197 records (46,927 full-XI groups × 11)
  - [ ] Players table has ~8,988 records (8,967 from players.csv; 21 missing deferred)
  - [ ] Clubs table has ~250-400 records (~226 lineup clubs + ≤ 124 national teams)
  - [ ] National teams: ≤ 124 rows, all with resolved names (fallback to games.csv names allowed)
  - [ ] Competitions table has records for all competitions referenced by kept games ∪ kept clubs' domestic competition (8 for the verified example)
  - [ ] Every player has a non-null `display_name`
  - [ ] Every appearance references valid match, club, and player (including the new `clubId`)
  - [ ] Every game has ≥ 1 complete XI (11 starting appearances for at least one club)
  - [ ] Every seeded team/player originates from the curated chain (no data outside the config's closure)
  - [ ] Seed reports filtering stats (raw vs kept counts per table)
- **Validation**: Run `npx prisma db seed`. Then verify with `npx prisma studio` and SQL counts.

### Task 2.4: Create position mapping utility

- **Description**: Build a utility that maps `sub_position` or `position` strings to tactic-board x/y coordinates (0-100 percentage).
- **Files to create/modify**:
  - `backend/src/services/positionMapping.ts` — mapping dictionary + lookup function
- **Acceptance criteria**:
  - [ ] All common `sub_position` values have coordinate mappings
  - [ ] Unknown positions fall back to a group-based default
  - [ ] Function signature: `getPositionCoords(position: string, subPosition?: string): { x: number; y: number }`
  - [ ] Coordinates are percentages (0-100) for both x and y
- **Validation**: Test via ts-node with sample input.

### Task 2.5: Data integrity verification script

- **Description**: Build a standalone verification script that validates database integrity after seeding.
- **Files to create/modify**:
  - `scripts/src/verify-data.ts` — integrity checks
- **Checks**:
  1. Row counts within expected (config-dependent) ranges
  2. No orphaned appearances (join checks, including the new `clubId`)
  3. Every kept game has ≥ 1 full-XI lineup group (11 starting players)
  4. `display_name` uniqueness check (log duplicates)
  5. Chain-provenance spot-check: sample a few seeded club/player ids and confirm they came from the curated config closure
  6. Report filtering stats: raw vs kept counts per table (games, lineups, players, clubs, competitions)
- **Acceptance criteria**:
  - [ ] Script reports PASS/FAIL for each check
  - [ ] All checks pass on seeded data
  - [ ] Failed checks include actionable error messages
- **Validation**: `npx ts-node scripts/src/verify-data.ts` shows "All checks passed".

### Task 2.6: Schema amendment for curated seeding

**Note on order**: Numbered 2.6 because it was added after the original plan was written, but it must be **implemented before Task 2.3's seed run** (the seed writes the new `Appearance.clubId` column).

- **Description**: Amend the Dev 1 Prisma schema so appearances know which team a player belonged to, and so national teams can live in the Club table. The old plan had no way to place a player on a team — confirmed gap.
- **Files to create/modify**:
  - `backend/prisma/schema.prisma` — schema amendments below
  - `backend/prisma/migrations/` — new migration
- **Amendments**:
  1. **`Appearance.clubId` (Int) — REQUIRED**: add column + relation to Club. The board must know which team an appearance belongs to (the old schema had `gameId` + `playerId` only).
  2. **Game ↔ Club relations — RECOMMENDED, optional**: `Game.homeClubId`/`awayClubId` exist but are plain Ints with NO Prisma relation to Club. Add optional `homeClub`/`awayClub` relations for FK integrity.
  3. **`Club.isNationalTeam` (Boolean, optional)**: flag to distinguish national teams from clubs.
- **Acceptance criteria**:
  - [ ] `npx prisma migrate dev` creates and applies the migration
  - [ ] `npx prisma generate` regenerates the client (no stale types in backend/scripts)
  - [ ] National teams seed into Club with `clubId = national_team_id` (no collisions)
  - [ ] Every Appearance row has a valid `clubId`
- **Validation**: `npx prisma validate` passes; seed (Task 2.3) completes against the amended schema.

---

## Dependencies

- **Dev 1 (Repo Scaffold & Prisma Schema)** — Prisma schema must exist, PostgreSQL must be running

---

## Effort Estimate

**M (3-5 days)**

| Task                                      | Estimate                       |
| ----------------------------------------- | ------------------------------ |
| Task 2.1 (download script)                | 0.5 day                        |
| Task 2.2 (name normalization)             | 0.25 day                       |
| Task 2.3 (seed script + curated filtering) | 1.25 days                      |
| Task 2.4 (position mapping)               | 0.25 day                       |
| Task 2.5 (verification)                   | 0.25 day                       |
| Task 2.6 (schema amendment)               | 0.25 day                       |
| Buffer                                    | 0.5 day                        |

---

## Risk Factors

| Risk                                                                 | Likelihood | Impact | Mitigation                                                                                |
| -------------------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------- |
| National teams missing from `national_teams.csv` (11 known)          | Medium     | Low    | Fallback to `games.csv` `home_club_name`/`away_club_name`. Log all fallbacks during seed. |
| Clubs/players referenced in lineups but absent from `clubs.csv`/`players.csv` | High | Medium | Kept-club set built from lineups themselves; names from clubs.csv else games.csv. Missing players deferred (open decision), never block seeding. |
| Curated set too small → boring/few puzzles                           | Medium     | Medium | Config is easy to extend; "change config → re-seed" per minigame.                         |
| Name normalization scope                                             | Low        | Low    | Trivial — just Unicode NFD + strip combining marks.                                        |
| CSV parsing edge cases (encoding, commas)                            | Medium     | Medium | Use `csv-parse` with `relax_column_count: true`. Validate row counts.                     |
| Large dataset memory issues                                          | Medium     | Medium | Batch inserts (500-1000 rows). Use streaming CSV parser. Filter-first keeps memory small. |
| transfermarkt-datasets schema changes                                | Low        | Medium | Pin to specific release tag. Validate columns before parsing.                             |

---

## Open / Deferred Decisions

1. **Exact curated-set composition** — the user decides the final team/nation list (config file `scripts/curated-teams.json`). Suggestion for v1: top-5 leagues + major national teams. "Change config → re-seed" per minigame.
2. **Missing-players policy** — assumption for now: lineups ⊆ `players.csv` coverage is sufficient (verified example: 21 of 8,988 missing). Decide later whether to backfill player rows from `game_lineups` `player_name`/`position`.
3. **Game ↔ Club relations** — add now (recommended, Task 2.6) or later.

---

## "Done" Checklist

- [ ] `npx prisma db seed` completes within 10 minutes
- [ ] Database reports the verified curated-example row counts (~23.5k matches, ~516k appearances, ~9k players, ~250-400 clubs incl. ≤ 124 national teams, ~8 competitions) — counts are config-dependent
- [ ] `national_teams.csv` downloaded by Task 2.1 (6 CSVs cached in `scripts/data/`)
- [ ] Every player has a non-null `display_name`
- [ ] No orphaned records (all foreign keys reference valid rows, incl. Appearance.clubId)
- [ ] Every match has at least 11 starting lineup appearances
- [ ] Every seeded team/player originates from the curated chain
- [ ] Position mapping covers all commonly occurring `sub_position` values
- [ ] `scripts/src/verify-data.ts` passes all checks (incl. filtering stats)
- [ ] All changes committed to `dev-2/*` branch
