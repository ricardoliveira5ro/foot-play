import { readFile } from 'fs/promises';
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import path from 'path';

interface CuratedTeams {                                                  
    clubIds: { id: number; name: string }[];                              
    nationalTeamIds: { id: number; name: string }[];                      
}

interface Club {
    clubId: number;
    name: string;
}

interface Game { 
    gameId: number;
    competitionId: string;
    season: string;
    round: string;
    date: string;
    targetTeamId: number;
    homeClubId: number;
    awayClubId: number;
    homeClubGoals: number;
    awayClubGoals: number;
    homeClubFormation: string;
    awayClubFormation: string;
    stadium: string;
}

async function getCuratedTeams() {
    const data = JSON.parse(await readFile(path.join(__dirname, '../../scripts/curated-teams.json'), 'utf8')) as CuratedTeams;

    const clubIds = data.clubIds.map(c => Number(c.id));
    const nationsIds = data.nationalTeamIds.map(n => Number(n.id));

    return {                                                              
        clubIds,                                                          
        nationsIds,                                                  
        allowedTeamIds: new Set<number>([...clubIds, ...nationsIds]),
    }; 
}

async function processClubsDataset(clubIds: Set<Number>, clubs: Club[], clubNameById: Map<number, string>): Promise<void> {
    const parser = createReadStream(path.join(__dirname, '../../scripts/data/clubs.csv')).pipe(
        parse({ columns: true, relax_column_count: true })
    );

    for await (const row of parser) {
        const clubId = Number(row.club_id);

        if (clubIds.has(clubId)) {
            clubs.push({ clubId, name: row.name })
        }

        clubNameById.set(clubId, row.name);
    }
}

async function processNationsDataset(nationsIds: Set<Number>, nations: Club[], nationNameById: Map<number, string>): Promise<void> {
    const parser = createReadStream(path.join(__dirname, '../../scripts/data/national_teams.csv')).pipe(
        parse({ columns: true, relax_column_count: true })
    );

    for await (const row of parser) {
        const nationId = Number(row.national_team_id);

        if (nationsIds.has(nationId)) {
            nations.push({ clubId: nationId, name: row.name })
        }

        nationNameById.set(nationId, row.name);
    }
}

async function processGamesDataset(allowedTeamIds: Set<Number>, candidateGames: Game[], candidateGameIds: Set<number>): Promise<void> {
    const parser = createReadStream(path.join(__dirname, '../../scripts/data/games.csv')).pipe(
        parse({ columns: true, relax_column_count: true })
    );

    for await (const row of parser) {
        const homeClubId = Number(row.home_club_id);
        const awayClubId = Number(row.away_club_id);

        if (allowedTeamIds.has(homeClubId)) {
            candidateGames.push({ gameId: row.game_id, competitionId: row.competition_id, season: row.season || null, round: row.round || null, date: row.date || null, targetTeamId: homeClubId, homeClubId, awayClubId, homeClubGoals: row.home_club_goals || null, awayClubGoals: row.away_club_goals || null, homeClubFormation: row.home_club_formation || null, awayClubFormation: row.away_club_formation || null, stadium: row.stadium || null })
            candidateGameIds.add(Number(row.game_id));
        } else if (allowedTeamIds.has(awayClubId)) {
            candidateGames.push({ gameId: row.game_id, competitionId: row.competition_id, season: row.season || null, round: row.round || null, date: row.date || null, targetTeamId: awayClubId, homeClubId, awayClubId, homeClubGoals: row.home_club_goals || null, awayClubGoals: row.away_club_goals || null, homeClubFormation: row.home_club_formation || null, awayClubFormation: row.away_club_formation || null, stadium: row.stadium || null })
            candidateGameIds.add(Number(row.game_id));
        }
    }
}

async function processGameLineups(candidateGames: Game[], candidateGameIds: Set<number>, appearances: {}[], games: Game[]) {
    const counts = new Map<string, number>();            
    
    const parser = createReadStream(path.join(__dirname, '../../scripts/data/game_lineups.csv')).pipe(
        parse({ columns: true, relax_column_count: true })
    );
                                                                              
    for await (const row of parser) {
        const gameId = Number(row.game_id);
        if (!candidateGameIds.has(gameId) || row.type !== 'starting_lineup')
            continue;
                          
        const key = `${row.game_id}:${row.club_id}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const fullXiKeys = new Set<string>(
        [...counts].filter(([, count]) => count === 11).map(([key]) => key),
    );

    const finalGameIds = new Set<number>();
    for (const key of fullXiKeys) {
        finalGameIds.add(Number(key.split(':')[0]));
    }

    games.push(...(candidateGames.filter(cg => finalGameIds.has(cg.gameId))));

    for await (const row of parser) {
        const key = `${row.game_id}:${row.club_id}`;
        if (!fullXiKeys.has(key)) continue;

        appearances.push({
            gameId: Number(row.game_id),
            clubId: Number(row.club_id),
            playerId: Number(row.player_id),
            number: Number(row.number),
            type: row.type,
            position: row.position,
            isCaptain: Boolean(Number(row.team_captain)),
        });
    }
}

async function main(): Promise<void> {
    const curatedTeams = await getCuratedTeams();

    const clubIds = new Set<number>(curatedTeams.clubIds);
    const nationsIds = new Set<number>(curatedTeams.nationsIds);
    const allowedTeamIds = new Set<number>(curatedTeams.allowedTeamIds);

    const clubs: Club[] = [];
    const clubNameById = new Map<number, string>();
    const nations: Club[] = [];
    const nationNameById = new Map<number, string>();
    
    await processClubsDataset(clubIds, clubs, clubNameById);
    await processNationsDataset(nationsIds, nations, nationNameById);

    const candidateGames: Game[] = [];
    const candidateGameIds = new Set<number>();

    await processGamesDataset(allowedTeamIds, candidateGames, candidateGameIds);

    const appearances: { gameId: number; clubId: number; playerId: number }[] = [];
    const games: Game[] = [];
    
    await processGameLineups(candidateGames, candidateGameIds, appearances, games);
}

main();