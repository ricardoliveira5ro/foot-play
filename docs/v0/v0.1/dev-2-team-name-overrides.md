# Dev 2.x — Team Name Override Mechanism (Tier 1)

## Problem statement

The database contains "strange" / overly verbose team names (e.g. `Associazione
Sportiva Roma`, `Футбольный клуб "Локомотив" Москва`, `Panthessalonikios
Athlitikos Omilos Konstantinoupoliton`) that are displayed to players in the
Missing Eleven game. These names come straight from the transfermarkt CSVs and
are not user-friendly. We need to override a fixed, user-approved set of 38
team names with common short names during the data pipeline (seed) process, and
also correct the rows already present in the database.

## Context (verified)

- **DB**: PostgreSQL `footplay` on `localhost:5432`. Prisma model `Club`
  (`backend/prisma/schema.prisma`): `id` Int PK, `clubId` Int @unique, `name`
  String, `isNationalTeam` Boolean?.
- **Seed**: `backend/prisma/seed.ts`. Club names come from three sources:
  1. `processClubsDataset` — `scripts/data/clubs.csv` `row.name` (whitelisted
     clubs AND candidate opponents stored in `candidateClubOpponentsNameById`).
  2. `processNationsDataset` — `scripts/data/national_teams.csv` `row.name`.
  3. `processOpponentTeams` — fallback chain
     `clubName || nationName || gameName` where `gameName` comes from
     `games.csv` `home_club_name`/`away_club_name`.
  - All teams (clubs + nations + opponents) are deduped by `clubId` in `main()`
    (first occurrence wins, national-team flag preserved) and inserted via
    `toClubData`.
- **Existing pattern to mirror**: `scripts/src/competition-names.ts` exports
  `normalizeCompetitionName(competitionId, name)` with an `OVERRIDES` map keyed
  by `competitionId`, used in `seed.ts`. A similar `team-names.ts` module keyed
  by `clubId` is the natural fit.
- **`scripts/src/name-cleaning.ts`** only cleans player display names; it does
  not touch club names.
- **DB current state (verified)**: all 38 Tier 1 `clubId`s exist in the `Club`
  table with the raw names. `isNationalTeam` is `f` for all 38 (none are
  national teams).
- **Seed idempotency (verified, updated)**: `main()` in `seed.ts` now starts
  with a transactional FK-safe reset (`Appearance` → `Game` → `Player` →
  `Club` → `Competition`), then repopulates. This makes `npm run seed`
  idempotent — safe to run against a populated DB.
- **Frontend**: `frontend/lib/curatedTeams.ts` mirrors `scripts/curated-teams.json`
  and exports only `CURATED_TEAM_IDS` (a `Set<number>` of ids), **not** names.
  Team names are displayed from the API/DB. No frontend change is expected.

## Objective

Introduce a single, central team-name override mechanism keyed on `clubId`
(unique) that:

1. Corrects the 38 Tier 1 team names during the seed pipeline for **all three**
   name sources (clubs.csv, national_teams.csv, games.csv fallback).
2. Corrects the **existing** rows already in the database.
3. Lives in code/config separate from `scripts/curated-teams.json` (which is a
   whitelist of targeted teams and must not be touched).

## Non-goals

- **No Tier 2** overrides. Scope is strictly the 38 Tier 1 names.
- **No national-team name changes** — all 8 national team names are already
  clean and none of the 8 national-team `clubId`s (3300, 3375, 3377, 3262,
  3299, 3376, 3437, 3439) appear in the Tier 1 list.
- **No schema changes** — `Club` model is unchanged.
- **No frontend changes** — names are displayed from the API/DB.
- **No changes to `scripts/curated-teams.json`** or `frontend/lib/curatedTeams.ts`.
- **No changes to `scripts/data/*.csv`** — overrides live in code/config, not
  by editing source data.
- **No name-cleaning of arbitrary names** — only the fixed 38 overrides.

## Inputs used

- `backend/prisma/seed.ts` (full read).
- `scripts/src/competition-names.ts` (pattern to mirror).
- `scripts/src/name-cleaning.ts` (confirmed: player-only).
- `scripts/curated-teams.json` (must remain untouched).
- `backend/prisma/schema.prisma` (Club model).
- `frontend/lib/curatedTeams.ts` (confirmed: ids only, no names).
- Live DB query confirming the 38 clubIds and their raw names.
- `backend/package.json` (seed script command), `scripts/tsconfig.json`,
  `tsconfig.base.json` (module resolution for the new file).

## Assumptions

- The 38 `clubId` → corrected-name pairs in the user-approved Tier 1 list are
  final and correct.
- `clubId` is a stable, unique key across all sources (clubs.csv,
  national_teams.csv, games.csv) — verified by the existing dedupe-by-clubId
  logic in `main()`.
- The override should apply to **any** team with a matching `clubId`,
  regardless of which source produced the name. Since none of the 38 are
  national teams, applying the override centrally (by clubId) will not affect
  national teams.
- The seed is run against a fresh/reset DB in normal operation; because it is
  now idempotent (transactional FK-safe reset at the start of `main()`), the
  existing-row fix is handled by re-running `npm run seed` (see Technical
  decisions).

## Requirements

### R1 — Override mapping module
- Create `scripts/src/team-names.ts` exporting:
  - `TEAM_NAME_OVERRIDES: Record<number, string>` — the 38 `clubId` → name
    pairs (keyed on `clubId`, never on name).
  - `normalizeTeamName(clubId: number, name: string): string` — returns the
    override if `clubId` is present, otherwise returns `name` unchanged.
- The mapping must be separate from `scripts/curated-teams.json`.

### R2 — Apply override centrally in the seed
- Apply `normalizeTeamName` at a single central point so **all three** sources
  (clubs.csv, national_teams.csv, games.csv fallback) are corrected.
- Preferred insertion point: in `toClubData(rows)` (or when building the final
  `uniqueClubs` array in `main()`), so every `Team` that reaches the DB has its
  name normalized by `clubId`. This avoids patching each source function.
- The override must be applied **after** dedupe (so the final name for a
  clubId is normalized regardless of which source won).

### R3 — Fix existing DB rows
- The existing-row fix is handled by re-running `npm run seed`. Because `main()`
  now begins with a transactional FK-safe reset of all dependent tables, the
  seed is idempotent and repopulates with the name overrides applied centrally
  in `toClubData`.

### R4 — No schema / frontend / curated-teams changes
- `backend/prisma/schema.prisma`, `frontend/lib/curatedTeams.ts`, and
  `scripts/curated-teams.json` must remain unchanged.

## Technical decisions

1. **Key on `clubId`, never on name.** `clubId` is unique and stable; names are
   not reliable keys (duplicates, diacritics, Cyrillic).
2. **Module location**: `scripts/src/team-names.ts` (mirrors
   `competition-names.ts`). The seed already imports from `../../scripts/src/...`,
   so this is consistent and survives re-seeds.
3. **Central application point**: `toClubData` (or the `uniqueClubs` build in
   `main()`). Rationale: single normalization function applied once, covering
   all three sources, applied after dedupe so the winning name is normalized.
4. **Existing-row fix**: re-run `npm run seed`. The seed's `main()` now begins
   with a transactional FK-safe reset (`Appearance` → `Game` → `Player` →
   `Club` → `Competition`) before repopulating, making it idempotent. The name
   overrides are applied centrally in `toClubData` during repopulation, so all
   38 rows are corrected without a separate script.
5. **No CSV edits.** Overrides live in code/config so they survive re-seeds and
   are not lost when data is re-downloaded.
6. **No national-team overrides.** None of the 38 ids are national teams, and
   the central application by clubId naturally leaves national teams untouched.

## UX/UI decisions

- None. This is a data-pipeline change; the visible effect is that the 38 team
  names render with their common short names in the game. No UI code changes.

## Acceptance criteria

- **AC-1**: `scripts/src/team-names.ts` exists and exports
  `TEAM_NAME_OVERRIDES` containing exactly the 38 Tier 1 `clubId` → name pairs
  and a `normalizeTeamName(clubId, name)` function.
- **AC-2**: `scripts/curated-teams.json` is byte-for-byte unchanged.
- **AC-3**: `frontend/lib/curatedTeams.ts` is unchanged.
- **AC-4**: `backend/prisma/schema.prisma` is unchanged (no schema changes).
- **AC-5**: The seed applies the override centrally so that a fresh seed
  produces the corrected name for all 38 clubIds (verified via SQL after seed).
- **AC-6**: Re-running `npm run seed` (idempotent reset + repopulate) corrects
  all 38 rows currently in the DB (verified via SQL before/after running the
  seed).
- **AC-7**: No national team name is changed (all 8 national team names remain
  as-is).
- **AC-8**: The override is keyed on `clubId` only; no name-based matching.

## Validation plan

1. **Type-check / build**: `npx tsc --noEmit` in `backend` (or the seed's
   tsconfig) and `npx tsc --noEmit` in `scripts` to confirm the new module
   compiles and the seed imports resolve.
2. **Existing-row fix** (recommended path):
   - Run `npm run seed` in `backend` (idempotent reset + repopulate).
   - Verify with SQL:
     ```sql
     SELECT "clubId", name FROM "Club"
     WHERE "clubId" IN (932,114,12,398,2441,683,265,1091,189,209,1775,614,
                        69261,1023,537,2462,210,1025,1114,51828,1044,1101,
                        496,501,687,1293,195,409,2036,122,4172,2068,10948,
                        964,2700,976,3336,339)
     ORDER BY "clubId";
     ```
     Expect the corrected short names for all 38 rows.
   - Verify national teams unchanged:
     ```sql
     SELECT "clubId", name FROM "Club"
     WHERE "clubId" IN (3300,3375,3377,3262,3299,3376,3437,3439) ORDER BY "clubId";
     ```
3. **Fresh-seed path** (now the same as the existing-row fix): `npm run seed`
   in `backend` performs the transactional FK-safe reset and repopulates with
   the overrides applied centrally in `toClubData`. Run the same SQL
   verification above. Confirm the 38 names are corrected and national teams
   unchanged.
4. **curated-teams.json untouched**: `git diff -- scripts/curated-teams.json`
   shows no changes.

## Risks / edge cases

- **clubId collisions**: The dedupe in `main()` is by `clubId` (first wins,
  national flag preserved). Applying the override centrally after dedupe
  guarantees the final name is normalized regardless of source. Low risk.
- **games.csv fallback names**: Opponent teams whose name comes only from
  `games.csv` (no clubs.csv/national_teams.csv entry) are still normalized by
  `clubId` because the override is applied centrally. If any of the 38 ids is
  such a fallback-only team, it is still corrected. (Verified: all 38 exist in
  the DB already, so they are covered.)
- **Re-seed idempotency**: The seed is now idempotent — `main()` begins with a
  transactional FK-safe reset (`Appearance` → `Game` → `Player` → `Club` →
  `Competition`) before repopulating. The existing-row fix is therefore a plain
  `npm run seed` (reset + repopulate), not a separate update script.
- **National teams**: None of the 38 ids are national teams, and the central
  application is keyed on clubId, so national teams are unaffected. If a future
  override id collides with a national team id, the national-team flag is
  preserved by the existing dedupe logic, but the name would be overridden —
  flag this as a future consideration (out of scope now).
- **Diacritics / encoding**: Corrected names use plain ASCII/UTF-8 (e.g.
  `Beşiktaş`). No normalization of diacritics is applied to overrides (they are
  literal strings). Low risk.
- **Duplicate override ids**: The mapping must have exactly 38 unique keys; a
  duplicate key would silently overwrite. Add a validation/assertion in the
  module or a test to catch duplicate keys.

## Atomic tasks / vertical slices

### Task 1 — Create the override mapping module
- Create `scripts/src/team-names.ts` with `TEAM_NAME_OVERRIDES` (38 entries)
  and `normalizeTeamName(clubId, name)`.
- Add a guard/assertion that the mapping has exactly 38 unique keys (fail fast
  on duplicates).
- **AC**: module compiles; mapping has 38 unique keys; `normalizeTeamName`
  returns override for a known id and passes through unknown ids.

### Task 2 — Apply override centrally in the seed
- Edit `backend/prisma/seed.ts` to import `normalizeTeamName` and apply it in
  `toClubData` (or when building `uniqueClubs` in `main()`), so all three
  sources are normalized after dedupe.
- **AC**: a fresh seed produces corrected names for all 38 clubIds; national
  teams unchanged; no per-source patching.

### Task 3 — Idempotent seed reset for existing rows
- Ensure `main()` in `backend/prisma/seed.ts` begins with a transactional
  FK-safe reset (`Appearance` → `Game` → `Player` → `Club` → `Competition`)
  before repopulating, so `npm run seed` is idempotent and corrects existing
  rows.
- **AC**: running `npm run seed` updates all 38 existing rows; idempotent (safe
  to re-run); national teams untouched.

### Task 4 — Validation & verification
- Run the validation plan (type-check, `npm run seed`, SQL verification,
  `git diff` on curated-teams.json).
- **AC**: all acceptance criteria pass.

## Auto-Forecast

- `estimated_scope`: **small** (new module ~50 lines + small seed edit + the
  idempotent reset in `main()`; well under 400 lines total).
- `affected_files`:
  - `scripts/src/team-names.ts` (new)
  - `backend/prisma/seed.ts` (edit: import + central apply + idempotent reset in
    `main()`)
  - NOT `scripts/curated-teams.json`, NOT `frontend/lib/curatedTeams.ts`, NOT
    `backend/prisma/schema.prisma`.
- `suggested_phases`: **none** (scope is small).

---

## Task Contract

- `objective`: Add a central, clubId-keyed team-name override mechanism that
  corrects the 38 Tier 1 team names both in the seed pipeline (all three name
  sources) and in the existing DB rows, without touching
  `scripts/curated-teams.json`, the frontend, or the schema.
- `success_criteria`:
  - `scripts/src/team-names.ts` exports `TEAM_NAME_OVERRIDES` (38 unique
    clubId→name pairs) and `normalizeTeamName`.
  - Seed applies the override centrally; a fresh seed yields corrected names
    for all 38 clubIds.
  - Existing DB rows corrected via re-running `npm run seed` (idempotent reset +
    repopulate), SQL-verified.
  - `scripts/curated-teams.json`, `frontend/lib/curatedTeams.ts`, and
    `backend/prisma/schema.prisma` unchanged.
  - No national team names changed.
- `non_goals`: Tier 2 overrides; national-team name changes; schema changes;
  frontend changes; editing `scripts/data/*.csv`; touching
  `scripts/curated-teams.json`.
- `assumptions`: The 38 Tier 1 pairs are final; `clubId` is a stable unique key;
  the override applies to any team with a matching clubId (none are national
  teams); the seed is idempotent (transactional FK-safe reset at the start of
  `main()`), so existing rows are fixed by re-running `npm run seed`.
- `open_questions`: none.
- `accepted_tradeoffs`: Existing rows are fixed by re-running `npm run seed`
  (idempotent reset + repopulate) rather than a separate update script. The
  override mapping lives in a single module (`scripts/src/team-names.ts`) shared
  by the seed, so there is a single source of truth.
- `validation`: `npx tsc --noEmit` in `backend` and `scripts`; run `npm run
  seed`; SQL query over the 38 clubIds expecting corrected names; SQL query over
  the 8 national team ids expecting unchanged names; `git diff --
  scripts/curated-teams.json` empty.
- `ask_abort_triggers`: If any Tier 1 clubId is missing from the DB (seed would
  not produce a corrected row for it), or if any of the 38 ids turns out to be a
  national team, stop and ask before proceeding.

---

## Result Contract

- `status`: `pass` (spec created; no blocking issues found).
- `summary`: Produced a scoped implementation spec for a clubId-keyed team-name
  override mechanism covering the 38 Tier 1 names, applied centrally in the
  seed and corrected for existing rows via the idempotent `npm run seed` reset
  (transactional FK-safe reset at the start of `main()`). Verified DB state
  (all 38 ids present, none national teams) and confirmed the seed is now
  idempotent, which drives the existing-row approach.
- `artifacts`: `docs/v0.1/dev-2-team-name-overrides.md` (this spec).
- `next_recommended`: `lead` to delegate implementation to `developer` (scope is
  small), then `reviewer` for diff review.
- `risks`: none blocking. Future consideration: if a future override id ever
  collides with a national-team id, the name would be overridden while the flag
  is preserved — out of scope now.
- `skill_resolution`: No `Skill Resolution` block was present in the handoff, so
  fell back to the global `<available_skills>` list. Reviewed
  `api-and-interface-design` (module boundary for `team-names.ts`), but no skill
  was strictly required for a spec-only task; no skill was loaded. No
  implementation, security, or TDD skill was applicable to producing a spec.
