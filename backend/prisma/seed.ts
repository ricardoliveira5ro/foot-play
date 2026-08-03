import { readFile } from 'fs/promises';
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import path from 'path';

interface CuratedTeams {                                                  
    clubIds: { id: number; name: string }[];                              
    nationalTeamIds: { id: number; name: string }[];                      
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

async function processClubsDataset(clubIds: Set<Number>, clubs: {}[], clubNameById: Map<number, string>): Promise<void> {
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

async function processNationsDataset(nationsIds: Set<Number>, nations: {}[], nationNameById: Map<number, string>): Promise<void> {
    const parser = createReadStream(path.join(__dirname, '../../scripts/data/national_teams.csv')).pipe(
        parse({ columns: true, relax_column_count: true })
    );

    for await (const row of parser) {
        const nationId = Number(row.national_team_id);

        if (nationsIds.has(nationId)) {
            nations.push({ nationId, name: row.name })
        }

        nationNameById.set(nationId, row.name);
    }
}

async function processGamesDataset(allowedTeamIds: Set<Number>, candidateGames: {}[]): Promise<void> {
    const parser = createReadStream(path.join(__dirname, '../../scripts/data/games.csv')).pipe(
        parse({ columns: true, relax_column_count: true })
    );

    for await (const row of parser) {
        const homeClubId = Number(row.home_club_id);
        const awayClubId = Number(row.away_club_id);

        if (allowedTeamIds.has(homeClubId)) {
            candidateGames.push({ gameId: row.game_id, competitionId: row.competition_id, season: row.season || null, round: row.round || null, date: row.date || null, targetTeamId: homeClubId, homeClubId, awayClubId, homeClubGoals: row.home_club_goals || null, awayClubGoals: row.away_club_goals || null, homeClubFormation: row.home_club_formation || null, awayClubFormation: row.away_club_formation || null, stadium: row.stadium || null })
        } else if (allowedTeamIds.has(awayClubId)) {
            candidateGames.push({ gameId: row.game_id, competitionId: row.competition_id, season: row.season || null, round: row.round || null, date: row.date || null, targetTeamId: awayClubId, homeClubId, awayClubId, homeClubGoals: row.home_club_goals || null, awayClubGoals: row.away_club_goals || null, homeClubFormation: row.home_club_formation || null, awayClubFormation: row.away_club_formation || null, stadium: row.stadium || null })
        }
    }
}

async function main(): Promise<void> {
    const curatedTeams = await getCuratedTeams();

    const clubIds = new Set<number>(curatedTeams.clubIds);
    const nationsIds = new Set<number>(curatedTeams.nationsIds);
    const allowedTeamIds = new Set<number>(curatedTeams.allowedTeamIds);

    const clubs: { clubId: number; name: string }[] = [];
    const clubNameById = new Map<number, string>();
    const nations: { nationId: number; name: string }[] = [];
    const nationNameById = new Map<number, string>();
    
    await processClubsDataset(clubIds, clubs, clubNameById);
    await processNationsDataset(nationsIds, nations, nationNameById);

    const candidateGames: { gameId: number, competitionId: string, season: string, round: string, date: string, targetTeamId: number, homeClubId: number, awayClubId: number, homeClubGoals: number, awayClubGoals: number, homeClubFormation: string, awayClubFormation: string, stadium: string }[] = [];

    await processGamesDataset(allowedTeamIds, candidateGames)
}

main();