import { readFile } from 'fs/promises';
import path from 'path';

async function getCuratedTeams(): Promise<string[]> {
    try {
        const data = JSON.parse(await readFile(path.join(__dirname, '../../scripts/curated-teams.json'), 'utf8'));

        const clubs = data.clubIds.map((c: { id: string; }) => c.id);
        const nations = data.nationalTeamIds.map((n: { id: string; }) => n.id);
    
        return [...clubs, ...nations];
    } catch (err) {
        console.error(`Error parsing curated teams: ${err}`);
    }

    return [];
}

async function main(): Promise<void> {
    await getCuratedTeams();
}

main();