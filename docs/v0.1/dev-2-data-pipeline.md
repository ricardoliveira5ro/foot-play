# Development 2: Data Pipeline

**Status**: `ready for implementation`
**Source**: `docs/v0.1/plan-v1.0-decomposition.md` (Development 2)
**Estimated Effort**: M (3-5 days)

---

## Objective

Download, parse, clean, and seed real football data from transfermarkt-datasets into the PostgreSQL database. By the end of this development, the database contains players, teams, competitions, matches, and appearances with cleaned display names and position mappings. Only matches with complete starting XIs (11 players) are seeded. This is the riskiest development because name cleaning scope is unknown until real data is inspected.

---

## Approach

**Data source**: [transfermarkt-datasets](https://github.com/dcaribou/transfermarkt-datasets) — a stable, well-maintained open dataset of football transfers, matches, lineups, and player data. We download the latest CSV release and parse it.

**Download strategy**: The `scripts/` workspace contains a TypeScript script (`download-data.ts`) that:

1. Fetches the latest release archive from GitHub
2. Extracts relevant CSVs (`players.csv`, `clubs.csv`, `games.csv`, `game_lineups.csv`, `competitions.csv`)
3. Caches them locally for reproducibility
4. Validates column presence before proceeding

**Name cleaning**: Simple approach. Strategy:

1. Use `last_name` as `display_name` — the data already has clean `first_name` / `last_name` split
2. If `last_name` is empty, fall back to `first_name`
3. If both are empty, fall back to `name`
4. **Normalize accents and diacritics** — convert characters like á, é, í, ó, ú, ü, ñ, ç to their ASCII equivalents (a, e, i, o, u, u, n, c). This way users can type "Di Maria" and find "Ángel Di María". Use `unicode.normalize('NFD')` + regex to strip combining marks.
5. No manual override mapping needed

**Position mapping**: Convert `sub_position` values to tactic-board x/y coordinates. Lives in `backend/src/services/positionMapping.ts`.

**Lineup filtering algorithm**:

1. Load all appearances with `type = "starting_lineup"`
2. Group by `(game_id, club_id)`
3. Filter groups where count = 11
4. Collect all unique `game_id` values that have at least one valid club lineup
5. Only seed appearances belonging to these filtered games
6. Log excluded games with reason

**Data integrity verification**: After seeding, run validation queries.

---

## Detailed Tasks

### Task 2.1: Create data download script

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
- **Validation**: `npx ts-node scripts/src/download-data.ts` completes. `ls scripts/data/` shows 5 CSV files.

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

### Task 2.3: Create Prisma seed script with lineup filtering

- **Description**: Write the main seed script that reads CSVs, cleans names, filters complete lineups, and inserts all data via Prisma.
- **Files to create/modify**:
  - `backend/prisma/seed.ts` — main seed entry point
  - `backend/package.json` — add `"prisma": { "seed": "ts-node prisma/seed.ts" }`
- **Seed flow**:
  1. Call download script (ensure data exists)
  2. Parse players CSV → create Player records (with cleaned display_name)
  3. Parse clubs CSV → create Team records
  4. Parse competitions CSV → create Competition records
  5. Parse games CSV → create Match records
  6. Parse game_lineups CSV → filter to complete starting XIs
  7. Filter games to only those with valid lineups
  8. Delete matches that failed the lineup filter
  9. Create Appearance records for filtered lineups
  10. Run integrity checks
- **Batch size**: Insert in batches of 500-1000. Use Prisma `createMany`.
- **Acceptance criteria**:
  - [ ] `npx prisma db seed` completes within < 10 minutes
  - [ ] Players table has 37,000+ records
  - [ ] Teams table has 10,000+ records
  - [ ] Competitions table has records for all leagues present
  - [ ] Matches table has 30,000+ records (filtered — only complete XI matches)
  - [ ] Appearances table has 700,000+ records
  - [ ] Every player has a non-null `display_name`
  - [ ] Every appearance references valid match, club, and player
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
  1. Row counts within expected ranges
  2. No orphaned appearances (join checks)
  3. Every match has at least one lineup with 11 starting players
  4. `display_name` uniqueness check
  5. Random spot-check: 5 random matches, each has 11+ appearances
- **Acceptance criteria**:
  - [ ] Script reports PASS/FAIL for each check
  - [ ] All checks pass on seeded data
  - [ ] Failed checks include actionable error messages
- **Validation**: `npx ts-node scripts/src/verify-data.ts` shows "All checks passed".

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
| Task 2.3 (seed script + lineup filtering) | 1.5 days                       |
| Task 2.4 (position mapping)               | 0.25 day                       |
| Task 2.5 (verification)                   | 0.25 day                       |
| Buffer                                    | 0.5-1 day                      |

---

## Risk Factors

| Risk                                         | Likelihood | Impact | Mitigation                                                            |
| -------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------- |
| **Name normalization scope**                  | Low        | Low    | Trivial — just Unicode NFD + strip combining marks.                    |
| CSV parsing edge cases (encoding, commas)    | Medium     | Medium | Use `csv-parse` with `relax_column_count: true`. Validate row counts. |
| Large dataset memory issues                  | Medium     | Medium | Batch inserts (500-1000 rows). Use streaming CSV parser.              |
| Lineup filtering eliminates too many matches | Medium     | Medium | Test filtering early with a sample. Report filtering stats.           |
| transfermarkt-datasets schema changes        | Low        | Medium | Pin to specific release tag. Validate columns before parsing.         |

---

## "Done" Checklist

- [ ] `npx prisma db seed` completes within 10 minutes
- [ ] Database reports expected row counts (37k+ players, 10k+ teams, ~300 competitions, 30k+ matches, 700k+ appearances)
- [ ] Every player has a non-null `display_name`
- [ ] No orphaned records (all foreign keys reference valid rows)
- [ ] Every match has at least 11 starting lineup appearances
- [ ] Position mapping covers all commonly occurring `sub_position` values
- [ ] `scripts/src/verify-data.ts` passes all checks
- [ ] All changes committed to `dev-2/*` branch
