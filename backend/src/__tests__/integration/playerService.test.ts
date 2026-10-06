import { describe, it, expect } from 'vitest';
import { getPlayers } from '../../services/playerService';

describe('getPlayers', () => {
  it('finds players by substring (case-insensitive)', async () => {
    const players = await getPlayers('messi');
    expect(players).toEqual([{ id: 101, name: 'Messi' }]);
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

  it('matches a player whose searchable name lives only in displayName', async () => {
    expect(await getPlayers('Pelé')).toEqual([{ id: 104, name: 'Pelé' }]);
  });

  it('matches a player whose searchable name falls back to name', async () => {
    expect(await getPlayers('Test Player')).toEqual([{ id: 114, name: 'Test Player' }]);
  });

  it('does not match on name when displayName is populated', async () => {
    expect(await getPlayers('Lionel')).toEqual([]);
  });

  it('returns displayName in the response when present', async () => {
    expect(await getPlayers('Messi')).toEqual([{ id: 101, name: 'Messi' }]);
  });

  it('falls back to name in the response when displayName is null', async () => {
    expect(await getPlayers('Test Player')).toEqual([{ id: 114, name: 'Test Player' }]);
  });

  it('returns [] for no matches', async () => {
    expect(await getPlayers('zzzz')).toEqual([]);
  });

  it('orders results by displayName ascending', async () => {
    const players = await getPlayers('o');
    expect(players.map(p => p.name)).toEqual([
      'Courtois',
      'Modric',
      "O'Brien",
      'Ramos',
      'Ronaldo',
      'San-Jose',
    ]);
  });

  it('sorts displayName and name-fallback players together', async () => {
    const players = await getPlayers('e');
    expect(players.length).toBeGreaterThan(1);
    expect(players.some(p => p.id === 114)).toBe(true);
    const names = players.map(p => p.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});
