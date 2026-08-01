import axios from 'axios';
import AdmZip from 'adm-zip';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import path from 'path';
import * as zlib from 'zlib';

const DATA_URL = 'https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/transfermarkt-datasets.zip';
const TARGET_DIR = path.resolve(__dirname, '..', 'data');
const REQUIRED_FILES = ['players.csv','clubs.csv','games.csv','game_lineups.csv','competitions.csv','national_teams.csv'];

async function downloadZip(): Promise<Buffer> {
  console.log('[download-data] Downloading...');

  const response = await axios.get(DATA_URL, {
    responseType: 'arraybuffer',
    timeout: 120000,
  });

  console.log('[download-data] Downloaded', response.data.length, 'bytes');

  return response.data;
}

function extractFiles(zipBuffer: Buffer): void {
  if (!existsSync(TARGET_DIR)) {
    mkdirSync(TARGET_DIR, { recursive: true });
  }

  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();

  for (const entry of entries) {
    const entryName: string = entry.entryName;
    const baseName = entryName.endsWith('.gz') ? entryName.slice(0, -3) : entryName;

    if (REQUIRED_FILES.includes(baseName)) {
      console.log('[download-data] Extracting', baseName, '...');

      const compressed = entry.getData();
      const decompressed = zlib.gunzipSync(compressed);
      
      writeFileSync(path.join(TARGET_DIR, baseName), decompressed);
    }
  }
}

async function main(): Promise<void> {
  if (REQUIRED_FILES.every((file) => existsSync(path.join(TARGET_DIR, file)))) {
    console.log('[download-data] All CSVs present. Skipping download.');
    process.exit(0);
  }

  console.log('[download-data] Downloading...');

  try {
    const zipBuffer = await downloadZip();
    extractFiles(zipBuffer);
    console.log('[download-data] Done.');

  } catch (err: any) {
    console.error('[download-data] ERROR:', err.message || err);
    process.exit(1);
  }
}

main();
