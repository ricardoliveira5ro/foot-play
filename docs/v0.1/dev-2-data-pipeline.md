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

**Name cleaning**: The critical and riskiest step. Strategy:
1. Use `last_name` as the default `display_name` for most players
2. For players known by a single name (Pelé, Neymar), use `name` field
3. For players with common short forms, build a manual override mapping in `scripts/name-overrides.ts`
4. Log all players where auto-extraction produces ambiguous results for manual review

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

### Task 2.2: Implement name cleaning utility

- **Description**: Create the name-cleaning logic that populates `display_name`. Default to `last_name`, with override mappings for known special cases.
- **Files to create/modify**:
  - `scripts/src/name-cleaning.ts` — core logic + override map
  - `scripts/src/name-overrides.ts` — seed manual override map (start with 20-30 known cases)
- **Strategy**:
  1. Check exact match against `NAME_OVERRIDES` map by `name`
  2. If no override found, use `last_name` as `display_name`
  3. If `last_name` is empty, use `first_name`
  4. If both are empty, fall back to `name`
  5. Log all players where `display_name` is not distinct
- **Acceptance criteria**:
  - [ ] Every player receives a non-null `display_name`
  - [ ] Known overrides (Messi, Ronaldo, Neymar, Pelé) are correctly applied
  - [ ] Ambiguous cases are logged to a file for review
  - [ ] No two players share the same `display_name` after dedup logic
- **Validation**: Run with a sample of players. Verify output.

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

| Task | Estimate |
|------|----------|
| Task 2.1 (download script) | 0.5 day |
| Task 2.2 (name cleaning) | 1-2 days (RISK: unknown scope) |
| Task 2.3 (seed script + lineup filtering) | 1.5 days |
| Task 2.4 (position mapping) | 0.25 day |
| Task 2.5 (verification) | 0.25 day |
| Buffer | 0.5-1 day |

---

## Risk Factors

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Name cleaning scope larger than expected** | **High** | Medium | Budget 2 days. Log edge cases. Defer to v1.2 name override table. |
| CSV parsing edge cases (encoding, commas) | Medium | Medium | Use `csv-parse` with `relax_column_count: true`. Validate row counts. |
| Large dataset memory issues | Medium | Medium | Batch inserts (500-1000 rows). Use streaming CSV parser. |
| Lineup filtering eliminates too many matches | Medium | Medium | Test filtering early with a sample. Report filtering stats. |
| transfermarkt-datasets schema changes | Low | Medium | Pin to specific release tag. Validate columns before parsing. |

---

## "Done" Checklist

- [ ] `npx prisma db seed` completes within 10 minutes
- [ ] Database reports expected row counts (37k+ players, 10k+ teams, ~300 competitions, 30k+ matches, 700k+ appearances)
- [ ] Every player has a non-null `display_name`
- [ ] Known name overrides work (Messi → "Messi", Ronaldo → "Ronaldo", etc.)
- [ ] No orphaned records (all foreign keys reference valid rows)
- [ ] Every match has at least 11 starting lineup appearances
- [ ] Position mapping covers all commonly occurring `sub_position` values
- [ ] `scripts/src/verify-data.ts` passes all checks
- [ ] Ambiguous names logged to file for manual override seeding
- [ ] All changes committed to `dev-2/*` branch
