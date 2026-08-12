# Development 2: Data Pipeline

**Status**: `ready for implementation`
**Source**: `docs/v0.1/plan-v1.0-decomposition.md` (Development 2)
**Estimated Effort**: M (4-5 days)

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

**Position mapping**: ONE service — `backend/src/services/positionMapping.ts` — produces all tactic-board coordinates. Its primary logic is formation-aware slot fitting (hand-mapped 11-slot layouts per formation, tolerant per-slot preference fitting); the static position→coords dictionary (locked fallback chain incl. the `sub_position` upgrade rule) is the internal fallback for missing/unparseable formations and unmatched players. See Task 2.4.

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

### Task 2.4: Position & formation mapping service

**Note**: ONE task, ONE service. The formation-aware slot fitting is the primary logic; the static position→coords dictionary is the internal fallback inside the same module. Contract locked by data analysis of the real transfermarkt CSVs and the seeded DB. Replaces the original Task 2.4 and the earlier separate formation-mapper plan (no separate deliverable exists).

- **Description**: Build the single tactic-board positioning service in `backend/src/services/positionMapping.ts`. When a side renders: if the side's formation is present and parseable, fit the starting XI into the formation's hand-mapped 11-slot layout (exact → tolerant → static fallback, all internal); if formation is missing/null/unparseable, fall back directly to static per-appearance coordinates. The position value selection chain stays locked: appearance position → player `sub_position` (upgrade rule for group positions) → player position → default {50,50}. Data-grounded: naive a-b-c(-d) parsing fits 5.93–21.14% of sides exactly; the formation-aware approach reaches 66.53% band-exact / 92.56% feasible on the 19,908 seeded full-XI samples. Implements in slices: (A) static dictionary + resolution chain + stats, (B) slot dictionary + 29-layout table + generic parser, (C) 4-pass fitter + stats, (D) read-only sweep + tuning to targets.
- **Files to create/modify**:
  - `backend/src/services/positionMapping.ts` — ONE module (currently a 0-byte placeholder, untracked, no callers). No separate formation-mapping file.
- **Public interface (LOCKED)** — all named exports from the single module; consumed by the dev-3 API (per-appearance coords) and dev-4 board (formation-aware positions):
  - `getPositionCoords(position: string, subPosition?: string): { x: number; y: number }` — static per-appearance mapping (dev-3 contract; also the internal fallback for unmatched players and static mode)
  - `getPositionMappingStats()` — static-mapping counters
  - `getFormationFamily(formation: string | null | undefined): FormationFamily`
  - `getFormationSlots(formation: string | null | undefined): FormationSlot[]` — `[]` => static mode
  - `fitStartingXI(lineup: LineupPlayer[], formation?: string | null): FittedPlayer[]`
  - `getFormationMappingStats()` — formation-fitting counters

  ```typescript
  export type FormationBand = 'GK' | 'DEF' | 'DM' | 'MID' | 'FWD';
  export type FormationFamily = '3-band' | 'dm-4-band' | 'mid-4-band' | 'unknown';
  export type FitQuality = 'exact' | 'tolerant' | 'static';

  export interface Coords { x: number; y: number }

  export interface FormationSlot {
    id: string;              // 'GK' | 'CB1' | 'CB2' | 'CB3' | 'LB' | 'RB' | 'DM1' | 'DM2' | 'DM3'
                             // | 'CM1' | 'CM2' | 'CM3' | 'LM' | 'RM' | 'AM' | 'AM1' | 'AM2'
                             // | 'LW' | 'RW' | 'SS' | 'CF1' | 'CF2' | 'CF3'
    band: FormationBand;     // per slot INSTANCE (same id may have different band across formations)
    coords: Coords;          // final slot coordinates (0-100, same orientation as the static dictionary)
    preferredPositions: string[]; // ordered, best first, matched case-insensitively
  }

  export interface LineupPlayer {
    playerId: number;
    position: string | null; // appearance position ONLY (drives fitting; subPosition never does)
  }

  export interface FittedPlayer extends LineupPlayer {
    slotId: string | null;      // null in static mode
    band: FormationBand | null; // null in static mode
    fitQuality: FitQuality;
    coords: Coords;             // slot coords when exact/tolerant; getPositionCoords result when static
  }

  export interface FormationMappingStats {
    sidesFitted: number;
    exactPlayers: number;   // rows
    tolerantPlayers: number;
    staticPlayers: number;
    unknownFormations: Record<string, number>; // normalized formation value -> count
  }
  ```

  Contract rules: never throws; x/y are 0–100 percentages (**Y: 0 = top/attacking end, 100 = bottom/own goal; X: 0 = left, 100 = right**); `fitStartingXI` accepts 0–11 entries (the caller enforces the full-XI render rule — a side renders only with a full XI; formation is needed only when rendering that side; missing formation + full XI → static coords directly, never crashes); output in input order (determinism; ties by input order); `getFormationSlots` returns exactly 11 slots for recognized formations, `[]` otherwise; module must load from CommonJS `require()` via ts-node (ESM syntax compiles to CJS, no import extensions); outputs are plain data — no side effects beyond counters + deduplicated warnings.
- **Behavior (decision flow)**:
  1. **Formation present AND parseable** → formation slot fitting: `fitStartingXI` runs exact fit → tolerant fit → static fallback internally for unmatched players.
  2. **Formation missing / null / unparseable** → static coords directly: each player gets `getPositionCoords(position ?? '')` (selection chain below). Never crashes.
- **Internal structure** (implementation guidance — NOT separate deliverables; everything lives inside the one module):
  - `POSITION_COORDS` — 13-entry static dictionary + group fallback map
  - resolution chain function — the 6 steps below
  - `SLOT_DICTIONARY` — slot ids, coords, bands, per-slot preference orders
  - `FORMATION_LAYOUTS` — 29 hand-mapped 11-slot layouts
  - `familyBand(position, family)` — position→band map per family
  - generic band parser for unlisted formations
  - fitter passes 0–3 (static mode, GK first, greedy deficit-filling, repair)
  - module-level counters + deduplicated warnings
- **Static coordinate dictionary** — 13 precise values (matches plan ADR-005; **Goalkeeper y = 90** — the dev-3 doc example `{x: 50, y: 92}` is a TYPO, do not propagate):

  | Position | x | y |
  |---|---|---|
  | Goalkeeper | 50 | 90 |
  | Centre-Back | 50 | 72 |
  | Left-Back | 10 | 60 |
  | Right-Back | 90 | 60 |
  | Defensive Midfield | 50 | 50 |
  | Central Midfield | 50 | 45 |
  | Attacking Midfield | 50 | 35 |
  | Left Midfield | 15 | 42 |
  | Right Midfield | 85 | 42 |
  | Left Winger | 15 | 25 |
  | Right Winger | 85 | 25 |
  | Centre-Forward | 50 | 15 |
  | Second Striker | 50 | 25 |

- **Group fallback**: Goalkeeper→{50,90} (listed for completeness — resolves as a precise value), Defender→{50,72}, Midfield→{50,45}, **`midfield` (lowercase — real data!)→{50,45}**, Attack→{50,15}, **Sweeper→{50,72}** (defender-group coords — product call, DECIDED).
- **Position value selection chain (6 steps, LOCKED)** — applied inside `getPositionCoords` (per-appearance contract and static fallback):
  1. **Normalize**: trim whitespace; match case-insensitively. No spelling-synonym table beyond case ('Center-Back' is NOT recognized).
  2. **Exact match** in the 13-value dictionary → return coords.
  3. **Upgrade rule**: `position` is a group value (Attack / `midfield` / Defender / Midfield / Sweeper) AND `subPosition` provided AND `subPosition` is one of the 13 precise values → return subPosition's coords. (Measured strictly positive: +549 rows full dataset, +137 on seed, 0 unmapped.)
  4. **Group fallback**: `position` is a group value → group coords. No strict fallthrough (a strict rule would unmap 13,212 full-dataset rows — rejected).
  5. **subPosition fallback**: `position` unresolved (unknown/empty) AND `subPosition` provided → resolve subPosition as a position string (precise → coords; group → group coords).
  6. **Final default**: {50, 50}.
- **Fallback chain (approved)**: Appearance.position → Player.subPosition → Player.position → default. The locked 2-arg `getPositionCoords` signature cannot carry `Player.position` — that last link is applied by CALLERS (dev-3 passes player.position as `position` when appearance position is empty). Measured impact: 0 rows in the full dataset; unreachable in the seed.
- **Slot dictionary** (coordinates + per-slot preference orders). X rule for multi-slots of a kind: 2 slots → 40/60; 3 slots → 35/50/65; single → 50; y fixed per slot id:

  | Slot id | coords | Band family membership | preferredPositions (ranked, case-insensitive) |
  |---|---|---|---|
  | GK | {50,90} | GK | [Goalkeeper] |
  | CB1 / CB2 | {30,72} / {70,72} | DEF | [Centre-Back, Sweeper, Defender, Left-Back, Right-Back] |
  | CB3 | {50,72} | DEF | [Centre-Back, Sweeper, Defender, Left-Back, Right-Back] |
  | LB | {10,60} | DEF | [Left-Back, Centre-Back, Defender, Left Midfield, Left Winger] |
  | RB | {90,60} | DEF | [Right-Back, Centre-Back, Defender, Right Midfield, Right Winger] |
  | DM1 / DM2 / DM3 | {40,50} / {60,50} / {50,50} | DM (dm-4-band); MID otherwise | [Defensive Midfield, Central Midfield, Midfield, Left Midfield, Right Midfield] |
  | CM1 / CM2 / CM3 | {40,45} / {60,45} / {50,45} | MID | [Central Midfield, Defensive Midfield, Attacking Midfield, Midfield, Left Midfield, Right Midfield] |
  | LM | {15,42} | MID | [Left Midfield, Left Winger, Central Midfield, Attacking Midfield, Midfield] |
  | RM | {85,42} | MID | [Right Midfield, Right Winger, Central Midfield, Attacking Midfield, Midfield] |
  | AM / AM1 / AM2 | {50,35} / {40,35} / {60,35} | MID | [Attacking Midfield, Second Striker, Central Midfield, Left Winger, Right Winger] (approved: AM > SS > CM > LW) |
  | LW | {15,25} | FWD (3-band); MID (dm-4-band) | [Left Winger, Left Midfield, Attacking Midfield, Second Striker, Centre-Forward, Attack] |
  | RW | {85,25} | FWD (3-band); MID (dm-4-band) | [Right Winger, Right Midfield, Attacking Midfield, Second Striker, Centre-Forward, Attack] |
  | SS | {50,25} | FWD | [Second Striker, Centre-Forward, Attacking Midfield, Left Winger, Right Winger] |
  | CF1 / CF2 / CF3 | {40,15} / {60,15} / {50,15} | FWD | [Centre-Forward, Second Striker, Attacking Midfield, Left Winger, Right Winger, Attack] |

  Position → family band map (used for `fitQuality` 'exact' evaluation and generic parsing):

  | Position | 3-band | dm-4-band | mid-4-band |
  |---|---|---|---|
  | Goalkeeper | GK | GK | GK |
  | Centre-Back, Left-Back, Right-Back, Defender, Sweeper | DEF | DEF | DEF |
  | Defensive Midfield | MID (folds) | DM | MID (folds) |
  | Central Midfield, Attacking Midfield, Left Midfield, Right Midfield, Midfield, `midfield` | MID | MID | MID |
  | Left Winger, Right Winger | FWD | MID | FWD |
  | Centre-Forward, Second Striker, Attack | FWD | FWD | FWD |

- **Layout table — all 29 seed formations** (verified combined home+away counts; format `formation (count) : GK | DEF | DM | MID | FWD`; every row = 11 slots; slot ids from the dictionary):

  **3-band family (DEF/MID/FWD; DM folds into MID; wingers→FWD):**

  | Formation | Count | Layout |
  |---|---|---|
  | 4-4-2 | 663 | GK \| CB1 CB2 LB RB \| LM CM1 CM2 RM \| CF1 CF2 |
  | 4-4-2 double 6 | 1,877 | GK \| CB1 CB2 LB RB \| DM1 DM2 LM RM \| CF1 CF2 |
  | 4-4-2 Diamond | 151 | GK \| CB1 CB2 LB RB \| DM1 LM RM AM \| CF1 CF2 (diamond midfield + 2 strikers) |
  | 4-3-3 | 20 | GK \| CB1 CB2 LB RB \| CM1 CM2 CM3 \| LW RW CF1 |
  | 4-3-3 Attacking | 4,550 | GK \| CB1 CB2 LB RB \| CM1 CM2 CM3 \| LW RW CF1 |
  | 4-3-3 Defending | 251 | GK \| CB1 CB2 LB RB \| CM1 CM2 CM3 \| LW RW CF1 |
  | 4-5-1 | 21 | GK \| CB1 CB2 LB RB \| DM1 LM CM1 CM2 RM \| CF1 |
  | 4-5-1 flat | 67 | GK \| CB1 CB2 LB RB \| DM1 LM CM1 CM2 RM \| CF1 |
  | 3-5-2 | 147 | GK \| CB1 CB2 CB3 \| DM1 CM1 CM2 LM RM \| CF1 CF2 |
  | 3-5-2 flat | 1,488 | GK \| CB1 CB2 CB3 \| DM1 CM1 CM2 LM RM \| CF1 CF2 |
  | 3-5-2 Attacking | 24 | GK \| CB1 CB2 CB3 \| DM1 CM1 CM2 LM RM \| CF1 CF2 |
  | 5-3-2 | 364 | GK \| CB1 CB2 CB3 LB RB \| CM1 CM2 CM3 \| CF1 CF2 |
  | 5-4-1 | 465 | GK \| CB1 CB2 CB3 LB RB \| LM CM1 CM2 RM \| CF1 |
  | 5-4-1 Diamond | 15 | GK \| CB1 CB2 CB3 LB RB \| DM1 LM RM AM \| CF1 |
  | 5-2-3 | 5 | GK \| CB1 CB2 CB3 LB RB \| DM1 DM2 \| LW RW CF1 |
  | 4-2-4 | 4 | GK \| CB1 CB2 LB RB \| DM1 DM2 \| LW RW CF1 CF2 |
  | 3-6-1 | 5 | GK \| CB1 CB2 CB3 \| DM1 CM1 CM2 LM RM AM \| CF1 |
  | 3-4-3 | 746 | GK \| CB1 CB2 CB3 \| LM CM1 CM2 RM \| LW RW CF1 |
  | 3-4-3 Diamond | 14 | GK \| CB1 CB2 CB3 \| DM1 LM RM AM \| LW RW CF1 |

  **DM-type 4-band (DEF/DM/MID/FWD; wingers/AM→MID):**

  | Formation | Count | Layout |
  |---|---|---|
  | 4-2-3-1 | 5,863 | GK \| CB1 CB2 LB RB \| DM1 DM2 \| LW AM RW \| CF1 |
  | 4-1-4-1 | 1,163 | GK \| CB1 CB2 LB RB \| DM1 \| LM CM1 CM2 RM \| CF1 |
  | 4-1-3-2 | 164 | GK \| CB1 CB2 LB RB \| DM1 \| LM AM RM \| CF1 CF2 |
  | 3-1-4-2 | 85 | GK \| CB1 CB2 CB3 \| DM1 \| LM CM1 CM2 RM \| CF1 CF2 |
  | 3-3-3-1 | 4 | GK \| CB1 CB2 CB3 \| DM1 DM2 DM3 \| CM1 CM2 CM3 \| CF1 |

  **MID-type 4-band (DEF/MID+AM/FWD):**

  | Formation | Count | Layout |
  |---|---|---|
  | 3-4-2-1 | 1,054 | GK \| CB1 CB2 CB3 \| LM CM1 CM2 RM \| AM1 AM2 \| CF1 |
  | 4-3-1-2 | 521 | GK \| CB1 CB2 LB RB \| CM1 CM2 CM3 \| AM \| CF1 CF2 |
  | 4-4-1-1 | 335 | GK \| CB1 CB2 LB RB \| LM CM1 CM2 RM \| SS CF1 |
  | 3-4-1-2 | 281 | GK \| CB1 CB2 CB3 \| LM CM1 CM2 RM \| AM \| CF1 CF2 |
  | 4-3-2-1 | 92 | GK \| CB1 CB2 LB RB \| CM1 CM2 CM3 \| AM1 AM2 \| CF1 |

  The counts are formation-value side-counts (home + away) across all 10,220 seeded games; the acceptance sweep's 19,908 samples are the subset of these sides with a full XI and non-empty formation (see Validation below).
- **Unknown / unlisted formations**: normalize (trim + lowercase); strip a leading `starting line-up:` prefix if present (raw-data quirk, ~70 rows in raw games.csv); table hit → layout; miss → generic band parse using ONLY slot ids/coords/preferences from the dictionary:
  - 3 bands a-b-c → 3-band layout: DEF×a, MID×b, FWD×c. DEF slots: a=5→CB1,CB2,CB3,LB,RB; a=4→CB1,CB2,LB,RB; a=3→CB1,CB2,CB3; a=2→CB1,CB2. MID slots: b=6→DM1,CM1,CM2,LM,RM,AM; b=5→DM1,CM1,CM2,LM,RM; b=4→LM,CM1,CM2,RM; b=3→CM1,CM2,CM3; b=2→DM1,DM2. FWD slots: c=5→LW,RW,CF1,CF2,SS; c=4→LW,RW,CF1,CF2; c=3→LW,RW,CF1; c=2→CF1,CF2; c=1→CF1; c=0→(none).
  - 4 bands a-b-c-d → family heuristic: second band b ≤ 2 → dm-4-band (DEF×a, DM×b, MID×c, FWD×d; MID slots: c=4→LM,CM1,CM2,RM; c=3→LW,AM,RW; c=2→AM1,AM2; c=1→AM); b ≥ 3 → mid-4-band (DEF×a, MID×b, AM×c, FWD×d; MID slots: b=4→LM,CM1,CM2,RM; b=3→CM1,CM2,CM3; AM slots: c=2→AM1,AM2; c=1→AM). (3-3-3-1 is explicitly in the table, so the heuristic never sees it.)
  - 2 bands → treat as 3-band with c=0 (e.g. 5-5-0).
  - **≥5 bands, non-numeric residue, or unparseable → `unknown` family → `getFormationSlots` returns `[]` → static mode** (must not crash; every player gets `getPositionCoords(position ?? '')`, fitQuality 'static', slotId null).
- **Fitting algorithm (`fitStartingXI` — 4 passes)**:
  1. **Pass 0 — static mode**: formation null/empty, or slots = [] → all players static (coords = `getPositionCoords(position ?? '')`; precise positions keep their own coords — "static" refers to assignment mode, not the {50,50} default).
  2. **Pass 1 — GK first** (100% reliable in data: 0 samples with GK ≠ 1): exactly one 'Goalkeeper' → slot GK; zero GKs → first entry (input order) to GK (becomes 'static'); more than one → first to GK, rest flow through Pass 2.
  3. **Pass 2 — greedy deficit-filling in band order** DEF (listed slot order) → DM → MID → FWD: each slot picks the best remaining player by its `preferredPositions` rank (case-insensitive; players absent from the list rank last; ties by input order; assigned players never re-picked).
  4. **Pass 3 — repair**: while any 'static'-assigned player exists and a swap would reduce statics without creating new ones, swap slot assignments (bounded: ≤ lineup-length iterations; O(n³) worst case — n iterations × n source players × n swap candidates). Needed to approach the measured 92.56% feasible ceiling.
  5. **fitQuality**: 'exact' iff `familyBand(position, family) === slot.band`; 'tolerant' iff position ∈ slot.preferredPositions but band differs (adjacent-band swap, e.g. DM in a CM slot, LW in a CF slot); 'static' otherwise (or Pass 0). **Only appearance position drives fitting** — subPosition NEVER influences fitting (subPosition-based fitting scores 22.59% vs 66.53%; subPosition only rescues unmappable appearance positions via the selection chain).
- **Stats / logging**: module-level counters for both paths — static: `exact`, `upgrade`, `groupFallback`, `subPositionFallback`, `default` (exported via `getPositionMappingStats()`); fitting: `sidesFitted`, exact/tolerant/static rows, `unknownFormations` map (exported via `getFormationMappingStats()`). `console.warn` deduplicated per genuinely unmapped position string (step 6), per unknown formation value, and per static-assigned position string.
- **Acceptance criteria** — static mapping group:
  - [ ] AC-2.4.1 **Full-seed coverage**: all 222,256 seeded appearances map to non-null coords with x,y ∈ [0,100] (swept with appearance `position` + player `subPosition`).
  - [ ] AC-2.4.2 **Expected values**: the 13 precise + 5 group inputs return exactly the values above (incl. lowercase `midfield` → {50,45}).
  - [ ] AC-2.4.3 **Upgrade rule on seed**: after the sweep, `getPositionMappingStats()` reports `upgrade = 137`, `default = 0`, and `exact + upgrade + groupFallback + subPositionFallback = 222,256`.
  - [ ] AC-2.4.4 **Edge cases**: unknown → {50,50}; `''` → {50,50}; `' Goalkeeper '` → {50,90}; `'Attack'` + subPosition `'Left Winger'` → {15,25}; `'Defender'` + `'Left-Back'` → {10,60}; `'Sweeper'` + `'Centre-Back'` → {50,72}.
  - [ ] AC-2.4.5 **getPositionCoords determinism**: identical inputs → identical outputs.
  - [ ] AC-2.4.6 **Lint/build**: `npx eslint backend/src` clean (no new warnings); `npx tsc --noEmit` (backend tsconfig) passes — one module covers both code paths.
  - [ ] AC-2.4.7 **Module interop**: module loads from CommonJS `require()` via ts-node with ALL named exports (`getPositionCoords`, `getPositionMappingStats`, `getFormationFamily`, `getFormationSlots`, `fitStartingXI`, `getFormationMappingStats`).
  - **Acceptance criteria** — formation fitting group:
  - [ ] AC-2.4.8 **All 29 layouts valid**: `getFormationSlots` returns exactly 11 slots for each of the 29 seed formation values (case-insensitive lookup, e.g. '4-3-3 ATTACKING' works), no duplicate slot ids per layout.
  - [ ] AC-2.4.9 **Static fallback never crashes**: `fitStartingXI(11 players, null)`, `fitStartingXI(11, '')`, `fitStartingXI(11, '2-3-5-1-1')` (5 bands), `fitStartingXI(11, 'banana')` each return 11 FittedPlayers with non-null in-range coords, all 'static', no throw.
  - [ ] AC-2.4.10 **Band-exact rate ≥ 66%** on the 19,908 seeded full-XI samples with parseable formation (reference: 66.53%). A side is band-exact iff all 11 players are 'exact'.
  - [ ] AC-2.4.11 **Feasible rate ≥ 92%** (reference ceiling: 92.56%): sides where all 11 players are 'exact' or 'tolerant'. If below 92%, tune preference lists / slot fill order and re-run — do not change the locked semantics.
  - [ ] AC-2.4.12 **GK always exact**: 0 GK mismatches across the sweep.
  - [ ] AC-2.4.13 **Per-formation diagnostics within ±5pp of reference**: 4-2-3-1 30.1%, 4-4-2 double 6 28.9%, 4-4-2 39.4%, 4-4-1-1 40%, 5-4-1 9.1%, 4-5-1 flat 19.0%; strong formations ≈100% (4-1-4-1, 4-3-3 variants, 3-4-3, 5-3-2, 4-3-1-2, 3-4-1-2, 4-1-3-2, 3-1-4-2), 3-5-2 flat 98.2%. Informational gate — investigate any large unexplained deviation.
  - [ ] AC-2.4.14 **Reference example**: game 2320446 away side (clubId 27, formation '4-1-4-1') fits fully 'exact' — wingers (Robben RW, Shaqiri LW) and Müller AM in MID-band slots, Schweinsteiger DM in the DM slot, Mandzukic CF in FWD.
  - [ ] AC-2.4.15 **Static assignments bounded**: ≈7–8% of sweep sides (≈1,480 of 19,908) report ≥ 1 static player (matching the 92.56% feasible ceiling); every player still gets non-null coords; no crashes on any sample.
  - [ ] AC-2.4.16 **fitStartingXI determinism**: identical input → identical output.
- **Validation** (from `backend/`; no test runner — ts-node one-liners + one temporary read-only script):
  1. Smoke: `npx ts-node -e "const { getPositionCoords, getFormationSlots } = require('./src/services/positionMapping'); console.log(JSON.stringify(getPositionCoords('Goalkeeper')), getFormationSlots('4-4-2').length);"` → `{"x":50,"y":90} 11`
  2. Key-values + edge cases: one `npx ts-node -e` script asserting AC-2.4.2/2.4.4 inputs, printing PASS/FAIL per case and a final ALL PASS line.
  3. Seed sweep: `npx ts-node -e` script using `pg` + `dotenv` (reads `backend/.env` `DATABASE_URL`): `SELECT a.position AS p, p."subPosition" AS sp, COUNT(*)::int AS c FROM "Appearance" a LEFT JOIN "Player" p ON p."playerId" = a."playerId" GROUP BY 1, 2`; call `getPositionCoords(r.p ?? '', r.sp ?? undefined)` once per distinct pair (deterministic per pair — covers all rows); assert in-range results and AC-2.4.3 stats.
  4. 29-layout check: one-liner iterating the 29 values asserting 11 slots each + no duplicate slot ids (AC-2.4.8).
  5. Edge checks: one-liner for AC-2.4.9.
  6. **Read-only sweep** (AC-2.4.10…13, 2.4.15): temporary script `backend/validate-formation-mapping.ts` (outside `src/`, not part of the build; delete after passing). Behavior: SQL — appearances joined to games, group by `(gameId, clubId)` keeping only exactly-11 groups with non-empty side formation (≈19,908 samples); per side run `fitStartingXI(players, formation)`; classify band-exact / feasible / infeasible; track GK correctness; accumulate per-formation exact rates; assert the AC thresholds; also print per-game both-sides-exact for reference (measured 43.6%).
  7. Bayern example (AC-2.4.14): query game 2320446 away lineup (clubId 27) + '4-1-4-1', assert all 11 'exact', print slot assignments.
  8. Determinism (AC-2.4.5/2.4.16): fit the same input twice and diff; repeat a getPositionCoords call.
  9. `npx eslint backend/src` and `npx tsc --noEmit` (AC-2.4.6/2.4.7).

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

## Dependencies

- **Dev 1 (Repo Scaffold & Prisma Schema)** — Prisma schema must exist, PostgreSQL must be running
- **Dev 3 (Core REST API) / Dev 4 (Frontend)** — dev-3's API and dev-4's board consume the exported functions of `backend/src/services/positionMapping.ts` (`getPositionCoords`, `getFormationSlots`, `fitStartingXI`). The module reads no DB directly; data is passed in by callers — it runs after the seed (Task 2.3) but has no runtime dependency on it.

---

## Effort Estimate

**M (4-5 days)** (total ≈ 4.5 days)

| Task                                      | Estimate                       |
| ----------------------------------------- | ------------------------------ |
| Task 2.1 (download script)                | 0.5 day                        |
| Task 2.2 (name normalization)             | 0.25 day                       |
| Task 2.3 (seed script + curated filtering) | 1.25 days                      |
| Task 2.4 (position & formation mapping)   | 1.5 days                       |
| Task 2.5 (verification)                   | 0.25 day                       |
| Task 2.6 (schema amendment)               | 0.25 day                       |
| Buffer                                    | 0.5 day                        |

Task 2.4 breakdown: static dictionary + resolution chain + stats (~0.5 day); types + slot dictionary + 29-layout table + generic parser (~0.35 day); fitter + stats (~0.3 day); read-only sweep + tuning to ≥66% / ≥92% targets (~0.35 day).

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
| Formation string variance (41.3% of seed values carry suffixes: "Attacking", "Defending", "flat", "Diamond", "double 6"; 72 values in raw data vs 29 in seed) | Medium | Medium | Hand-mapped 11-slot layout per seed value incl. every suffix variant (Task 2.4); generic band parser + static fallback + logging for unlisted values |
| Formation-family semantics (3-band vs DM-type / MID-type 4-band: where DM and wingers land) | Medium | Medium | Family band map + per-slot preference orders; validated against measured reference rates (66.53% band-exact / 92.56% feasible) |
| `sub_position` looks like a fitting source but is not (disagrees with appearance `position` frequently; subPosition-based fitting scores 22.59% vs 66.53%) | Medium | Medium | Locked rule: appearance position is the ONLY fitting input; subPosition only rescues unmappable appearance positions (Task 2.4 upgrade rule) |
| Greedy fitter variance vs the measured optimal-greedy ceiling (92.56% feasible) | Medium | Medium | Required repair pass (Pass 3); documented tuning levers (preference lists, slot fill order); per-formation diagnostics vs reference rates (AC-2.4.13) |

---

## Open / Deferred Decisions

1. **Exact curated-set composition** — the user decides the final team/nation list (config file `scripts/curated-teams.json`). Suggestion for v1: top-5 leagues + major national teams. "Change config → re-seed" per minigame.
2. **Missing-players policy** — assumption for now: lineups ⊆ `players.csv` coverage is sufficient (verified example: 21 of 8,988 missing). Decide later whether to backfill player rows from `game_lineups` `player_name`/`position`.
3. **Game ↔ Club relations** — add now (recommended, Task 2.6) or later.

**Resolved during specification (position mapping — locked, do not reopen)**:

1. **Sweeper coordinates** — DECIDED: defender-group coords {50,72} (back-line role; identical to the Defender group fallback).
2. **Final default for unknown/'' positions** — DECIDED: {50,50} (pitch center; 0 occurrences in seed — unmeasurable but harmless).
3. **Upgrade rule** — DECIDED: adopted (strictly positive: +549 rows full dataset / +137 on seed, 0 unmapped; strict group-fallthrough rejected — would unmap 13,212 rows).
4. **Player.position fallback placement** — DECIDED: applied at caller level (the locked 2-arg `getPositionCoords` signature cannot carry it; measured 0 rows resolve via player.position in the full dataset — unreachable in the seed).
5. **3-1-4-2 is a seed formation (85 sides)** — earlier 29-formation count lists omitted it; included in the layout table (Task 2.4). Related: the dev-3 doc's Goalkeeper `y: 92` example is a typo — accepted value is `y: 90` (fix opportunistically during dev-3).

---

## "Done" Checklist

- [ ] `npx prisma db seed` completes within 10 minutes
- [ ] Database reports the verified curated-example row counts (~23.5k matches, ~516k appearances, ~9k players, ~250-400 clubs incl. ≤ 124 national teams, ~8 competitions) — counts are config-dependent
- [ ] `national_teams.csv` downloaded by Task 2.1 (6 CSVs cached in `scripts/data/`)
- [ ] Every player has a non-null `display_name`
- [ ] No orphaned records (all foreign keys reference valid rows, incl. Appearance.clubId)
- [ ] Every match has at least 11 starting lineup appearances
- [ ] Every seeded team/player originates from the curated chain
- [ ] Position & formation mapping (Task 2.4): all 222,256 seeded appearances map to coordinates (AC-2.4.1; upgrade rule +137, default 0); ≥66% band-exact / ≥92% feasible / GK 0 mismatches on seeded samples (AC-2.4.10–2.4.12); all 29 seed formations produce valid 11-slot layouts; null/unknown formation → static without crash; game 2320446 Bayern 4-1-4-1 fits exactly (AC-2.4.14)
- [ ] `scripts/src/verify-data.ts` passes all checks (incl. filtering stats)
- [ ] All changes committed to `dev-2/*` branch
