import { readFile } from 'fs/promises';
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { cleanDisplayName } from '../../scripts/src/name-cleaning';
import path from 'path';

interface CuratedTeams {                                                  
    clubIds: { id: number; name: string }[];                              
    nationalTeamIds: { id: number; name: string }[];                      
}

interface Team {
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
    opponentTeamId: number;
    homeClubId: number;
    awayClubId: number;
    homeClubGoals: number;
    awayClubGoals: number;
    homeClubFormation: string;
    awayClubFormation: string;
    stadium: string;
}

interface Appearance { 
    gameId: number;
    clubId: number;
    playerId: number;
    number: number;
    type: string;
    position: string;
    isCaptain: boolean;
}

interface Competition {
    competitionId: string;
    name: string;
}

interface Player {
    playerId: number;
    name: string;
    displayName: string;
    position: string;
    subPosition: string;
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

async function processClubsDataset(clubIds: Set<Number>, clubs: Team[], candidateClubOpponentsNameById: Map<number, string>): Promise<void> {
    const parser = createReadStream(path.join(__dirname, '../../scripts/data/clubs.csv')).pipe(
        parse({ columns: true, relax_column_count: true })
    );

    for await (const row of parser) {
        const clubId = Number(row.club_id);

        if (clubIds.has(clubId))
            clubs.push({ clubId, name: row.name })
        else
            candidateClubOpponentsNameById.set(clubId, row.name);
    }
}

async function processNationsDataset(nationsIds: Set<Number>, nations: Team[], candidateNationOpponentsNameById: Map<number, string>): Promise<void> {
    const parser = createReadStream(path.join(__dirname, '../../scripts/data/national_teams.csv')).pipe(
        parse({ columns: true, relax_column_count: true })
    );

    for await (const row of parser) {
        const nationId = Number(row.national_team_id);

        if (nationsIds.has(nationId))
            nations.push({ clubId: nationId, name: row.name })
        else
            candidateNationOpponentsNameById.set(nationId, row.name);
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
            candidateGames.push({ gameId: row.game_id, competitionId: row.competition_id, season: row.season || null, round: row.round || null, date: row.date || null, targetTeamId: homeClubId, opponentTeamId: awayClubId, homeClubId, awayClubId, homeClubGoals: row.home_club_goals || null, awayClubGoals: row.away_club_goals || null, homeClubFormation: row.home_club_formation || null, awayClubFormation: row.away_club_formation || null, stadium: row.stadium || null })
            candidateGameIds.add(Number(row.game_id));
        } else if (allowedTeamIds.has(awayClubId)) {
            candidateGames.push({ gameId: row.game_id, competitionId: row.competition_id, season: row.season || null, round: row.round || null, date: row.date || null, targetTeamId: awayClubId, opponentTeamId: homeClubId, homeClubId, awayClubId, homeClubGoals: row.home_club_goals || null, awayClubGoals: row.away_club_goals || null, homeClubFormation: row.home_club_formation || null, awayClubFormation: row.away_club_formation || null, stadium: row.stadium || null })
            candidateGameIds.add(Number(row.game_id));
        }
    }
}

async function processGameLineupsDataset(candidateGames: Game[], candidateGameIds: Set<number>, appearances: Appearance[], games: Game[]) {
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

function processOpponentTeams(games: Game[], opponents: Team[], candidateClubOpponentsNameById: Map<number, string>, candidateNationOpponentsNameById: Map<number, string>) {
    const finalOpponentsIds = new Set<number>();
    
    games.forEach(g => {
        const oppTeamId = g.opponentTeamId;

        if (!finalOpponentsIds.has(oppTeamId)) {
            finalOpponentsIds.add(oppTeamId);

            const oppTeamName = candidateClubOpponentsNameById.get(oppTeamId) || candidateNationOpponentsNameById.get(oppTeamId) || "";
            opponents.push({ clubId: oppTeamId, name: oppTeamName });
        }
    });
}

async function processCompetitionsDataset(games: Game[], competitions: Competition[]) {
    const finalCompetitionIds = new Set<string>();

    games.forEach(g => {
        const competitionId = g.competitionId;

        if (!finalCompetitionIds.has(competitionId))
            finalCompetitionIds.add(competitionId);
    })
    
    const parser = createReadStream(path.join(__dirname, '../../scripts/data/competitions.csv')).pipe(
        parse({ columns: true, relax_column_count: true })
    );
    
    for await (const row of parser) {
        const competitionId = row.competition_id;

        if (finalCompetitionIds.has(competitionId)) {
            competitions.push({
                competitionId, 
                name: row.name
            })
        }
    }
}

async function processPlayersDataset(players: Player[], appearances: Appearance[]) {
    const finalPlayerIds = new Set<number>();

    appearances.forEach(a => {
        const playerId = a.playerId;

        if (!finalPlayerIds.has(playerId))
            finalPlayerIds.add(playerId);
    });

    const parser = createReadStream(path.join(__dirname, '../../scripts/data/players.csv')).pipe(
        parse({ columns: true, relax_column_count: true })
    );

    for await (const row of parser) {
        const playerId = Number(row.player_id);

        if (finalPlayerIds.has(playerId)) {
            players.push({
                playerId,
                name: row.name,
                displayName: cleanDisplayName(row.last_name, row.name, row.first_name),
                position: row.position,
                subPosition: row.sub_position
            })
        }
    }
}

async function main(): Promise<void> {
    const curatedTeams = await getCuratedTeams();

    const clubIds = new Set<number>(curatedTeams.clubIds);
    const nationsIds = new Set<number>(curatedTeams.nationsIds);
    const allowedTeamIds = new Set<number>(curatedTeams.allowedTeamIds);

    const clubs: Team[] = [];
    const nations: Team[] = [];

    const candidateClubOpponentsNameById = new Map<number, string>();
    const candidateNationOpponentsNameById = new Map<number, string>();
    
    await processClubsDataset(clubIds, clubs, candidateClubOpponentsNameById);
    await processNationsDataset(nationsIds, nations, candidateNationOpponentsNameById);

    const candidateGames: Game[] = [];
    const candidateGameIds = new Set<number>();

    await processGamesDataset(allowedTeamIds, candidateGames, candidateGameIds);

    const appearances: Appearance[] = [];
    const games: Game[] = [];
    
    await processGameLineupsDataset(candidateGames, candidateGameIds, appearances, games);

    const opponents: Team[] = [];
    
    processOpponentTeams(games, opponents, candidateClubOpponentsNameById, candidateNationOpponentsNameById);

    const competitions: Competition[] = [];

    await processCompetitionsDataset(games, competitions);

    const players: Player[] = [];

    await processPlayersDataset(players, appearances);
}

main();