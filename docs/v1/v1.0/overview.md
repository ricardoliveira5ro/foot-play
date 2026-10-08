# v1.0 — Live event badges (overview)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a football match's event data into two visible facts on the tactic board — who scored and who was dismissed — without breaking the app on games that have no event data.

**Architecture:** Three independently shippable patches that move data in one direction. v1.0.1 measures the event vocabulary and folds it into appearances at seed time. v1.0.2 carries the result over the API and onto the frontend contract. v1.0.3 renders it. v1.0 adds **no UI behaviour change of any other kind** — no score, no multiplier, no streak, no difficulty.

**Tech Stack:** TypeScript, Node `csv-parse` streaming, Prisma + PostgreSQL, Express, Next.js 16 / React 19, Tailwind 4, Vitest, Node `readline`.

---

> **Ratified decisions are not decided here.** Roadmap [§9.1](../roadmap-v1.md#91-ratified-decisions) is authoritative for every decision the owner has closed; a plan's preflight **verifies** the ratified answer and never re-decides it. Where a plan and that table disagree, the table wins and the plan is the defect. A question the table does not cover is still an escalation.

---

## The three patches

| Patch | What lands | Files it adds | Rollback to |
|---|---|---|---|
| **v1.0.1** — `plan-v1.0.1-event-measurement.md` | `game_events.csv` added to the download manifest. A one-off **streaming measurement tool** enumerates the real description vocabulary and, with `--apply`, writes the `MEASURED_SENDING_OFF_DESCRIPTIONS` set into a sentinel-delimited region of `eventMapping.ts`. A matcher classifies each event row. A streaming join folds events into the appearance rows that are already being inserted. The seed writes the result. | `backend/prisma/measure-event-vocabulary.ts`, `backend/src/lib/eventMapping.ts`, `backend/src/lib/appearanceEventJoin.ts`, 2 test files | v0.2.5 |
| **v1.0.2** — `plan-v1.0.2-event-persistence.md` | Three `Game` indexes (`season`, `date`, `targetTeamId`). `buildMatchResponse` / `buildLineup` and the frontend `LineupPlayer` gain `goals`, `assists`, `redCards`, `isCaptain`. Mock fixtures follow. **No migration for the event columns** — they already exist. | 1 migration, 1 backend test file | v1.0.1 |
| **v1.0.3** — `plan-v1.0.3-event-icons.md` | A pure `badgesForShirt()` decides which badges exist; `Shirt.tsx` draws them and names them in its `aria-label`. | `frontend/src/lib/shirtBadges.ts`, `frontend/src/components/Shirt.badges.test.tsx`, 1 test file | v1.0.2 |

**Rollback chain is strict and one-directional:** v1.0.3 → v1.0.2 → v1.0.1 → v0.2.5. Each revert is a code revert with **no data repair and no reverse migration**, because every patch is additive. v1.0.1's only schema touch is the download-list entry; v1.0.2's only migration adds indexes that stay harmlessly in place after a code revert.

---

## Data flow

```
game_events.csv  (~1.27M rows, ~170 MB, ONE ROW AT A TIME)
      │
      │  v1.0.1  classifyEvent()  ← MEASURED_SENDING_OFF_DESCRIPTIONS (real variants, not guesses)
      │          isSendingOffDescription() / isShootoutDescription() / isOwnGoalDescription()
      v
  event totals  { goals, assists, redCards }
      │
      │  v1.0.1  join on (gameId, playerId) — AppearanceEventIndex
      │          keyed by ~219k appearances, NEVER by 1.27M events
      v
  appearance rows  { ..., goals, assists, redCards }   ← the seed already streams these
      │
      │  v1.0.2  buildLineup() → buildMatchResponse() → LineupPlayer
      v
  frontend  ShirtData.goals / .redCards
      │
      │  v1.0.3  badgesForShirt({ goals, redCards }) → [] | ['scorer'] | ['sent-off'] | both
      v
  shirt badges + accessible name
```

---

## The four decisions that bind all three patches

**1. Degradation is per game and uniform across all 22 shirts.**
The `goals` / `assists` / `redCards` columns are non-nullable and `@default(0)`. There is no null, no unknown, no provenance flag, and none will be added. So `0` means both "did not score" and "this game has no event data", and the UI *cannot* ask which. Therefore: a game seeded before v1.0.1 shows **no badge on any shirt**, and that is the correct answer, not a bug. The app works, and `run_seed` stays gated so existing deployments do not re-download 170 MB on deploy.

**2. Memory is bounded by the appearance count, not the event count.**
The event file is ~1.27M rows. Nothing in v1.0 ever holds more than one event row plus a small accumulator, and the only index is `AppearanceEventIndex` over the ~219k appearances already in flight. Building a `Map` keyed by events, or a per-event array, is the one mistake that turns a working seed into an out-of-memory kill.

**3. The send-off vocabulary is measured, not guessed.**
A literal `Red card` match catches 3,097 dismissals and misses roughly 2,300 second-yellow ones whose description strings vary. v1.0.1 therefore ships a measurement tool that prints the real variant set, and the measured set — not an assumption — becomes `MEASURED_SENDING_OFF_DESCRIPTIONS`. Shootout goals and own goals are treated the same way: measured, labelled, and revisable.

**4. Scoring is not part of v1.0.**
The scorer badge *is* a scored clue in Easy and Normal. The send-off badge is **decoration in every mode**, never scored, never in the multiplier. That asymmetry is not an oversight: the dismissal number is the R2-exposed part of v1.0, and a wrong-looking icon is tolerable while a wrong-looking scoring clue is not. v1.2.2 turns the scorer badge into a clue; v1.0 only decides whether it appears.

---

## Frozen interfaces

Downstream patches and later versions import these by name. Do not rename or reorder them.

```ts
// scripts/src/download-data.ts
const REQUIRED_FILES = ['...', 'game_events.csv'];          // v1.0.1

// backend/src/lib/eventMapping.ts                             // v1.0.1
export function normalizeDescription(value: string): string;
export function isSendingOffDescription(value: string): boolean;
export function isShootoutDescription(value: string): boolean;
export function isOwnGoalDescription(value: string): boolean;
export type ParsedEventType = 'goal' | 'penalty_goal' | 'own_goal' | 'assist' | 'card' | 'substitution';
export function classifyEvent(row: EventCsvRow): ParsedEvent;
export interface EventCsvRow { /* measured column set */ }
export const MEASURED_SENDING_OFF_DESCRIPTIONS: ReadonlySet<string>;

// backend/src/lib/appearanceEventJoin.ts                       // v1.0.1
export interface AppearanceKey { gameId: number; playerId: number; }
export interface EventTotals { goals: number; assists: number; redCards: number; }
export class AppearanceEventIndex { accumulate(row): void; finalize(row): FullAppearanceRow; size(): number; }

// backend/src/services/matchService.ts                        // v1.0.2
//   buildLineup() and buildMatchResponse() each add, per entry:
//   goals: number; assists: number; redCards: number; isCaptain: boolean;

// frontend/types/index.ts                                      // v1.0.2
//   LineupPlayer gains: goals, assists, redCards, isCaptain (all required numbers/booleans)

// frontend/src/lib/shirtBadges.ts                              // v1.0.3
export type ShirtBadge = 'scorer' | 'sent-off';
export function badgesForShirt(input: { goals: number; redCards: number }): ShirtBadge[];
```

Two types are referenced by the join contract but were not spelled out; each plan defines them explicitly and they are part of the frozen surface:

```ts
interface ParsedEventRow { type: ParsedEventType; isAssist: boolean; }
interface FullAppearanceRow extends AppearanceKey, EventTotals {}
```

`isAssist` exists because the frozen `ParsedEventType` union has an `assist` member that the API does not send, so the seed maps a literal `'assist'` marker onto the boolean.

---

## Validation order

Run the gates in this order; each patch's own plan has the per-step detail.

| # | Gate | Command | Expected |
|---|---|---|---|
| 1 | Measure the real vocabulary | `npm run measure-events -w backend -- --apply` | streams without OOM; writes the sentinel region in `eventMapping.ts` |
| 2 | Backend full suite | `cd backend && npm run test:coverage` | 95% lines / 95% branches / 95% functions / 95% statements maintained |
| 3 | Backend types + lint | `cd backend && npx tsc --noEmit && npm run lint` | exit 0 |
| 4 | Frontend full suite | `cd frontend && npm run test:coverage` | 11 test files collected after v1.0.3; all pass |
| 5 | Frontend types + lint | `cd frontend && npx tsc --noEmit && npm run lint` | exit 0 |
| 6 | Vitest include untouched | `git diff HEAD~1 -- frontend/vitest.config.ts` | empty |
| 7 | Decoration-only leak check | `grep -rn "redCards\|badgesForShirt" frontend/src/lib/scoring.ts frontend/src/lib/gameState.ts` | no output |
| 8 | No availability flag | `grep -rn "hasEvents\|goalsKnown\|eventsKnown" frontend/ backend/src/ --include=*.ts --include=*.tsx` | no output |
| 9 | Degraded rendering | run against a non-re-seeded database | no badge anywhere, no error |
| 10 | Release note | `npm run release -- --notes v1.0.X` | section body |

Gates 6, 7 and 8 are cheap greps that catch the three ways this feature can
silently violate its own contract. Run them every time.

---

## Out of scope for v1.0

- **Difficulty modes and clue scoring.** v1.2.1–v1.2.3 own Easy/Normal/Hard/Expert and the multipliers. v1.0 only decides whether a badge appears.
- **Vague and absent-player handling** (v1.1.1, v1.1.2).
- **Widening the vitest `include` to `components/**`** (v1.1.1, R7). Until then, component tests live under `src/`.
- **The `/missing-eleven` player-naming and player-rating work.** Not done in v1.0: none of v1.0.1 (event data), v1.0.2 (API exposure and indexes) or v1.0.3 (event icons) touches it. It is also **decided out of v1.x as a whole**, and that wider exclusion is recorded authoritatively in the roadmap's **§10 Out of scope** table, not here — this list is v1.0-scoped and should not be the source of a v1.x-wide claim. The record is worth keeping because an earlier draft of this line assigned the work to "v1.1.3", which is wrong twice over: §4.4 defines v1.1.3 as the Team multi-select, and no patch table in the roadmap (§3, §4.4, §5.6, §6.3, §7) assigns naming or rating to any patch. It is unowned by decision, not misrouted: inventing an owner in a patch that does not do that work would put a task into an implementer's queue with no plan behind it. Adopting it later needs a **new patch with its own plan** — not a slot in an existing one.
- **Any change to `Appearance` indexes, `ShirtProps`, `Game` relations, the seed's `run_seed` gate, or the release tooling.** v1.0 adds exactly three `Game` indexes and no others.
- **v1.0.x is not a gate on v1.2** (§11 Rule 7). v1.2 must render and score correctly with the scorers clue *absent*, because a deployment may skip v1.0 entirely.

---

## Handoff to v1.2

1. **`badgesForShirt(input): ShirtBadge[]`** — the clue-availability question, answerable without importing React. Easy and Normal read it; Hard and Expert do not.
2. **`ShirtBadge = 'scorer' | 'sent-off'`** — the discriminated pair a mode keys on. Only `'scorer'` is ever a clue.
3. **The rule that absence is silent and uniform per game** — v1.2's scorer-clue logic must handle "no scorers" as the normal, expected case, not as an error branch.
4. **The contract direction** — v1.0 delivers `goals` / `assists` / `redCards` / `isCaptain` on `LineupPlayer`. v1.2 builds on those names and does not rename them.

---

## Risks

| Risk | Impact | Where it is handled |
|---|---|---|
| **R2 — the dismissal vocabulary is measured, not known** | A wrong-looking red card icon | Kept to decoration in every mode; never scored, never in the multiplier |
| Event file is ~170 MB | Seed OOM, deploy failure | One-row-at-a-time streaming; index bounded by ~219k appearances, not 1.27M events |
| `run_seed` is gated | Nothing to show on an unseeded database | Per-game degradation decision #1: silent, uniform, no flag |
| An availability flag gets "helpfully" added | The forbidden escape hatch | Decisions #1 and #2, plus gate 8 |
| Component test lands outside `src/` | Green run, zero coverage (R7) | v1.0.3 places it at `frontend/src/components/`, plus gates 6 and the 11-file count |
| Measurable totals drift from stored data | Stale badges | The measurement tool is committed, not a one-off shell command; re-runnable and label-complete |
