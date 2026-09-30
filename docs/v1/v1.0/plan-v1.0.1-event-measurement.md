# Event Measurement & Seed Join Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `game_events.csv` becomes a required download, its dismissal / own-goal / shootout label vocabulary is *measured and recorded*, and `Appearance.goals` / `assists` / `redCards` are populated by the seed through a streaming join that never holds the ~1.27M event rows in memory.

**Architecture:** Two new pure, unit-tested modules under `backend/src/lib/` — `eventMapping.ts` (CSV vocabulary → `ParsedEventType`) and `appearanceEventJoin.ts` (`Map` of ~219k appearances → accumulated totals). The seed streams `game_events.csv` row by row, calls `index.accumulate()` per row, and writes the three columns via `createMany`. One `Map` keyed by `` `${gameId}:${playerId}` `` is the only structure; it is pre-populated to zeros from the appearance set, so its size is bounded by appearances (~219k), never by events (~1.27M).

**Tech Stack:** TypeScript, Node 20/24, `csv-parse` (streaming transform + `for await`), Prisma 7 (`createMany`, `$transaction`), Vitest + Testcontainers (backend coverage gate 95% on all four metrics).

## Global Constraints

- **No Prisma migration in this patch.** `Appearance.goals` / `assists` / `redCards` already exist with `@default(0)` (`backend/prisma/schema.prisma:74-76`) and the join key `game_id` + `player_id` already matches `@@unique([gameId, playerId])` (`backend/prisma/schema.prisma:82`). Touching `schema.prisma` in v1.0.1 is a defect.
- **R4 — memory.** Never build a `Map` (or array, or object) over all event rows. The only permitted structure is `AppearanceEventIndex`, which indexes **appearances**. Do not add an `Appearance` index, or any index, in this patch — v1.0.2 owns indexes and its list is closed.
- **R2 — dismissal encoding.** The matcher is whitespace-tolerant. The measured variant list is produced by a committed tool in Task 2, **not assumed**. `MEASURED_SENDING_OFF_DESCRIPTIONS` is pasted verbatim from that tool's output and tested with `it.each` over the **entire** list, never a sample. A sample test would pass while ~2,300 rows stayed wrong.
- **R3 — substitute goals are unjoinable.** `Appearance.type` is `starting_lineup` for 100% of rows. A goal by a substitute has no row to join to. This is permanent and is documented, not fixed.
- **O3 — shootout goals are NOT counted.** `classifyEvent` returns `'shootout_goal'`; `accumulate` adds nothing for it.
- **O4 — own goals are attributed to the event row's `player_id`.** `classifyEvent` returns `'own_goal'`; `accumulate` increments `goals`. Revisit only if the Task 2 measurement shows own goals recorded against a different player or not at all.
- **Unknown rows count nowhere.** Anything `classifyEvent` cannot recognise becomes `'other'`, and `'other'` adds nothing to any column. The failure direction is *absent, not wrong*.
- **The seed's shape is its own** (§3.2). It is a streaming join, not the request path. Do not copy a request-path shape in.
- **§3.4 — merging is safe.** `run_seed` defaults to `false` (`.github/workflows/deploy.yml:33-37`) and gates the seed (`:213`). Until an operator ticks it, the app runs on zeroed columns.
- **TDD mode: advisory_active.** Test first for all testable logic; red → green → refactor; report the commands and results.
- **Backend coverage gate:** `backend/vitest.config.ts:26-30` sets global thresholds of 95% on lines, statements, functions and branches. Every branch introduced by `eventMapping.ts` and `appearanceEventJoin.ts` must be exercised by a test.

---

### Task 1: Add `game_events.csv` to the download list

**Files:**
- Modify: `scripts/src/download-data.ts:9` (`REQUIRED_FILES`) and `:18` (`timeout`)

**Interfaces:**
- Consumes: nothing.
- Produces: `REQUIRED_FILES` now contains `'game_events.csv'`, so `npm run data-pipeline` writes `scripts/data/game_events.csv`. No new exported symbol.

**Steps:**

- [ ] **Step 1.1: Add the filename.**

  Edit `scripts/src/download-data.ts` line 9:

  ```ts
  const REQUIRED_FILES = ['players.csv','clubs.csv','games.csv','game_lineups.csv','game_events.csv','competitions.csv','national_teams.csv'];
  ```

- [ ] **Step 1.2: Raise the single-request download timeout.**

  The whole dataset ships as **one** zip (`DATA_URL`, `scripts/src/download-data.ts:7`) and `axios.get` is capped at `timeout: 120000` (`:18`). Adding ~170 MB of decompressed `game_events.csv` grows that one response. 120 s is not headroom, it is a coin flip on a cold R2 origin.

  Edit `scripts/src/download-data.ts` line 14-19:

  ```ts
  const response = await axios.get(DATA_URL, {
    responseType: 'arraybuffer',
    timeout: 600000,
  });
  ```

  *This is an addition beyond the frozen `REQUIRED_FILES` contract. It is required for the patch to function. Flagged for `lead` in the v1.0.1 report.*

- [ ] **Step 1.3: Type-check `scripts/`.**

  Run:

  ```bash
  cd scripts && npx tsc --noEmit -p tsconfig.json
  ```

  Expected: no output, exit code 0.

- [ ] **Step 1.4: Commit.**

  ```bash
  git add scripts/src/download-data.ts
  git commit -m "feat(data): download game_events.csv and raise the dataset fetch timeout"
  ```

**Verify:** `grep -n "game_events" scripts/src/download-data.ts` prints the new `REQUIRED_FILES` line.

---

### Task 2: Add the vocabulary measurement tool

The measured vocabulary is v1.0.1's deliverable, not a side effect (§3, §3.3). It must be re-runnable, because the owner is expanding the dataset (R9). This tool is committed and lives outside `backend/src/`, so the 95% coverage gate does not apply to it (`backend/vitest.config.ts:18` globs `src/**/*.ts`).

**Files:**
- Create: `backend/prisma/measure-event-vocabulary.ts`
- Modify: `backend/prisma/tsconfig.json` (`include`)
- Modify: `backend/package.json` (scripts)

**Interfaces:**
- Consumes: `scripts/data/game_events.csv` (raw, from Task 1). Does **not** import `eventMapping.ts` — that module does not exist yet, and measuring must not depend on the matcher it will validate.
- Produces: stdout, in a fixed section order (Step 2.5). The final section is a copy-pasteable TypeScript block for `MEASURED_SENDING_OFF_DESCRIPTIONS`.

**Steps:**

- [ ] **Step 2.1: Create `backend/prisma/measure-event-vocabulary.ts`.**

  ```ts
  /**
   * Measures the real label vocabulary in scripts/data/game_events.csv.
   *
   * Why this exists (roadmap §3, §3.3, R2): `redCards` is populated from a
   * free-text `description` column whose variants differ in spacing, not in
   * substance. The mapping in backend/src/lib/eventMapping.ts must be frozen
   * against MEASURED data, so this tool produces the measurement and, with
   * --apply, writes the exact constant into that module.
   *
   * It deliberately does NOT import eventMapping.ts: the measurement must be
   * independent of the matcher it validates.
   *
   * Run:  npm run measure-events -w backend              (report only)
   *       npm run measure-events -w backend -- --apply   (report, then write)
   */
  import { existsSync, createReadStream, readFileSync, writeFileSync } from 'fs';
  import path from 'path';
  import { parse } from 'csv-parse';

  const EVENTS_PATH = path.resolve(__dirname, '../../scripts/data/game_events.csv');
  const MAPPING_PATH = path.resolve(__dirname, '../src/lib/eventMapping.ts');
  const SENTINEL_START = '// --- BEGIN MEASURED ---';
  const SENTINEL_END = '// --- END MEASURED ---';

  /** Same collapse the matcher performs, so the tool reports the same keys. */
  function normalize(value: string | undefined): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  /** Substrings the reviewer must read; the tool buckets, never decides. */
  const REVIEW_BUCKETS: { label: string; needle: string }[] = [
    { label: 'sending-off (red)', needle: 'red' },
    { label: 'yellow card', needle: 'yellow' },
    { label: 'second yellow', needle: '2.' },
    { label: 'own goal', needle: 'own goal' },
    { label: 'shootout', needle: 'shootout' },
    { label: 'penalty', needle: 'penalt' },
    { label: 'substitution', needle: 'substitut' },
  ];

  /**
   * Rewrite the generated region of eventMapping.ts in place.
   *
   * The region is delimited by sentinels, so the generator never reformats,
   * reorders or reflows the hand-written code around it, and a re-run is
   * always a clean overwrite. It refuses to write when the file or either
   * sentinel is missing, so it can never clobber a file it does not
   * recognise — that is the failure mode a blind text replace would have.
   */
  function applyToEventMapping(initializer: string): void {
    if (!existsSync(MAPPING_PATH)) {
      console.error(`[measure-events] ${MAPPING_PATH} not found. Create it in Task 3 Step 3.5 first.`);
      process.exit(1);
    }

    const source = readFileSync(MAPPING_PATH, 'utf8');
    const start = source.indexOf(SENTINEL_START);
    const end = source.indexOf(SENTINEL_END);

    if (start === -1 || end === -1 || end < start) {
      console.error(
        `[measure-events] sentinels ${SENTINEL_START} / ${SENTINEL_END} not found in ${MAPPING_PATH}. Not writing.`
      );
      process.exit(1);
    }

    const next = `${source.slice(0, start + SENTINEL_START.length)}\n${initializer}\n  ${source.slice(end)}`;
    writeFileSync(MAPPING_PATH, next, 'utf8');
    console.log(`[measure-events] wrote ${MAPPING_PATH}`);
  }

  async function main(): Promise<void> {
    if (!existsSync(EVENTS_PATH)) {
      console.error(`${EVENTS_PATH} not found. Run: npm run data-pipeline`);
      process.exit(1);
    }

    const parser = createReadStream(EVENTS_PATH).pipe(
      parse({ columns: true, relax_column_count: true })
    );

    let rows = 0;
    let columns: string[] = [];
    const typeCounts = new Map<string, number>();
    const pairCounts = new Map<string, number>();
    const sendingOff = new Set<string>();

    for await (const row of parser) {
      rows++;
      if (columns.length === 0) columns = Object.keys(row as Record<string, unknown>);

      const rawType = String(row.type ?? '');
      const rawDescription = String(row.description ?? '');
      const normalizedDescription = normalize(rawDescription);

      typeCounts.set(rawType, (typeCounts.get(rawType) ?? 0) + 1);

      const pairKey = `${rawType} ||| ${rawDescription}`;
      pairCounts.set(pairKey, (pairCounts.get(pairKey) ?? 0) + 1);

      // "Red card" is the literal that catches 3,097 sendings; "2." marks the
      // ~2,300 second-yellow dismissals a naive matcher drops. Both are
      // collected verbatim so the reviewer sees every real spelling.
      if (normalizedDescription.includes('red') || normalizedDescription.includes('2.')) {
        sendingOff.add(rawDescription);
      }
    }

    const sorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);

    console.log('=== 1. COLUMNS ===');
    console.log(columns.join(','));
    console.log();

    console.log('=== 2. ROW COUNT ===');
    console.log(rows);
    console.log();

    console.log('=== 3. DISTINCT type VALUES ===');
    for (const [type, count] of sorted(typeCounts)) console.log(`${count}\t${JSON.stringify(type)}`);
    console.log();

    console.log('=== 4. DISTINCT (type, description) PAIRS, most frequent first ===');
    for (const [pair, count] of sorted(pairCounts)) console.log(`${count}\t${JSON.stringify(pair)}`);
    console.log();

    console.log('=== 5. REVIEW BUCKETS (substring buckets — inspect, do not trust) ===');
    for (const bucket of REVIEW_BUCKETS) {
      const hits = sorted(pairCounts).filter(([pair]) => normalize(pair).includes(bucket.needle));
      const total = hits.reduce((sum, [, count]) => sum + count, 0);
      console.log(`--- ${bucket.label} (needle "${bucket.needle}"): ${hits.length} distinct, ${total} rows ---`);
      for (const [pair, count] of hits) console.log(`  ${count}\t${JSON.stringify(pair)}`);
    }
    console.log();

    const initializer = [
      'export const MEASURED_SENDING_OFF_DESCRIPTIONS: string[] = [',
      ...[...sendingOff].sort().map((description) => `  ${JSON.stringify(description)},`),
      '];',
    ].join('\n');

    console.log('=== 6. MEASURED_SENDING_OFF_DESCRIPTIONS initializer ===');
    console.log(initializer);
    console.log();

    if (process.argv.includes('--apply')) {
      applyToEventMapping(initializer);
    } else {
      console.log('[measure-events] report only. Re-run with -- --apply to write it into eventMapping.ts.');
    }
  }

  main().catch((error: unknown) => {
    console.error('[measure-events] ERROR:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
  ```

- [ ] **Step 2.2: Register the file for type-checking.**

  Edit `backend/prisma/tsconfig.json` so the `include` is:

  ```json
  {
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
      "noEmit": true
    },
    "include": ["seed.ts", "measure-event-vocabulary.ts"]
  }
  ```

- [ ] **Step 2.3: Add the npm script.**

  In `backend/package.json`, add one line to `scripts` immediately after `"seed"`:

  ```json
  "measure-events": "ts-node --transpile-only --project prisma/tsconfig.json prisma/measure-event-vocabulary.ts",
  ```

- [ ] **Step 2.4: Type-check.**

  Run:

  ```bash
  cd backend && npx tsc --noEmit -p prisma/tsconfig.json
  ```

  Expected: no output, exit code 0.

- [ ] **Step 2.5: Commit.**

  ```bash
  git add backend/prisma/measure-event-vocabulary.ts backend/prisma/tsconfig.json backend/package.json
  git commit -m "feat(backend): add game_events.csv vocabulary measurement tool"
  ```

**Verify:** `npm run measure-events -w backend` on a machine without the CSV prints `[measure-events] ERROR: .../game_events.csv not found. Run: npm run data-pipeline` and exits 1. On a machine with it, it prints sections `=== 1. COLUMNS ===` through `=== 6. MEASURED_SENDING_OFF_DESCRIPTIONS initializer ===` in that order. With `-- --apply` it ends with `[measure-events] wrote .../backend/src/lib/eventMapping.ts`.

---

### Task 3: `eventMapping.ts` — the pure matcher (R2)

The whole test file is written before any production code, then the module is created to satisfy it. RED here is a module-resolution failure, which is the expected red for a brand-new module: it proves the tests are bound to the real export names and cannot pass without the implementation.

**Files:**
- Create: `backend/src/lib/eventMapping.ts`
- Create: `backend/src/__tests__/unit/eventMapping.test.ts`

**Interfaces:**
- Consumes: `game_events.csv` rows shaped `EventCsvRow`; the generated region written by Task 2's `--apply` mode.
- Produces (frozen — do not rename, do not re-shape):

  ```ts
  export function normalizeDescription(description: string): string;
  export function isSendingOffDescription(description: string): boolean;
  export function isShootoutDescription(description: string): boolean;
  export function isOwnGoalDescription(description: string): boolean;
  export type ParsedEventType = 'goal' | 'own_goal' | 'penalty' | 'shootout_goal' | 'yellow_card' | 'second_yellow' | 'red_card' | 'substitution' | 'other';
  export function classifyEvent(row: EventCsvRow): ParsedEventType;
  export interface EventCsvRow { game_id: string; player_id: string; type: string; description: string; minute?: string; }
  export const MEASURED_SENDING_OFF_DESCRIPTIONS: string[];
  ```

**Steps:**

- [ ] **Step 3.1: Run the measurement and read it.**

  ```bash
  npm run data-pipeline
  npm run measure-events -w backend | tee /tmp/game-events-measurement.txt
  ```

  Expected: six sections in order. Read section 5 in full. Confirm the `"red"` and `"2."` buckets together account for roughly 3,097 + ~2,300 rows (§3.3). **If they do not, stop and report the counts — the roadmap figure would be stale and the decision table in Step 3.8 must be built from what the tool printed, not from what §3.3 predicted.**

- [ ] **Step 3.2: Note the initializer and the bucket counts.**

  Section 6 of `/tmp/game-events-measurement.txt` is the exact initializer
  Task 3 Step 3.6 writes into the sentinel region — no editing, no shortening,
  no dedupe, no sampling. Note how many strings it holds; that number is the
  `it.each` case count in Step 3.3, and it should be in the same order of
  magnitude as the ~5,400 dismissal rows the two buckets account for.

- [ ] **Step 3.3: Write the test file first.**

  Create `backend/src/__tests__/unit/eventMapping.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest';
  import {
    MEASURED_SENDING_OFF_DESCRIPTIONS,
    classifyEvent,
    isOwnGoalDescription,
    isSendingOffDescription,
    isShootoutDescription,
    normalizeDescription,
    type EventCsvRow,
  } from '../../lib/eventMapping';

  function row(type: string, description: string): EventCsvRow {
    return { game_id: '1', player_id: '1', type, description };
  }

  describe('normalizeDescription', () => {
    it('collapses a run of whitespace to a single space', () => {
      expect(normalizeDescription('Red  card')).toBe('red card');
    });

    it('trims leading and trailing whitespace', () => {
      expect(normalizeDescription('   Goal  ')).toBe('goal');
    });

    it('lower-cases so case variants compare equal', () => {
      expect(normalizeDescription('Own Goal')).toBe('own goal');
    });

    it('returns an empty string for an empty description', () => {
      expect(normalizeDescription('')).toBe('');
    });
  });

  describe('isSendingOffDescription', () => {
    it('matches the literal Red card regardless of spacing', () => {
      expect(isSendingOffDescription('Red card')).toBe(true);
      expect(isSendingOffDescription('Red  card')).toBe(true);
      expect(isSendingOffDescription('  RED CARD ')).toBe(true);
    });

    // R2: every measured variant, not a sample.
    it.each(MEASURED_SENDING_OFF_DESCRIPTIONS)(
      'matches the measured sending-off variant %j',
      (description) => {
        expect(isSendingOffDescription(description)).toBe(true);
      },
    );

    it('does not match a plain yellow card', () => {
      expect(isSendingOffDescription('Yellow card , Foul')).toBe(false);
    });

    it('does not match an empty description', () => {
      expect(isSendingOffDescription('')).toBe(false);
    });
  });

  describe('isShootoutDescription', () => {
    it('matches a shootout label', () => {
      expect(isShootoutDescription('Goal, penalty shootout')).toBe(true);
    });

    it('matches a hyphenated shootout label', () => {
      expect(isShootoutDescription('Penalty  Shootout')).toBe(true);
    });

    it('does not match a regular penalty goal', () => {
      expect(isShootoutDescription('Goal, penalty')).toBe(false);
    });

    it('does not match an empty description', () => {
      expect(isShootoutDescription('')).toBe(false);
    });
  });

  describe('isOwnGoalDescription', () => {
    it('matches the spaced own-goal label', () => {
      expect(isOwnGoalDescription('Own goal')).toBe(true);
    });

    it('matches the underscored own-goal label', () => {
      expect(isOwnGoalDescription('own_goal')).toBe(true);
    });

    it('does not match a regular goal', () => {
      expect(isOwnGoalDescription('Goal')).toBe(false);
    });

    it('does not match an empty description', () => {
      expect(isOwnGoalDescription('')).toBe(false);
    });
  });

  describe('classifyEvent', () => {
    it('classifies a direct red card', () => {
      expect(classifyEvent(row('card', 'Red card'))).toBe('red_card');
    });

    it('classifies a second-yellow dismissal as a dismissal, not a plain yellow', () => {
      expect(classifyEvent(row('card', 'Red card, 2. yellow card , Foul'))).toBe('second_yellow');
    });

    it('classifies a plain yellow card', () => {
      expect(classifyEvent(row('card', 'Yellow card , Foul'))).toBe('yellow_card');
    });

    it('classifies an own goal from the type column', () => {
      expect(classifyEvent(row('own_goal', 'Own goal, , '))).toBe('own_goal');
    });

    it('classifies a shootout goal from the description', () => {
      expect(classifyEvent(row('goal', 'Goal, penalty shootout'))).toBe('shootout_goal');
    });

    it('classifies a penalty goal', () => {
      expect(classifyEvent(row('penalty', 'Goal, penalty'))).toBe('penalty');
    });

    it('classifies a substitution', () => {
      expect(classifyEvent(row('substitution', 'Substituted, tactical'))).toBe('substitution');
    });

    it('classifies a regular goal', () => {
      expect(classifyEvent(row('goal', 'Goal'))).toBe('goal');
    });

    it('falls back to other for an unrecognised row', () => {
      expect(classifyEvent(row('', ''))).toBe('other');
    });
  });
  ```

- [ ] **Step 3.4: Run it and watch it fail.**

  ```bash
  cd backend && npx vitest run src/__tests__/unit/eventMapping.test.ts
  ```

  Expected RED:

  ```
  FAIL  src/__tests__/unit/eventMapping.test.ts
  Error: Failed to load url ../../lib/eventMapping
  ```

  If it reports a *type* error inside the test file instead, fix the test file and re-run until the only failure is the missing module.

- [ ] **Step 3.5: Create `backend/src/lib/eventMapping.ts`.**

  ```ts
  /**
   * Pure mapping from game_events.csv vocabulary to a single event type.
   *
   * No database, no I/O, no Prisma — every function here is a plain
   * string-in/type-out so the vocabulary can be frozen by unit tests alone.
   *
   * R2 (roadmap §3.3): the source `description` column is free text whose
   * variants differ in *spacing*, not in substance. Every comparison is made
   * against the normalized form, so `Red card`, `Red  card` and `  RED CARD `
   * are one value. Do not add a comparison anywhere in this file that skips
   * normalizeDescription().
   */

  /** Ordered event-type enum derived from the source CSV's type/description columns. */
  export type ParsedEventType =
    | 'goal'
    | 'own_goal'
    | 'penalty'
    | 'shootout_goal'
    | 'yellow_card'
    | 'second_yellow'
    | 'red_card'
    | 'substitution'
    | 'other';

  /** One raw row of game_events.csv, as read by the seed. */
  export interface EventCsvRow {
    game_id: string;
    player_id: string;
    type: string;
    description: string;
    minute?: string;
  }

  /**
   * Collapse whitespace runs and trim, so CSV spacing variants compare equal.
   */
  export function normalizeDescription(description: string): string {
    return description.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  /**
   * Every sending-off description string measured in game_events.csv.
   *
   * GENERATED — do not hand-edit. Regenerate with:
   *   npm run data-pipeline && npm run measure-events -w backend -- --apply
   * The two sentinels below are the write region; the tool replaces only what
   * is between them, and refuses to run if either one is missing.
   *
   * Both direct reds and second-yellow dismissals live here: they are
   * *dismissals*, and a matcher that only recognises the literal `Red card`
   * silently drops every second yellow (§3.3, ~2,300 rows).
   */
  // --- BEGIN MEASURED ---
  export const MEASURED_SENDING_OFF_DESCRIPTIONS: string[] = [];
  // --- END MEASURED ---

  /** Normalized forms, so every lookup in this file compares normalized keys. */
  const SENDING_OFF = new Set(
    MEASURED_SENDING_OFF_DESCRIPTIONS.map((description) => normalizeDescription(description)),
  );

  /** True when the normalized description denotes a sending-off (direct red OR second yellow). */
  export function isSendingOffDescription(description: string): boolean {
    return SENDING_OFF.has(normalizeDescription(description));
  }

  /** True when the normalized description denotes a penalty-shootout goal (excluded per O3). */
  export function isShootoutDescription(description: string): boolean {
    return normalizeDescription(description).includes('shootout');
  }

  /** True when the normalized description denotes an own goal (O4: still attributed to the event row's player_id). */
  export function isOwnGoalDescription(description: string): boolean {
    const normalized = normalizeDescription(description);
    return normalized.includes('own goal') || normalized.includes('own_goal');
  }

  /**
   * A dismissal that came from a second yellow. Order matters: the sending-off
   * set is checked first, so this only ever runs on a measured dismissal.
   */
  function isSecondYellowDescription(description: string): boolean {
    const normalized = normalizeDescription(description);
    return normalized.includes('2. yellow card') || normalized.includes('second yellow');
  }

  /**
   * Classify one event row.
   *
   * The `type` column is the coarse, reliable label; `description` carries the
   * detail. Where the measured data gives no answer the row becomes 'other',
   * which no column is incremented for — the seed's failure direction is
   * absent, never wrong.
   */
  export function classifyEvent(row: EventCsvRow): ParsedEventType {
    const type = normalizeDescription(row.type);
    const description = normalizeDescription(row.description);

    if (isSendingOffDescription(description)) {
      return isSecondYellowDescription(description) ? 'second_yellow' : 'red_card';
    }
    if (type === 'own_goal' || isOwnGoalDescription(description)) return 'own_goal';
    if (type === 'card' && description.includes('yellow') && !description.includes('2.')) {
      return 'yellow_card';
    }
    if (type === 'card') return 'red_card';
    if (isShootoutDescription(description)) return 'shootout_goal';
    if (type === 'substitution' || description.includes('substituted')) return 'substitution';
    if (type === 'penalty') return 'penalty';
    if (type === 'goal' || description.includes('goal')) return 'goal';
    return 'other';
  }
  ```

- [ ] **Step 3.6: Apply the measured vocabulary into the sentinel region.**

  ```bash
  npm run measure-events -w backend -- --apply | tee /tmp/game-events-measurement.txt
  ```

  Expected tail — the *shape* of the output, not the real values, which only
  this run can produce:

  ```
  === 6. MEASURED_SENDING_OFF_DESCRIPTIONS initializer ===
  export const MEASURED_SENDING_OFF_DESCRIPTIONS: string[] = [
    "2. Yellow card, Foul",
    "2.  Yellow card, Foul",
    "Red card, Foul",
    "Red  card, Foul",
  ];
  [measure-events] wrote /home/…/backend/src/lib/eventMapping.ts
  ```

  What must be true regardless of which strings appear: the block is
  **complete** (every measured dismissal variant, not a sample), **sorted**, and
  closed with `];`. The spacing duplicates above are the whole reason the set
  exists — the matcher normalizes them into one key, so a naive equality
  comparison would count only the first spelling.

  This is the whole R2 loop: **measure, then write**. There is no hand-paste
  step and no value anyone has to invent. Confirm the write:

  ```bash
  grep -c "BEGIN MEASURED\|END MEASURED" backend/src/lib/eventMapping.ts
  ```

  Expected: `2`. If the tool reported a missing-sentinel error instead, the
  sentinels were not copied verbatim in Step 3.5 — fix the copy, do not hand-edit
  the constant.

- [ ] **Step 3.7: Run the tests and watch them pass.**

  ```bash
  cd backend && npx vitest run src/__tests__/unit/eventMapping.test.ts
  ```

  Expected GREEN:

  ```
  ✓ src/__tests__/unit/eventMapping.test.ts (N tests)
  Test Files  1 passed (1)
       Tests  N passed (N)
  ```

  `N` is at least 30: 4 normalize + 6 sending-off (4 fixed + `it.each` over the measured list) + 3 shootout + 4 own-goal + 10 classify = 27 + the measured list length.

- [ ] **Step 3.8: Verify the decision table against the measurement.**

  Reopen `/tmp/game-events-measurement.txt` section 5 and answer these out loud in the PR description:

  1. Is every `"2."` variant matched by `isSecondYellowDescription`? If a measured dismissal uses a spelling it does not catch, add that spelling to `isSecondYellowDescription` **and** add a matching `it` case in Step 3.3's `classifyEvent` block. Then re-run Step 3.7.
  2. Does the `"penalt"` bucket contain any row that is **not** a converted penalty (for example `Penalty, missed` or `Penalty saved`)? If so, **stop.** A blanket rule would count a missed penalty as a goal. Report the strings; the fix is a row-level exclusion, not a substring tweak, and it needs `lead` to confirm.
  3. Does the `"own goal"` bucket carry a `player_id` distinct from the credited scorer? If so, O4 is wrong and `lead` must be consulted before shipping.

- [ ] **Step 3.9: Lint and type-check.**

  ```bash
  ESLINT_USE_FLAT_CONFIG=false npx eslint backend/src/lib/eventMapping.ts backend/src/__tests__/unit/eventMapping.test.ts
  cd backend && npm run build
  ```

  Expected: no output from eslint; `npm run build` exits 0.

- [ ] **Step 3.10: Commit.**

  ```bash
  git add backend/src/lib/eventMapping.ts backend/src/__tests__/unit/eventMapping.test.ts
  git commit -m "feat(backend): add measured game-event vocabulary matcher"
  ```

**Verify:** `cd backend && npx vitest run --coverage src/__tests__/unit/eventMapping.test.ts 2>&1 | grep -A3 "eventMapping"` shows ≥95% on all four metrics for `src/lib/eventMapping.ts`.

---

### Task 4: `appearanceEventJoin.ts` — the streaming join (R4)

**Files:**
- Create: `backend/src/lib/appearanceEventJoin.ts`
- Create: `backend/src/__tests__/unit/appearanceEventJoin.test.ts`

**Interfaces:**
- Consumes: `classifyEvent(row: EventCsvRow): ParsedEventType` and `EventCsvRow` from `../../lib/eventMapping`.
- Produces (frozen — do not rename):

  ```ts
  export interface AppearanceKey { gameId: number; playerId: number; }
  export interface EventTotals { goals: number; assists: number; redCards: number; }
  export class AppearanceEventIndex {
    constructor(appearances: AppearanceKey[]);
    accumulate(key: AppearanceKey, event: ParsedEventRow): EventTotals | undefined;
    finalize(appearances: FullAppearanceRow[]): FullAppearanceRow[];
    get size(): number;
  }
  ```

  Two types the contract references but does not define are defined here, minimally:

  ```ts
  /** A raw CSV row, already reduced to what the join needs. */
  export interface ParsedEventRow { type: ParsedEventType; isAssist: boolean; }
  /** An appearance row the finalized totals are written back onto. */
  export interface FullAppearanceRow extends AppearanceKey { goals: number; assists: number; redCards: number; }
  ```

- [ ] **Step 4.1: Write the test file first.**

  Create `backend/src/__tests__/unit/appearanceEventJoin.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest';
  import {
    AppearanceEventIndex,
    type AppearanceKey,
    type FullAppearanceRow,
  } from '../../lib/appearanceEventJoin';
  import type { ParsedEventType } from '../../lib/eventMapping';

  const key = (gameId: number, playerId: number): AppearanceKey => ({ gameId, playerId });

  const event = (type: ParsedEventType, isAssist = false) => ({ type, isAssist });

  describe('AppearanceEventIndex', () => {
    it('reports the number of distinct indexed appearances', () => {
      const index = new AppearanceEventIndex([key(1, 101), key(1, 101), key(1, 102)]);
      expect(index.size).toBe(2);
    });

    it('accumulates a goal', () => {
      const index = new AppearanceEventIndex([key(1, 101)]);
      expect(index.accumulate(key(1, 101), event('goal'))).toEqual({ goals: 1, assists: 0, redCards: 0 });
    });

    it('accumulates a penalty goal', () => {
      const index = new AppearanceEventIndex([key(1, 101)]);
      index.accumulate(key(1, 101), event('penalty'));
      expect(index.accumulate(key(1, 101), event('penalty'))).toEqual({ goals: 2, assists: 0, redCards: 0 });
    });

    it('accumulates an own goal against the event row player (O4)', () => {
      const index = new AppearanceEventIndex([key(1, 101)]);
      expect(index.accumulate(key(1, 101), event('own_goal'))).toEqual({ goals: 1, assists: 0, redCards: 0 });
    });

    it('does not count a shootout goal (O3)', () => {
      const index = new AppearanceEventIndex([key(1, 101)]);
      expect(index.accumulate(key(1, 101), event('shootout_goal'))).toEqual({ goals: 0, assists: 0, redCards: 0 });
    });

    it('counts a direct red card', () => {
      const index = new AppearanceEventIndex([key(1, 101)]);
      expect(index.accumulate(key(1, 101), event('red_card'))).toEqual({ goals: 0, assists: 0, redCards: 1 });
    });

    it('counts a second-yellow dismissal as a red card', () => {
      const index = new AppearanceEventIndex([key(1, 101)]);
      expect(index.accumulate(key(1, 101), event('second_yellow'))).toEqual({ goals: 0, assists: 0, redCards: 1 });
    });

    it('ignores a yellow card', () => {
      const index = new AppearanceEventIndex([key(1, 101)]);
      expect(index.accumulate(key(1, 101), event('yellow_card'))).toEqual({ goals: 0, assists: 0, redCards: 0 });
    });

    it('ignores a substitution', () => {
      const index = new AppearanceEventIndex([key(1, 101)]);
      expect(index.accumulate(key(1, 101), event('substitution'))).toEqual({ goals: 0, assists: 0, redCards: 0 });
    });

    it('ignores an unrecognised row', () => {
      const index = new AppearanceEventIndex([key(1, 101)]);
      expect(index.accumulate(key(1, 101), event('other'))).toEqual({ goals: 0, assists: 0, redCards: 0 });
    });

    it('accumulates an assist', () => {
      const index = new AppearanceEventIndex([key(1, 101)]);
      expect(index.accumulate(key(1, 101), event('goal', true))).toEqual({ goals: 1, assists: 1, redCards: 0 });
    });

    it('returns undefined for an event with no matching appearance row', () => {
      const index = new AppearanceEventIndex([key(1, 101)]);
      expect(index.accumulate(key(1, 999), event('goal'))).toBeUndefined();
    });

    it('does not grow when events arrive for unknown appearances', () => {
      const index = new AppearanceEventIndex([key(1, 101)]);
      index.accumulate(key(1, 999), event('goal'));
      index.accumulate(key(2, 999), event('red_card'));
      expect(index.size).toBe(1);
    });

    it('separates the same player in two different games', () => {
      const index = new AppearanceEventIndex([key(1, 101), key(2, 101)]);
      index.accumulate(key(1, 101), event('goal'));
      expect(index.accumulate(key(2, 101), event('goal'))).toEqual({ goals: 0, assists: 0, redCards: 0 });
    });

    it('accumulates multiple events for the same appearance', () => {
      const index = new AppearanceEventIndex([key(1, 101)]);
      index.accumulate(key(1, 101), event('goal'));
      index.accumulate(key(1, 101), event('goal', true));
      index.accumulate(key(1, 101), event('second_yellow'));
      expect(index.accumulate(key(1, 101), event('goal', true))).toEqual({ goals: 2, assists: 2, redCards: 1 });
    });

    it('leaves a game whose every event row is unjoinable at zero', () => {
      const index = new AppearanceEventIndex([key(1, 101), key(1, 102)]);
      index.accumulate(key(1, 999), event('goal'));
      index.accumulate(key(1, 998), event('red_card'));
      const rows: FullAppearanceRow[] = [
        { gameId: 1, playerId: 101, goals: 0, assists: 0, redCards: 0 },
        { gameId: 1, playerId: 102, goals: 0, assists: 0, redCards: 0 },
      ];
      expect(index.finalize(rows)).toEqual(rows);
    });

    it('writes accumulated totals back onto the appearance rows', () => {
      const index = new AppearanceEventIndex([key(1, 101), key(1, 102)]);
      index.accumulate(key(1, 101), event('goal', true));
      index.accumulate(key(1, 101), event('red_card'));
      const finalized = index.finalize([
        { gameId: 1, playerId: 101, goals: 0, assists: 0, redCards: 0 },
        { gameId: 1, playerId: 102, goals: 0, assists: 0, redCards: 0 },
      ]);
      expect(finalized[0]).toEqual({ gameId: 1, playerId: 101, goals: 1, assists: 1, redCards: 1 });
      expect(finalized[1]).toEqual({ gameId: 1, playerId: 102, goals: 0, assists: 0, redCards: 0 });
    });

    it('does not mutate the rows passed to finalize', () => {
      const index = new AppearanceEventIndex([key(1, 101)]);
      index.accumulate(key(1, 101), event('goal'));
      const row: FullAppearanceRow = { gameId: 1, playerId: 101, goals: 0, assists: 0, redCards: 0 };
      index.finalize([row]);
      expect(row.goals).toBe(0);
    });
  });
  ```

- [ ] **Step 4.2: Run it and watch it fail.**

  ```bash
  cd backend && npx vitest run src/__tests__/unit/appearanceEventJoin.test.ts
  ```

  Expected RED: `Error: Failed to load url ../../lib/appearanceEventJoin`.

- [ ] **Step 4.3: Create `backend/src/lib/appearanceEventJoin.ts`.**

  ```ts
  import type { ParsedEventType } from './eventMapping';

  /** Identity of one appearance row — the join key, gameId + playerId. */
  export interface AppearanceKey {
    gameId: number;
    playerId: number;
  }

  /** The three columns the join writes. */
  export interface EventTotals {
    goals: number;
    assists: number;
    redCards: number;
  }

  /** A raw CSV row, already reduced to what the join needs. */
  export interface ParsedEventRow {
    /** Classification from classifyEvent(). 'other' means "not recognised". */
    type: ParsedEventType;
    /**
     * True when the CSV `type` column marks this row as an assist. ParsedEventType
     * has no 'assist' member, so this flag is carried separately rather than
     * widening the frozen event-type enum.
     */
    isAssist: boolean;
  }

  /** An appearance row the finalized totals are written back onto. */
  export interface FullAppearanceRow extends AppearanceKey, EventTotals {}

  /**
   * Streaming join accumulator: events ⋈ appearances on gameId + playerId.
   *
   * R4 / §3.2: this is the ONLY structure the seed is allowed to build, and it
   * indexes APPEARANCES (~219k), never events (~1.27M). The map is
   * pre-populated to zeros from the appearance set, so its size is fixed at
   * construction and a stream of 1.27M unjoinable rows cannot grow it. An
   * event whose key is absent is dropped and the map is left untouched.
   */
  export class AppearanceEventIndex {
    private readonly totals = new Map<string, EventTotals>();

    constructor(appearances: AppearanceKey[]) {
      for (const appearance of appearances) {
        this.totals.set(compositeKey(appearance.gameId, appearance.playerId), {
          goals: 0,
          assists: 0,
          redCards: 0,
        });
      }
    }

    /** Number of distinct indexed appearances. */
    get size(): number {
      return this.totals.size;
    }

    /**
     * Fold one event into the totals for `key`.
     *
     * Returns the (mutated) totals, or undefined when the key has no
     * appearance row — the unjoinable case, which is dropped silently because
     * it is a normal outcome (substitute goals, R3; games filtered out of the
     * seed; players missing from players.csv).
     */
    accumulate(key: AppearanceKey, event: ParsedEventRow): EventTotals | undefined {
      const totals = this.totals.get(compositeKey(key.gameId, key.playerId));
      if (totals === undefined) return undefined;

      switch (event.type) {
        case 'goal':
        case 'penalty':
        case 'own_goal':
          // O4: an own goal is attributed to the player_id on the event row.
          totals.goals += 1;
          break;
        case 'red_card':
        case 'second_yellow':
          totals.redCards += 1;
          break;
        case 'shootout_goal':
          // O3: penalty-shootout goals are deliberately NOT counted.
          break;
        case 'yellow_card':
        case 'substitution':
        case 'other':
          // Not tracked. Anything unrecognised counts nowhere rather than wrong.
          break;
      }

      if (event.isAssist) totals.assists += 1;

      return totals;
    }

    /** Merge accumulated totals back onto the appearance rows for the DB write. */
    finalize(appearances: FullAppearanceRow[]): FullAppearanceRow[] {
      return appearances.map((appearance) => {
        const totals = this.totals.get(compositeKey(appearance.gameId, appearance.playerId));
        if (totals === undefined) return appearance;
        return { ...appearance, goals: totals.goals, assists: totals.assists, redCards: totals.redCards };
      });
    }
  }

  /**
   * Both ids are non-negative integers with no separator characters, so a colon
   * cannot collide across (gameId, playerId) pairs.
   */
  function compositeKey(gameId: number, playerId: number): string {
    return `${gameId}:${playerId}`;
  }
  ```

- [ ] **Step 4.4: Run it and watch it pass.**

  ```bash
  cd backend && npx vitest run src/__tests__/unit/appearanceEventJoin.test.ts
  ```

  Expected GREEN: `Test Files 1 passed (1)`, `Tests 18 passed (18)`.

- [ ] **Step 4.5: Refactor check — prove the map cannot grow.**

  `accumulate` returns `undefined` before touching `this.totals` when a key is missing, so no code path inserts. Re-read the file and confirm there is no other `.set(` call outside the constructor. If one exists, it is an R4 defect.

- [ ] **Step 4.6: Lint and type-check.**

  ```bash
  ESLINT_USE_FLAT_CONFIG=false npx eslint backend/src/lib/appearanceEventJoin.ts backend/src/__tests__/unit/appearanceEventJoin.test.ts
  cd backend && npm run build
  ```

- [ ] **Step 4.7: Commit.**

  ```bash
  git add backend/src/lib/appearanceEventJoin.ts backend/src/__tests__/unit/appearanceEventJoin.test.ts
  git commit -m "feat(backend): add streaming appearance-event join index"
  ```

**Verify:** `cd backend && npx vitest run --coverage src/__tests__/unit/appearanceEventJoin.test.ts 2>&1 | grep -A3 "appearanceEventJoin"` shows ≥95% on all four metrics.

---

### Task 5: Wire the streaming join into the seed

No unit tests here: `backend/prisma/seed.ts` sits outside `src/`, so `backend/vitest.config.ts:18` does not cover it and there is no seed test harness. The logic is already tested in Task 4; what is left is I/O wiring, which is validated by type-check, lint, and the dry run in Task 6.

**Files:**
- Modify: `backend/prisma/seed.ts` — imports (`:3`), `Appearance` interface (`:42-50`), `toAppearanceData` (`:340-350`), new `processGameEventsDataset` function, new `ASSIST_EVENT_TYPE` constant, `main()` (`:400-403`, `:473-496`)

**Interfaces:**
- Consumes: `AppearanceEventIndex` and `classifyEvent` / `EventCsvRow` from `../src/lib/eventMapping` and `../src/lib/appearanceEventJoin`.
- Produces: `Appearance.goals` / `assists` / `redCards` written by `insertInBatches(prisma.appearance, …)`. No new exported symbol.

**Steps:**

- [ ] **Step 5.1: Extend the seed's `Appearance` interface.**

  Edit `backend/prisma/seed.ts` lines 42-50 to:

  ```ts
  interface Appearance {
      gameId: number;
      clubId: number;
      playerId: number;
      number: number;
      type: string;
      position: string;
      isCaptain: boolean;
      goals: number;
      assists: number;
      redCards: number;
  }
  ```

- [ ] **Step 5.2: Initialise the three columns where appearances are pushed.**

  In `processGameLineupsDataset`, the `appearances.push({ … })` call at lines 171-179, add three fields:

  ```ts
        appearances.push({
            gameId: Number(row.game_id),
            clubId: Number(row.club_id),
            playerId: Number(row.player_id),
            number: Number(row.number),
            type: row.type,
            position: row.position,
            isCaptain: Boolean(Number(row.team_captain)),
            goals: 0,
            assists: 0,
            redCards: 0,
        });
  ```

  These are placeholders. `AppearanceEventIndex.finalize` replaces them before the insert.

- [ ] **Step 5.3: Add the imports.**

  Edit line 3:

  ```ts
  import { createReadStream, existsSync } from 'fs';
  ```

  And add, after line 7 (`import { normalizeTeamName } …`):

  ```ts
  import { classifyEvent, type EventCsvRow } from '../src/lib/eventMapping';
  import { AppearanceEventIndex } from '../src/lib/appearanceEventJoin';
  ```

- [ ] **Step 5.4: Add the assist constant.**

  Add immediately above `processGameEventsDataset`:

  ```ts
  /**
   * The raw `type` value in game_events.csv that marks an assist row.
   *
   * Measured, not assumed — `ParsedEventType` has no 'assist' member, so the
   * seed matches this literal instead. Regenerate with
   * `npm run measure-events -w backend` and correct this constant if the
   * measured `type` vocabulary says otherwise.
   */
  const ASSIST_EVENT_TYPE = 'assist';
  ```

- [ ] **Step 5.5: Add the streaming reader.**

  Add directly after `processGameLineupsDataset` (i.e. after line 181):

  ```ts
  /**
   * Streams game_events.csv and folds every row into `index`.
   *
   * §3.2 / R4: one row in, one accumulate() call, row discarded. This
   * function never holds the event set — `index` is bounded by the ~219k
   * appearances the seed already holds, so memory does not move when the
   * event count does.
   *
   * A missing CSV is a warning, not a failure: the seed is gated by the
   * operator (§3.4) and someone may run it against an older data directory.
   * Skipping leaves every column at 0, which is exactly v0.2.5's behaviour.
   */
  async function processGameEventsDataset(index: AppearanceEventIndex): Promise<void> {
      const eventsPath = path.join(__dirname, '../../scripts/data/game_events.csv');

      if (!existsSync(eventsPath)) {
          console.warn('game_events.csv not found; goals/assists/redCards stay at 0.');
          return;
      }

      const parser = createReadStream(eventsPath).pipe(
          parse({ columns: true, relax_column_count: true })
      );

      const byType = new Map<string, number>();
      let read = 0;
      let matched = 0;

      for await (const row of parser) {
          read++;

          // EventCsvRow guarantees string fields, so the matcher never has to
          // defend against a missing CSV column.
          const event: EventCsvRow = {
              game_id: String(row.game_id ?? ''),
              player_id: String(row.player_id ?? ''),
              type: String(row.type ?? ''),
              description: String(row.description ?? ''),
              minute: row.minute === undefined ? undefined : String(row.minute),
          };

          const type = classifyEvent(event);
          byType.set(type, (byType.get(type) ?? 0) + 1);

          const totals = index.accumulate(
              { gameId: Number(event.game_id), playerId: Number(event.player_id) },
              { type, isAssist: event.type.trim().toLowerCase() === ASSIST_EVENT_TYPE },
          );

          if (totals !== undefined) matched++;
      }

      const breakdown = [...byType.entries()].sort((a, b) => b[1] - a[1]);
      console.log(`game_events.csv: ${read} rows read, ${matched} joined to an appearance, ${read - matched} unjoinable.`);
      console.log(`game_events.csv classified as: ${breakdown.map(([type, n]) => `${type}=${n}`).join(' ')}`);
  }
  ```

  The `byType` breakdown is the operator's only view of what the vocabulary
  produced. A large `other=` count means the decision table missed a family of
  rows — stop and revisit Task 3 Step 3.8 before shipping.

- [ ] **Step 5.6: Write the columns in `toAppearanceData`.**

  Edit `backend/prisma/seed.ts` lines 340-350 to:

  ```ts
  function toAppearanceData(rows: Appearance[]): Prisma.AppearanceCreateManyInput[] {
      return rows.map(a => ({
          gameId: a.gameId,
          clubId: a.clubId,
          playerId: a.playerId,
          number: toNullableNumber(a.number),
          type: a.type,
          position: toNullableString(a.position),
          isCaptain: a.isCaptain,
          goals: a.goals,
          assists: a.assists,
          redCards: a.redCards,
      }));
  }
  ```

- [ ] **Step 5.7: Call the join, then insert.**

  This must run **after** every filter has narrowed the appearance set, because
  the index is built from the final rows. Edit `main()`: replace line 491

  ```ts
      await insertInBatches(prisma.appearance, toAppearanceData(dedupeAppearances(sideFilteredAppearances)));
  ```

  with

  ```ts
      const finalAppearances = dedupeAppearances(sideFilteredAppearances);
  ```

  and then, immediately **before** the `try {` at line 473, insert:

  ```ts
      const eventIndex = new AppearanceEventIndex(
          finalAppearances.map(a => ({ gameId: a.gameId, playerId: a.playerId }))
      );

      await processGameEventsDataset(eventIndex);

      const appearancesWithEvents = eventIndex.finalize(finalAppearances);
  ```

  and finally change the insert at what is now inside the `try` block to:

  ```ts
      await insertInBatches(prisma.appearance, toAppearanceData(appearancesWithEvents));
  ```

  Read `main()` top to bottom after the edit and confirm this order: the join
  is built from `finalAppearances`, and the destructive
  `prisma.$transaction([…deleteMany])` still runs **after** the CSV read, so an
  unreadable events file can never leave the database wiped.

- [ ] **Step 5.8: Type-check and lint.**

  ```bash
  cd backend && npx tsc --noEmit -p prisma/tsconfig.json
  ESLINT_USE_FLAT_CONFIG=false npx eslint backend/src/
  cd backend && npm run build
  ```

  Expected: all three exit 0 with no output.

- [ ] **Step 5.9: Confirm the schema was not touched.**

  ```bash
  git diff --stat HEAD~3 -- backend/prisma/schema.prisma backend/prisma/migrations
  ```

  Expected: empty output. If a migration appeared, v1.0.1 has overstepped into v1.0.2's budget.

- [ ] **Step 5.10: Commit.**

  ```bash
  git add backend/prisma/seed.ts
  git commit -m "feat(backend): stream game events into appearance event columns during seed"
  ```

**Verify:** `grep -n "game_events.csv\|AppearanceEventIndex\|appearancesWithEvents" backend/prisma/seed.ts` shows the path, the index construction and the finalize call.

---

### Task 6: Full validation, CHANGELOG, release

**Files:**
- Modify: `CHANGELOG.md` (prepend one section)

**Interfaces:**
- Consumes: everything above.
- Produces: the `## v1.0.1` CHANGELOG section that `scripts/src/release.ts:8` `VERSION_PATTERN` and `findSection` require. No code symbol.

**Steps:**

- [ ] **Step 6.1: Run the whole backend suite with the coverage gate.**

  ```bash
  cd backend && npm run test:coverage
  ```

  Expected: `Test Files 15 passed (15)` (13 existing + `eventMapping` + `appearanceEventJoin`), all
  `Tests … passed`, and a coverage table showing ≥95% on lines, statements,
  functions and branches. `ERROR: Coverage for lines (…) does not meet global
  threshold (95%)` means a Task 3/4 branch is unexercised — go back and add the
  missing case.

- [ ] **Step 6.2: Confirm nothing else moved.**

  ```bash
  cd frontend && npm run test
  ```

  Expected: all 9 existing test files pass, unchanged. This patch touches no frontend file.

- [ ] **Step 6.3: Dry-run the seed against a local database.**

  With `.env.development` pointing at a scratch database and the CSVs present:

  ```bash
  npm run seed -w backend 2>&1 | tail -20
  ```

  Expected output includes:

  ```
  game_events.csv: <n> rows read, <m> joined to an appearance, <u> unjoinable.
  game_events.csv classified as: red_card=<n> second_yellow=<n> goal=<n> …
  ```

  **Check the numbers against the §3.3 baseline before accepting them:**
  - `red_card` + `second_yellow` combined should be ≈ 3,097 + ~2,300 ≈ 5,400.
    A number near 3,097 means the second-yellow matcher is not firing — stop.
  - `other=` should be a small fraction of the total. A large `other=` means
    Task 3 Step 3.8 was not satisfied — stop and revisit the decision table.

  Then verify the join landed:

  ```bash
  psql "$DATABASE_URL" -c "SELECT count(*) FILTER (WHERE goals > 0)      AS scorers,
                                  count(*) FILTER (WHERE assists > 0)    AS assisters,
                                  count(*) FILTER (WHERE redCards > 0)  AS sendings,
                                  sum(goals)                              AS total_goals
                           FROM \"Appearance\";"
  ```

  Expected: `total_goals` is in the hundreds of thousands, `sendings` is
  thousands, `scorers` is tens of thousands, and no column is zero.

- [ ] **Step 6.4: Confirm the safety property — no CSV, no change.**

  ```bash
  mv scripts/data/game_events.csv /tmp/game_events.csv.bak
  npm run seed -w backend 2>&1 | grep -i "game_events.csv"
  mv /tmp/game_events.csv.bak scripts/data/game_events.csv
  ```

  Expected: `game_events.csv not found; goals/assists/redCards stay at 0.` and the seed still completes. This is §3.4's degradation path.

- [ ] **Step 6.5: Write the CHANGELOG section.**

  Prepend to `CHANGELOG.md`, directly under the `---` on line 8 and above
  `## v0.2.5`:

  ```markdown
  ## v1.0.1 — Event data foundation: measured join into Appearance

  _2026-09-29_

  ### Added

  - **`game_events.csv` in the dataset** — added to `REQUIRED_FILES` in
    `scripts/src/download-data.ts`, with the single-request fetch timeout
    raised from 120s to 600s to cover the larger archive.
  - **`backend/prisma/measure-event-vocabulary.ts`** — re-runnable measurement
    of the real `type` / `description` vocabulary, run via
    `npm run measure-events -w backend`. Prints the complete distinct inventory
    plus a copy-pasteable `MEASURED_SENDING_OFF_DESCRIPTIONS` constant.
  - **`backend/src/lib/eventMapping.ts`** — pure, unit-tested mapping from CSV
    vocabulary to `ParsedEventType`. Whitespace-tolerant, so the ~2,300
    second-yellow dismissals a literal `Red card` match misses are counted.
  - **`backend/src/lib/appearanceEventJoin.ts`** — `AppearanceEventIndex`, a
    streaming join bounded by the ~219k appearances rather than the ~1.27M
    event rows.

  ### Changed

  - **`backend/prisma/seed.ts`** streams `game_events.csv` and writes
    `Appearance.goals` / `assists` / `redCards` before the appearance insert.
    A missing CSV is a warning, not a failure.

  ### Notes

  - No Prisma migration: the columns and the `gameId + playerId` join key
    already existed.
  - **Re-seed is a manual operator step.** `run_seed` defaults to `false`, so
    merging this patch changes nothing in production until the box is ticked.
    Until then the app runs on zeroed columns and renders no icons.
  - **Shootout goals are not counted; own goals are attributed to the
    `player_id` on the event row.** Both revisable against the measurement.
  - **Substitute goals remain unjoinable** — `Appearance.type` is
    `starting_lineup` for every row, so a substitute has no row to join to.
  ```

- [ ] **Step 6.6: Verify the changelog is parseable.**

  ```bash
  npm run release -- --notes v1.0.1 | head -5
  ```

  Expected: the first body line of the v1.0.1 section, e.g.
  `_2026-09-29_`. If it prints `[release] ERROR: CHANGELOG.md has no "## v1.0.1" section`, the heading text does not match `HEADING_PATTERN`
  (`/^##\s+(v\S+)\s*(?:[\u2013\u2014-]\s*(.*))?$/`, `scripts/src/release.ts:9`).

- [ ] **Step 6.7: Commit.**

  ```bash
  git add CHANGELOG.md
  git commit -m "release: v1.0.1 — event data foundation"
  ```

**Verify:** `git log --oneline -7` shows six commits for this patch (Tasks 1-5 plus the release), each conventional-commit shaped and matching the style of `git log --oneline -20`.

---

## Rollback

Revert the patch to **v0.2.5**. `git revert` the six commits, or reset to the pre-patch tag. There is no migration to reverse and no data to repair: `Appearance.goals` / `assists` / `redCards` keep whatever values they hold, and the pre-patch code never reads them. If the database was re-seeded under v1.0.1 and the code is reverted, the app is identical to v0.2.5 except that three unused columns hold non-zero values.

## Known limitation, not a defect (R3)

`Appearance.type` is `starting_lineup` for 100% of rows, so substitute goals cannot be joined to a shirt. Scorer counts are best-effort and always under-count. Documented here and in the CHANGELOG; not fixed in v1.x.

## Out of scope

- Captain data — `isCaptain` is already populated (19,156 rows / 9,992 games). No v1.0 work.
- Any `Appearance` or `Game` index — v1.0.2 owns indexes, and its list is closed at `Game.season`, `Game.date`, `Game.targetTeamId` (R4).
- 530 games with an empty opponent lineup — `hasCompleteLineups` is v1.1.1's (§11 Rule 2).
- Any API or frontend change — v1.0.2 and v1.0.3.

## Acceptance criteria

1. `REQUIRED_FILES` contains `'game_events.csv'` and `scripts/data/game_events.csv` exists after `npm run data-pipeline`.
2. `npm run measure-events -w backend` prints sections 1-6 and exits 0.
3. `MEASURED_SENDING_OFF_DESCRIPTIONS` equals the tool's section-6 block verbatim, and `it.each` covers every entry.
4. `isSendingOffDescription` is true for every entry in that list and for `'Red card'` under any spacing or case.
5. `classifyEvent` returns `'shootout_goal'` for shootout rows and `accumulate` adds nothing for them (O3).
6. `classifyEvent` returns `'own_goal'` for own-goal rows and `accumulate` increments `goals` for them (O4).
7. `accumulate` returns `undefined` for a key that is not an appearance, and `index.size` is unchanged afterwards.
8. `seed.ts` builds exactly one `AppearanceEventIndex` and never a structure over event rows.
9. `git diff` shows no change to `backend/prisma/schema.prisma` and no new directory under `backend/prisma/migrations`.
10. After a seed with the CSV present, `sum(goals)` over `Appearance` is non-zero and `redCards > 0` on some rows.
11. After a seed with the CSV absent, the seed completes and all three columns are `0`.
12. `cd backend && npm run test:coverage` passes the 95% global gate on all four metrics.
13. `cd frontend && npm run test` passes unchanged.
14. `npm run release -- --notes v1.0.1` prints the section body.

## Validation plan

| What | Command | Expected |
|---|---|---|
| Matcher unit tests | `cd backend && npx vitest run src/__tests__/unit/eventMapping.test.ts` | all pass, incl. `it.each` over the measured list |
| Join unit tests | `cd backend && npx vitest run src/__tests__/unit/appearanceEventJoin.test.ts` | `Tests 18 passed (18)` |
| Full backend gate | `cd backend && npm run test:coverage` | 13 files pass, ≥95% on all four metrics |
| Frontend untouched | `cd frontend && npm run test` | 9 files pass, no diff |
| Backend type-check | `cd backend && npm run build` | exit 0 |
| Seed type-check | `cd backend && npx tsc --noEmit -p prisma/tsconfig.json` | exit 0 |
| Lint | `ESLINT_USE_FLAT_CONFIG=false npx eslint backend/src/` | no output |
| Measurement | `npm run measure-events -w backend` | sections 1-6 |
| Seed, CSV present | `npm run seed -w backend` | `… rows read, … joined … unjoinable.` + classification breakdown |
| Seed, CSV absent | `mv scripts/data/game_events.csv /tmp/ && npm run seed -w backend` | `game_events.csv not found; …` then a clean exit |
| Data landed | `psql "$DATABASE_URL" -c "SELECT sum(goals) FROM \"Appearance\";"` | non-zero |
| No migration | `git diff --stat HEAD~3 -- backend/prisma/migrations` | empty |
| Release note | `npm run release -- --notes v1.0.1` | section body |

## Risks

| Risk | Impact | Mitigation in this plan |
|---|---|---|
| R2 — second-yellow trap | Wrong data, no error | Whitespace-normalized comparison, `MEASURED_SENDING_OFF_DESCRIPTIONS` from the real file, `it.each` over the whole list, plus Task 3 Step 3.8's three explicit review questions |
| R4 — OOM | Seed dies on a 4 GB box | One `Map` sized by appearances; Task 4 Step 4.5 asserts no `.set(` outside the constructor; `accumulate` returns `undefined` before any mutation |
| R3 — substitute goals | Under-counted scorers | Documented in Global Constraints, the CHANGELOG and Out of scope. Not fixed |
| Measurement disagrees with §3.3's ~2,300 | The roadmap figure is stale | Task 3 Step 3.1 and Task 6 Step 6.3 both make the count a gate, not an assumption |
| `other=` large after seeding | Silent under-count | The seed prints the classification breakdown (Step 5.5) and Task 6 Step 6.3 says stop |
| Single-zip download timeout | Seed step fails at 120s | Step 1.2 raises it to 600s. Beyond the frozen `REQUIRED_FILES` contract — flagged for `lead` |
| O3/O4 wrong | Wrong goals | Reversible in `accumulate`'s `switch` alone; `eventMapping.ts` needs no change |

## Handoff to v1.0.2

`backend/src/lib/eventMapping.ts` and `backend/src/lib/appearanceEventJoin.ts` are complete and frozen. v1.0.2 consumes **none** of it — it exposes the columns the seed now writes, and adds the `Game` indexes. v1.0.2's only dependency on this patch is that the columns hold real data (Rule 1: no data, no columns to expose).
