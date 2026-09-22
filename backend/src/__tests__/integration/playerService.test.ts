import { describe, it, expect } from 'vitest';
import { getPlayers } from '../../services/playerService';

describe('getPlayers', () => {
  it('finds players by substring (case-insensitive)', async () => {
    const players = await getPlayers('messi');
    expect(players).toEqual([{ id: 101, name: 'Lionel Messi' }]);
  });

  it('matches case-insensitively', async () => {
    const players = await getPlayers('MESSI');
    expect(players).toHaveLength(1);
    expect(players[0].id).toBe(101);
  });

  it('matches partial names', async () => {
    const players = await getPlayers('de');
    expect(players.map(p => p.id)).toEqual([103]);
  });

  it('returns [] for no matches', async () => {
    expect(await getPlayers('zzzz')).toEqual([]);
  });

  it('orders results by displayName ascending', async () => {
    const players = await getPlayers('o');
    expect(players.map(p => p.name)).toEqual([
      'Thibaut Courtois',
      'Nico Gaitán',
      'Lionel Messi',
      'Luka Modric',
      "Joey O'Brien",
      'Edson Arantes do Nascimento',
      'Sergio Ramos',
      'Cristiano Ronaldo',
      'Jose Maria Gimenez',
    ]);
  });
});