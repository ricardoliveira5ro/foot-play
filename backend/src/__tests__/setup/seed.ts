import { prisma } from '../../prisma';

/**
 * Idempotent test seed: wipes all tables (FK order) then recreates minimal
 * data. Safe to call mid-run to restore state after destructive tests.
 */
export async function seed(): Promise<void> {
  await prisma.appearance.deleteMany();
  await prisma.game.deleteMany();
  await prisma.player.deleteMany();
  await prisma.club.deleteMany();
  await prisma.competition.deleteMany();

  await prisma.competition.create({
    data: { competitionId: 'TEST-COMP', name: 'Test League' },
  });

  await prisma.club.createMany({
    data: [
      { clubId: 1, name: 'Test FC', isNationalTeam: false },
      { clubId: 2, name: 'Test United', isNationalTeam: false },
    ],
  });

  await prisma.player.createMany({
    data: [
      { playerId: 101, name: 'Lionel Messi', displayName: 'Messi', position: 'right winger', subPosition: 'attack' },
      { playerId: 102, name: 'Cristiano Ronaldo', displayName: 'Ronaldo', position: 'centre-forward', subPosition: 'attack' },
      { playerId: 103, name: 'Kevin De Bruyne', displayName: 'De Bruyne', position: 'central midfield', subPosition: 'midfield' },
      { playerId: 104, name: 'Edson Arantes do Nascimento', displayName: 'Pelé', position: 'second striker', subPosition: 'attack' },
      { playerId: 105, name: 'Jose Maria Gimenez', displayName: 'San-Jose', position: 'centre-back', subPosition: 'defender' },
      { playerId: 106, name: "Joey O'Brien", displayName: "O'Brien", position: 'right-back', subPosition: 'defender' },
      { playerId: 107, name: 'Nico Gaitán', displayName: 'Gaitán', position: 'left winger', subPosition: 'attack' },
      { playerId: 108, name: 'Manuel Neuer', displayName: 'Neuer', position: 'goalkeeper', subPosition: null },
      { playerId: 109, name: 'Sergio Ramos', displayName: 'Ramos', position: 'centre-back', subPosition: 'defender' },
      { playerId: 110, name: 'Luka Modric', displayName: 'Modric', position: 'central midfield', subPosition: 'midfield' },
      { playerId: 111, name: 'Kylian Mbappe', displayName: 'Mbappe', position: null, subPosition: null },
      { playerId: 112, name: 'Thibaut Courtois', displayName: 'Courtois', position: 'goalkeeper', subPosition: null },
      { playerId: 113, name: 'Virgil van Dijk', displayName: 'Van Dijk', position: 'centre-back', subPosition: 'defender' },
      { playerId: 114, name: 'Test Player', displayName: null, position: 'centre-forward', subPosition: 'attack' },
    ],
  });

  await prisma.game.createMany({
    data: [
      {
        gameId: 1, competitionId: 'TEST-COMP', season: 2023, date: new Date('2023-05-01T00:00:00Z'),
        homeClubId: 1, awayClubId: 2, targetTeamId: 1, opponentTeamId: 2,
        homeClubGoals: 2, awayClubGoals: 1, homeClubFormation: '4-3-3', awayClubFormation: '4-4-2',
      },
      {
        gameId: 2, competitionId: 'TEST-COMP', season: 2024, date: new Date('2024-02-15T00:00:00Z'),
        homeClubId: 2, awayClubId: 1, targetTeamId: 2, opponentTeamId: 1,
        homeClubGoals: 0, awayClubGoals: 0, homeClubFormation: '3-5-2', awayClubFormation: '4-2-3-1',
      },
      {
        gameId: 3, competitionId: 'TEST-COMP', season: null, date: null,
        homeClubId: 1, awayClubId: 2, targetTeamId: 1, opponentTeamId: 2,
        homeClubGoals: null, awayClubGoals: null, homeClubFormation: null, awayClubFormation: null,
      },
    ],
  });

  await prisma.appearance.createMany({
    data: [
      // Game 1 — home (Test FC, 4-3-3)
      { gameId: 1, clubId: 1, playerId: 108, number: 1, type: 'starting_lineup', position: 'goalkeeper' },
      { gameId: 1, clubId: 1, playerId: 109, number: 4, type: 'starting_lineup', position: 'centre-back' },
      { gameId: 1, clubId: 1, playerId: 105, number: 2, type: 'starting_lineup', position: 'centre-back' },
      { gameId: 1, clubId: 1, playerId: 106, number: 3, type: 'starting_lineup', position: 'right-back' },
      { gameId: 1, clubId: 1, playerId: 107, number: 5, type: 'starting_lineup', position: 'left winger' },
      { gameId: 1, clubId: 1, playerId: 110, number: 8, type: 'starting_lineup', position: 'central midfield' },
      { gameId: 1, clubId: 1, playerId: 103, number: 10, type: 'starting_lineup', position: 'central midfield' },
      { gameId: 1, clubId: 1, playerId: 111, number: null, type: 'starting_lineup', position: null },
      // Game 1 — away (Test United, 4-4-2)
      { gameId: 1, clubId: 2, playerId: 112, number: 1, type: 'starting_lineup', position: 'goalkeeper' },
      { gameId: 1, clubId: 2, playerId: 101, number: 10, type: 'starting_lineup', position: 'right winger' },
      { gameId: 1, clubId: 2, playerId: 102, number: 9, type: 'starting_lineup', position: 'centre-forward' },
      { gameId: 1, clubId: 2, playerId: 104, number: 7, type: 'starting_lineup', position: 'second striker' },
      { gameId: 1, clubId: 2, playerId: 113, number: 4, type: 'starting_lineup', position: 'centre-back' },
      // Game 2 — home (Test United, 3-5-2)
      { gameId: 2, clubId: 2, playerId: 112, number: 1, type: 'starting_lineup', position: 'goalkeeper' },
      { gameId: 2, clubId: 2, playerId: 101, number: 10, type: 'starting_lineup', position: 'right winger' },
      { gameId: 2, clubId: 2, playerId: 102, number: 9, type: 'starting_lineup', position: 'centre-forward' },
      { gameId: 2, clubId: 2, playerId: 104, number: 7, type: 'starting_lineup', position: 'second striker' },
      { gameId: 2, clubId: 2, playerId: 113, number: 4, type: 'starting_lineup', position: 'centre-back' },
      { gameId: 2, clubId: 2, playerId: 103, number: 8, type: 'starting_lineup', position: 'central midfield' },
      // Game 2 — away (Test FC, 4-2-3-1)
      { gameId: 2, clubId: 1, playerId: 108, number: 1, type: 'starting_lineup', position: 'goalkeeper' },
      { gameId: 2, clubId: 1, playerId: 109, number: 4, type: 'starting_lineup', position: 'centre-back' },
      { gameId: 2, clubId: 1, playerId: 105, number: 2, type: 'starting_lineup', position: 'centre-back' },
      { gameId: 2, clubId: 1, playerId: 106, number: 3, type: 'starting_lineup', position: 'right-back' },
      { gameId: 2, clubId: 1, playerId: 107, number: 5, type: 'starting_lineup', position: 'left winger' },
      { gameId: 2, clubId: 1, playerId: 110, number: 8, type: 'starting_lineup', position: 'central midfield' },
      { gameId: 2, clubId: 1, playerId: 111, number: 7, type: 'starting_lineup', position: null },
      { gameId: 2, clubId: 1, playerId: 114, number: null, type: 'starting_lineup', position: 'centre-forward' },
    ],
  });
}