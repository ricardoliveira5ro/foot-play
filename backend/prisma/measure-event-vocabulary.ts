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

/**
 * The measured `type` value that carries cards. Guarding on it is what keeps
 * the `red` substring trap out of the dismissal set.
 */
const CARDS_TYPE = 'cards';

/**
 * Anchored dismissal families, measured against the real file.
 *
 * Never `includes('red')`: `", Scored"` (9,995 shootout rows) contains
 * *Sco-RED*. Never `includes('2.')`: that is tournament goal numbering, not
 * a second yellow. Descriptions are anchored because every non-Cards
 * description is prefixed with `", "`.
 */
const SENDING_OFF_FAMILIES = [/^red card\b/, /^second yellow\b/];

function isSendingOffFamily(type: string, description: string): boolean {
  if (type !== CARDS_TYPE) return false;
  return SENDING_OFF_FAMILIES.some((family) => family.test(description));
}

/** Substrings the reviewer must read; the tool buckets, never decides. */
const REVIEW_BUCKETS: { label: string; needle: string }[] = [
  { label: 'direct red card', needle: 'red card' },
  { label: 'second yellow', needle: 'second yellow' },
  { label: 'yellow card', needle: 'yellow card' },
  { label: 'own goal', needle: 'own goal' },
  { label: 'shootout', needle: 'shootout' },
  { label: 'penalty', needle: 'penalty' },
  { label: 'substitution', needle: 'tactical' },
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
  const cardsWithoutYellow = new Set<string>();
  const assist = { withAssister: 0, selfAssist: 0, onNonGoal: 0 };

  for await (const row of parser) {
    rows++;
    if (columns.length === 0) columns = Object.keys(row as Record<string, unknown>);

    const rawType = String(row.type ?? '');
    const rawDescription = String(row.description ?? '');
    const normalizedType = normalize(rawType);
    const normalizedDescription = normalize(rawDescription);

    typeCounts.set(rawType, (typeCounts.get(rawType) ?? 0) + 1);

    const pairKey = `${rawType} ||| ${rawDescription}`;
    pairCounts.set(pairKey, (pairCounts.get(pairKey) ?? 0) + 1);

    // See SENDING_OFF_FAMILIES: type-gated and anchored, so neither
    // ", Scored" nor tournament goal numbering can reach the dismissal set.
    if (isSendingOffFamily(normalizedType, normalizedDescription)) {
      sendingOff.add(rawDescription);
    }

    // Completeness probe: if this is ever non-empty, the matcher has a third
    // card family it does not know about and the decision table is incomplete.
    if (normalizedType === CARDS_TYPE && !normalizedDescription.includes('yellow')) {
      if (!isSendingOffFamily(normalizedType, normalizedDescription)) {
        cardsWithoutYellow.add(rawDescription);
      }
    }

    const scorer = String(row.player_id ?? '').trim();
    const assister = String(row.player_assist_id ?? '').trim();
    if (assister !== '') {
      assist.withAssister += 1;
      if (assister === scorer) assist.selfAssist += 1;
      if (normalizedType !== 'goals') assist.onNonGoal += 1;
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

  console.log('=== 7. ASSIST COLUMN (player_assist_id) ===');
  console.log(`rows with an assister : ${assist.withAssister}`);
  console.log(`  of which self-assist: ${assist.selfAssist}`);
  console.log(`  on a non-Goals type  : ${assist.onNonGoal}`);
  console.log();

  if (cardsWithoutYellow.size > 0) {
    console.log('=== 8. UNCLASSIFIED Cards rows (must be empty) ===');
    for (const description of [...cardsWithoutYellow].sort()) {
      console.log(`  ${JSON.stringify(description)}`);
    }
    console.log();
  }

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
