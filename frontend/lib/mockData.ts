import type { MatchResponse } from '@/types';

/**
 * Static mock dataset mimicking the Dev 3 API responses exactly.
 * Used by lib/api.ts while the real backend is not wired up.
 *
 * Coordinates are percentages on a vertical tactic board:
 * x: 0 (left touchline) → 100 (right touchline)
 * y: 0 (opponent goal, top) → 100 (own goal, bottom)
 */

const MOCK_MATCHES: MatchResponse[] = [
  {
    match: {
      id: 1,
      date: '2022-10-02',
      season: '2022/23',
      competition: 'Premier League',
      homeClub: { id: 1, name: 'Manchester City' },
      awayClub: { id: 2, name: 'Manchester United' },
      homeScore: 6,
      awayScore: 3,
      homeFormation: '4-3-3',
      awayFormation: '4-2-3-1',
    },
    homeLineup: [
      { playerId: 101, displayName: 'Ederson', shirtNumber: 31, position: 'GK', coords: { x: 50, y: 90 } },
      { playerId: 102, displayName: 'John Stones', shirtNumber: 5, position: 'RB', coords: { x: 90, y: 62 } },
      { playerId: 103, displayName: 'Rúben Dias', shirtNumber: 3, position: 'CB', coords: { x: 68, y: 70 } },
      { playerId: 104, displayName: 'Manuel Akanji', shirtNumber: 25, position: 'CB', coords: { x: 32, y: 70 } },
      { playerId: 105, displayName: 'João Cancelo', shirtNumber: 7, position: 'LB', coords: { x: 10, y: 62 } },
      { playerId: 106, displayName: 'Rodri', shirtNumber: 16, position: 'DM', coords: { x: 50, y: 48 } },
      { playerId: 107, displayName: 'İlkay Gündoğan', shirtNumber: 8, position: 'CM', coords: { x: 28, y: 42 } },
      { playerId: 108, displayName: 'Kevin De Bruyne', shirtNumber: 17, position: 'CM', coords: { x: 72, y: 42 } },
      { playerId: 109, displayName: 'Bernardo Silva', shirtNumber: 20, position: 'LW', coords: { x: 16, y: 24 } },
      { playerId: 110, displayName: 'Erling Haaland', shirtNumber: 9, position: 'ST', coords: { x: 50, y: 14 } },
      { playerId: 111, displayName: 'Phil Foden', shirtNumber: 47, position: 'RW', coords: { x: 84, y: 24 } },
    ],
    awayLineup: [
      { playerId: 201, displayName: 'David de Gea', shirtNumber: 1, position: 'GK', coords: { x: 50, y: 90 } },
      { playerId: 202, displayName: 'Diogo Dalot', shirtNumber: 20, position: 'RB', coords: { x: 88, y: 62 } },
      { playerId: 203, displayName: 'Raphaël Varane', shirtNumber: 19, position: 'CB', coords: { x: 66, y: 70 } },
      { playerId: 204, displayName: 'Lisandro Martínez', shirtNumber: 6, position: 'CB', coords: { x: 34, y: 70 } },
      { playerId: 205, displayName: 'Luke Shaw', shirtNumber: 23, position: 'LB', coords: { x: 12, y: 62 } },
      { playerId: 206, displayName: 'Casemiro', shirtNumber: 18, position: 'DM', coords: { x: 62, y: 48 } },
      { playerId: 207, displayName: 'Christian Eriksen', shirtNumber: 14, position: 'DM', coords: { x: 38, y: 48 } },
      { playerId: 208, displayName: 'Antony', shirtNumber: 21, position: 'RW', coords: { x: 82, y: 30 } },
      { playerId: 209, displayName: 'Bruno Fernandes', shirtNumber: 8, position: 'CAM', coords: { x: 50, y: 30 } },
      { playerId: 210, displayName: 'Marcus Rashford', shirtNumber: 10, position: 'LW', coords: { x: 18, y: 30 } },
      { playerId: 211, displayName: 'Anthony Martial', shirtNumber: 9, position: 'ST', coords: { x: 50, y: 14 } },
    ],
  },
  {
    match: {
      id: 2,
      date: '2010-11-29',
      season: '2010/11',
      competition: 'La Liga',
      homeClub: { id: 3, name: 'FC Barcelona' },
      awayClub: { id: 4, name: 'Real Madrid' },
      homeScore: 5,
      awayScore: 0,
      homeFormation: '4-3-3',
      awayFormation: '4-2-3-1',
    },
    homeLineup: [
      { playerId: 301, displayName: 'Victor Valdés', shirtNumber: 1, position: 'GK', coords: { x: 50, y: 90 } },
      { playerId: 302, displayName: 'Dani Alves', shirtNumber: 2, position: 'RB', coords: { x: 90, y: 62 } },
      { playerId: 303, displayName: 'Gerard Piqué', shirtNumber: 3, position: 'CB', coords: { x: 68, y: 70 } },
      { playerId: 304, displayName: 'Carles Puyol', shirtNumber: 5, position: 'CB', coords: { x: 32, y: 70 } },
      { playerId: 305, displayName: 'Éric Abidal', shirtNumber: 22, position: 'LB', coords: { x: 10, y: 62 } },
      { playerId: 306, displayName: 'Sergio Busquets', shirtNumber: 16, position: 'DM', coords: { x: 50, y: 48 } },
      { playerId: 307, displayName: 'Xavi', shirtNumber: 6, position: 'CM', coords: { x: 28, y: 42 } },
      { playerId: 308, displayName: 'Andrés Iniesta', shirtNumber: 8, position: 'CM', coords: { x: 72, y: 42 } },
      { playerId: 309, displayName: 'Pedro', shirtNumber: 17, position: 'RW', coords: { x: 84, y: 24 } },
      { playerId: 310, displayName: 'Lionel Messi', shirtNumber: 10, position: 'ST', coords: { x: 50, y: 14 } },
      { playerId: 311, displayName: 'David Villa', shirtNumber: 7, position: 'LW', coords: { x: 16, y: 24 } },
    ],
    awayLineup: [
      { playerId: 401, displayName: 'Iker Casillas', shirtNumber: 1, position: 'GK', coords: { x: 50, y: 90 } },
      { playerId: 402, displayName: 'Sergio Ramos', shirtNumber: 4, position: 'RB', coords: { x: 88, y: 62 } },
      { playerId: 403, displayName: 'Pepe', shirtNumber: 3, position: 'CB', coords: { x: 66, y: 70 } },
      { playerId: 404, displayName: 'Ricardo Carvalho', shirtNumber: 2, position: 'CB', coords: { x: 34, y: 70 } },
      { playerId: 405, displayName: 'Marcelo', shirtNumber: 12, position: 'LB', coords: { x: 12, y: 62 } },
      { playerId: 406, displayName: 'Sami Khedira', shirtNumber: 24, position: 'DM', coords: { x: 38, y: 48 } },
      { playerId: 407, displayName: 'Xabi Alonso', shirtNumber: 14, position: 'DM', coords: { x: 62, y: 48 } },
      { playerId: 408, displayName: 'Ángel Di María', shirtNumber: 22, position: 'RW', coords: { x: 82, y: 30 } },
      { playerId: 409, displayName: 'Mesut Özil', shirtNumber: 23, position: 'CAM', coords: { x: 50, y: 30 } },
      { playerId: 410, displayName: 'Cristiano Ronaldo', shirtNumber: 7, position: 'LW', coords: { x: 18, y: 30 } },
      { playerId: 411, displayName: 'Karim Benzema', shirtNumber: 9, position: 'ST', coords: { x: 50, y: 14 } },
    ],
  },
];

export default MOCK_MATCHES;
