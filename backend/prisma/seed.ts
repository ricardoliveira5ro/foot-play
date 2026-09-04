import dotenv from 'dotenv';
import { readFile } from 'fs/promises';
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { cleanDisplayName } from '../../scripts/src/name-cleaning';
import { normalizeCompetitionName, MISSING_COMPETITIONS } from '../../scripts/src/competition-names';
import { normalizeTeamName } from '../../scripts/src/team-names';
import path from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../src/generated/prisma/client';

dotenv.config({ path: path.resolve(__dirname, '../../.env.development') });

interface CuratedTeams {                                                  
    clubIds: { id: number; name: string }[];                              
    nationalTeamIds: { id: number; name: string }[];                      
}

interface Team {
    clubId: number;
    name: string;
    isNationalTeam?: boolean;
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

const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

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
            clubs.push({ clubId, name: row.name, isNationalTeam: false })
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
            nations.push({ clubId: nationId, name: row.name, isNationalTeam: true })
        else
            candidateNationOpponentsNameById.set(nationId, row.name);
    }
}

async function processGamesDataset(allowedTeamIds: Set<Number>, candidateGames: Game[], candidateGameIds: Set<number>, gameOpponentNamesById: Map<number, string>): Promise<void> {
    const parser = createReadStream(path.join(__dirname, '../../scripts/data/games.csv')).pipe(
        parse({ columns: true, relax_column_count: true })
    );

    for await (const row of parser) {
        const homeClubId = Number(row.home_club_id);
        const awayClubId = Number(row.away_club_id);

        if (allowedTeamIds.has(homeClubId)) {
            if (row.home_club_name) gameOpponentNamesById.set(homeClubId, row.home_club_name);
            if (row.away_club_name) gameOpponentNamesById.set(awayClubId, row.away_club_name);
            candidateGames.push({ gameId: Number(row.game_id), competitionId: row.competition_id, season: row.season || null, round: row.round || null, date: row.date || null, targetTeamId: homeClubId, opponentTeamId: awayClubId, homeClubId, awayClubId, homeClubGoals: row.home_club_goals || null, awayClubGoals: row.away_club_goals || null, homeClubFormation: row.home_club_formation || null, awayClubFormation: row.away_club_formation || null, stadium: row.stadium || null })
            candidateGameIds.add(Number(row.game_id));
        } else if (allowedTeamIds.has(awayClubId)) {
            if (row.home_club_name) gameOpponentNamesById.set(homeClubId, row.home_club_name);
            if (row.away_club_name) gameOpponentNamesById.set(awayClubId, row.away_club_name);
            candidateGames.push({ gameId: Number(row.game_id), competitionId: row.competition_id, season: row.season || null, round: row.round || null, date: row.date || null, targetTeamId: awayClubId, opponentTeamId: homeClubId, homeClubId, awayClubId, homeClubGoals: row.home_club_goals || null, awayClubGoals: row.away_club_goals || null, homeClubFormation: row.home_club_formation || null, awayClubFormation: row.away_club_formation || null, stadium: row.stadium || null })
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

    const parser2 = createReadStream(path.join(__dirname, '../../scripts/data/game_lineups.csv')).pipe(
        parse({ columns: true, relax_column_count: true })
    );

    for await (const row of parser2) {
        if (row.type !== 'starting_lineup') continue;
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

function processOpponentTeams(games: Game[], opponents: Team[], candidateClubOpponentsNameById: Map<number, string>, candidateNationOpponentsNameById: Map<number, string>, gameOpponentNamesById: Map<number, string>) {
    const finalOpponentsIds = new Set<number>();
    const fallbackOpponents: number[] = [];
    const missingOpponentNames: number[] = [];
    
    games.forEach(g => {
        const oppTeamId = g.opponentTeamId;

        if (!finalOpponentsIds.has(oppTeamId)) {
            finalOpponentsIds.add(oppTeamId);

            const clubName = candidateClubOpponentsNameById.get(oppTeamId);
            const nationName = candidateNationOpponentsNameById.get(oppTeamId);
            const gameName = gameOpponentNamesById.get(oppTeamId);
            const oppTeamName = clubName || nationName || gameName || "";

            if (!clubName && !nationName && gameName)
                fallbackOpponents.push(oppTeamId);
            else if (!oppTeamName)
                missingOpponentNames.push(oppTeamId);

            opponents.push({ clubId: oppTeamId, name: oppTeamName, isNationalTeam: false });
        }
    });

    if (fallbackOpponents.length > 0)
        console.warn(`${fallbackOpponents.length} opponent teams fell back to games.csv name (not in clubs.csv/national_teams.csv)`);
    if (missingOpponentNames.length > 0)
        console.warn(`${missingOpponentNames.length} opponent teams had no name found in any dataset; inserting empty name`);
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
                name: normalizeCompetitionName(competitionId, row.name)
            })
        }
    }

    for (const [id, name] of Object.entries(MISSING_COMPETITIONS)) {
        if (finalCompetitionIds.has(id))
            competitions.push({ competitionId: id, name });
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

function toNullableString(value: string | null | undefined): string | null {
    return value === '' || value === null || value === undefined ? null : value;
}

function toNullableNumber(value: string | number | null | undefined): number | null {
    if (value === '' || value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
}

function toNullableDate(value: string | null | undefined): Date | null {
    if (value === '' || value === null || value === undefined) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

function toSeason(value: string | null | undefined): number | null {
    if (value === '' || value === null || value === undefined) return null;
    const yearMatch = value.match(/\d{4}/);
    return yearMatch ? Number(yearMatch[0]) : null;
}

function toCompetitionData(rows: Competition[]): Prisma.CompetitionCreateManyInput[] {
    return rows.map(c => ({
        competitionId: c.competitionId,
        name: c.name,
    }));
}

function toClubData(rows: Team[]): Prisma.ClubCreateManyInput[] {
    return rows.map(t => ({
        clubId: t.clubId,
        name: normalizeTeamName(t.clubId, t.name),
        isNationalTeam: t.isNationalTeam,
    }));
}

function toPlayerData(rows: Player[]): Prisma.PlayerCreateManyInput[] {
    return rows.map(p => ({
        playerId: p.playerId,
        name: p.name,
        displayName: toNullableString(p.displayName),
        position: toNullableString(p.position),
        subPosition: toNullableString(p.subPosition),
    }));
}

function toGameData(rows: Game[]): Prisma.GameCreateManyInput[] {
    return rows.map(g => ({
        gameId: g.gameId,
        competitionId: g.competitionId,
        season: toSeason(g.season),
        round: toNullableString(g.round),
        date: toNullableDate(g.date),
        homeClubId: g.homeClubId,
        awayClubId: g.awayClubId,
        targetTeamId: g.targetTeamId,
        opponentTeamId: g.opponentTeamId,
        homeClubGoals: toNullableNumber(g.homeClubGoals),
        awayClubGoals: toNullableNumber(g.awayClubGoals),
        homeClubFormation: toNullableString(g.homeClubFormation),
        awayClubFormation: toNullableString(g.awayClubFormation),
        stadium: toNullableString(g.stadium),
    }));
}

function toAppearanceData(rows: Appearance[]): Prisma.AppearanceCreateManyInput[] {
    return rows.map(a => ({
        gameId: a.gameId,
        clubId: a.clubId,
        playerId: a.playerId,
        number: toNullableNumber(a.number),
        type: a.type,
        position: toNullableString(a.position),
        isCaptain: a.isCaptain,
    }));
}

function dedupeAppearances(appearances: Appearance[]): Appearance[] {
    const seen = new Set<string>();
    const deduped: Appearance[] = [];

    for (const a of appearances) {
        const key = `${a.gameId}:${a.playerId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(a);
    }

    const dropped = appearances.length - deduped.length;
    if (dropped > 0)
        console.warn(`Dropped ${dropped} duplicate appearance rows (same gameId+playerId)`);

    return deduped;
}

async function insertInBatches<T>(delegate: { createMany: (args: { data: T[] }) => Promise<unknown> }, rows: T[]) {
    const BATCH = 500;

    for (let i = 0; i < rows.length; i += BATCH) {
        await delegate.createMany({ data: rows.slice(i, i + BATCH) });
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
    const gameOpponentNamesById = new Map<number, string>();

    await processGamesDataset(allowedTeamIds, candidateGames, candidateGameIds, gameOpponentNamesById);

    const appearances: Appearance[] = [];
    const games: Game[] = [];
    
    await processGameLineupsDataset(candidateGames, candidateGameIds, appearances, games);

    const opponents: Team[] = [];
    
    processOpponentTeams(games, opponents, candidateClubOpponentsNameById, candidateNationOpponentsNameById, gameOpponentNamesById);

    const competitions: Competition[] = [];

    await processCompetitionsDataset(games, competitions);

    const players: Player[] = [];

    await processPlayersDataset(players, appearances);

    // Dedupe across clubs/nations/opponents: first occurrence wins for the
    // name (previous behavior), but a duplicate row flagged as a national
    // team never loses the flag (a curated id can appear in both lists or
    // re-appear as an opponent).
    const uniqueClubsMap = new Map<number, Team>();
    for (const t of [...clubs, ...nations, ...opponents]) {
        const existing = uniqueClubsMap.get(t.clubId);
        if (existing === undefined) {
            uniqueClubsMap.set(t.clubId, t);
        } else if (t.isNationalTeam) {
            existing.isNationalTeam = true;
        }
    }
    const uniqueClubs = [...uniqueClubsMap.values()];

    const seededPlayerIds = new Set<number>(players.map(p => p.playerId));
    const keptAppearances = appearances.filter(a => seededPlayerIds.has(a.playerId));
    const droppedAppearances = appearances.length - keptAppearances.length;

    if (droppedAppearances > 0)
        console.warn(`Skipping ${droppedAppearances} appearances whose players are missing from players.csv`);

    // Drop entire sides (gameId+clubId) that don't have all 11 starting
    // players present in players.csv. A partial lineup in the DB is worse
    // than no lineup at all.
    const sideCounts = new Map<string, number>();
    for (const a of keptAppearances) {
        const key = `${a.gameId}:${a.clubId}`;
        sideCounts.set(key, (sideCounts.get(key) ?? 0) + 1);
    }
    const completeSideKeys = new Set<string>();
    let droppedSides = 0;
    for (const [key, count] of sideCounts) {
        if (count >= 11) {
            completeSideKeys.add(key);
        } else {
            droppedSides++;
        }
    }
    if (droppedSides > 0)
        console.warn(`Dropped ${droppedSides} sides with incomplete lineups (fewer than 11 starting players found in players.csv)`);
    const sideFilteredAppearances = keptAppearances.filter(a =>
        completeSideKeys.has(`${a.gameId}:${a.clubId}`)
    );

    try {
      console.log('Starting prisma batch');

      // Reset all tables in FK-safe order so `npm run seed` is idempotent.
      // The explicit timeout covers large tables (e.g. ~200k appearances)
      // where the default 5s transaction timeout can be exceeded.
      await prisma.$transaction([
          prisma.appearance.deleteMany(),
          prisma.game.deleteMany(),
          prisma.player.deleteMany(),
          prisma.club.deleteMany(),
          prisma.competition.deleteMany(),
      ], { timeout: 120000 });

      await insertInBatches(prisma.competition, toCompetitionData(competitions));
      await insertInBatches(prisma.club, toClubData(uniqueClubs));
      await insertInBatches(prisma.player, toPlayerData(players));
      await insertInBatches(prisma.game, toGameData(games));
      await insertInBatches(prisma.appearance, toAppearanceData(dedupeAppearances(sideFilteredAppearances)));

    } finally {
        console.log('Batch done');
        await prisma.$disconnect();
    }
}

main();