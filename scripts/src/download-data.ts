import axios from 'axios';
import AdmZip from 'adm-zip';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import * as zlib from 'zlib';

const REPO_URL = 'https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/transfermarkt-datasets.zip';
const TARGET_DIR = path.resolve(__dirname, '..', 'data');
const REQUIRED_FILES = ['players.csv', 'clubs.csv', 'games.csv', 'game_lineups.csv', 'competitions.csv'] as const;

const REQUIRED_COLUMNS: Record<string, string[]> = {
  'players.csv': ['player_id', 'name', 'first_name', 'last_name', 'position', 'sub_position'],
  'clubs.csv': ['club_id', 'name', 'domestic_competition_id'],
  'games.csv': ['game_id', 'competition_id', 'season', 'date', 'home_club_id', 'away_club_id', 'home_club_name', 'away_club_name'],
  'game_lineups.csv': ['game_lineups_id', 'game_id', 'player_id', 'club_id', 'type'],
  'competitions.csv': ['competition_id', 'name', 'type', 'country_name'],
};

function log(message: string): void {
  console.log(`[data-pipeline] ${message}`);
}

function logError(message: string): void {
  console.error(`[data-pipeline] ${message}`);
}

async function downloadZip(): Promise<Buffer> {
  log('Downloading...');
  const response = await axios.get(REPO_URL, {
    responseType: 'arraybuffer',
    timeout: 120000,
  });
  return Buffer.from(response.data);
}

async function main(): Promise<void> {
  try {
    if (REQUIRED_FILES.every((file) => existsSync(path.join(TARGET_DIR, file)))) {
      log('Cache hit — all CSVs present. Skipping download.');
      process.exit(0);
    }

    log('Download starting');

    const zipBuffer = await downloadZip();

    await extractZip(zipBuffer);

    log('Validating columns...');
    validateHeaders();

    log('Done.');
  } catch (err) {
    logError(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
