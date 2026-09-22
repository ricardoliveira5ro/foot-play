import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getPositionCoords,
  getPositionMappingStats,
  getFormationFamily,
  getFormationSlots,
  fitStartingXI,
  getFormationMappingStats,
} from '../../services/positionMapping';
import type { LineupPlayer } from '../../services/positionMapping';

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getPositionCoords', () => {
  it('exact match (case-insensitive)', () => {
    expect(getPositionCoords('goalkeeper')).toEqual({ x: 50, y: 90 });
    expect(getPositionCoords('Centre-Back')).toEqual({ x: 50, y: 72 });
  });

  it('upgrade rule: group position + precise subPosition', () => {
    const before = getPositionMappingStats().upgrade;
    expect(getPositionCoords('attack', 'centre-forward')).toEqual({ x: 50, y: 15 });
    expect(getPositionMappingStats().upgrade).toBe(before + 1);
  });

  it('group fallback: group position without subPosition', () => {
    const before = getPositionMappingStats().groupFallback;
    expect(getPositionCoords('attack')).toEqual({ x: 50, y: 15 });
    expect(getPositionMappingStats().groupFallback).toBe(before + 1);
  });

  it('subPosition fallback: precise subPosition', () => {
    const before = getPositionMappingStats().subPositionFallback;
    expect(getPositionCoords('', 'left-back')).toEqual({ x: 10, y: 60 });
    expect(getPositionMappingStats().subPositionFallback).toBe(before + 1);
  });

  it('subPosition fallback: group subPosition', () => {
    const before = getPositionMappingStats().subPositionFallback;
    expect(getPositionCoords('', 'defender')).toEqual({ x: 50, y: 72 });
    expect(getPositionMappingStats().subPositionFallback).toBe(before + 1);
  });

  it('default fallback for unmapped position', () => {
    const before = getPositionMappingStats().default;
    expect(getPositionCoords('utility player')).toEqual({ x: 50, y: 50 });
    expect(getPositionMappingStats().default).toBe(before + 1);
  });

  it('default fallback for null/undefined position', () => {
    expect(getPositionCoords(null as unknown as string)).toEqual({ x: 50, y: 50 });
    expect(getPositionCoords(undefined as unknown as string)).toEqual({ x: 50, y: 50 });
  });

  it('subPosition fallback: unmapped subPosition falls through to default', () => {
    const before = getPositionMappingStats().default;
    expect(getPositionCoords('', 'utility player')).toEqual({ x: 50, y: 50 });
    expect(getPositionMappingStats().default).toBe(before + 1);
  });

  it('stats returns a copy', () => {
    const stats = getPositionMappingStats();
    stats.exact = 999;
    expect(getPositionMappingStats().exact).not.toBe(999);
  });
});

describe('getFormationFamily', () => {
  it('classifies 3-band formations', () => {
    expect(getFormationFamily('4-3-3')).toBe('3-band');
    expect(getFormationFamily('4-4-2')).toBe('3-band');
  });

  it('classifies dm-4-band formations', () => {
    expect(getFormationFamily('4-2-3-1')).toBe('dm-4-band');
  });

  it('classifies mid-4-band formations', () => {
    expect(getFormationFamily('3-4-2-1')).toBe('mid-4-band');
  });

  it('strips the Starting Line-up prefix', () => {
    expect(getFormationFamily('Starting Line-up: 4-4-2')).toBe('3-band');
  });

  it('returns unknown for unparseable formations', () => {
    expect(getFormationFamily('bogus')).toBe('unknown');
    expect(getFormationFamily('4-4-3')).toBe('unknown');
  });

  it('returns unknown for null/undefined/empty', () => {
    expect(getFormationFamily(null)).toBe('unknown');
    expect(getFormationFamily(undefined)).toBe('unknown');
    expect(getFormationFamily('')).toBe('unknown');
  });
});

describe('getFormationSlots', () => {
  it('returns 11 slots for 4-3-3 with correct bands', () => {
    const slots = getFormationSlots('4-3-3');
    expect(slots).toHaveLength(11);
    expect(slots[0].id).toBe('GK');
    expect(slots[0].band).toBe('GK');
    expect(slots[5].id).toBe('CM1');
    expect(slots[5].band).toBe('MID');
    expect(slots[8].id).toBe('LW');
    expect(slots[8].band).toBe('FWD');
  });

  it('LW band is MID in dm-4-band formations', () => {
    const slots = getFormationSlots('4-2-3-1');
    expect(slots[7].id).toBe('LW');
    expect(slots[7].band).toBe('MID');
  });

  it('returns [] for unknown formations', () => {
    expect(getFormationSlots('bogus')).toEqual([]);
  });

  it('parses generic 2-band formation as 3-band (4-6)', () => {
    const slots = getFormationSlots('4-6');
    expect(slots).toHaveLength(11);
    expect(slots[0].id).toBe('GK');
  });

  it('parses generic 4-band dm formation (4-2-2-2)', () => {
    const slots = getFormationSlots('4-2-2-2');
    expect(slots).toHaveLength(11);
    expect(slots[5].id).toBe('DM1');
    expect(slots[5].band).toBe('DM');
  });

  it('rejects generic 4-band mid formation with 3 AMs (2-3-3-2)', () => {
    expect(getFormationSlots('2-3-3-2')).toEqual([]);
  });

  it('parses generic mid-4-band formation (5-3-1-1)', () => {
    const slots = getFormationSlots('5-3-1-1');
    expect(slots).toHaveLength(11);
    expect(slots[9].id).toBe('AM');
    expect(slots[9].band).toBe('MID');
    expect(getFormationFamily('5-3-1-1')).toBe('mid-4-band');
  });

  it('parses generic 3-band formation (2-5-3)', () => {
    const slots = getFormationSlots('2-5-3');
    expect(slots).toHaveLength(11);
    expect(slots[3].id).toBe('DM3');
    expect(slots[8].id).toBe('LW');
    expect(slots[10].id).toBe('CF1');
    expect(getFormationFamily('2-5-3')).toBe('3-band');
  });

  it('parses 5-1-3-1 (single pivot)', () => {
    const slots = getFormationSlots('5-1-3-1');
    expect(slots).toHaveLength(11);
    expect(slots[6].id).toBe('DM3');
  });

  it('parses 4-0-4-2 (no DM slots)', () => {
    const slots = getFormationSlots('4-0-4-2');
    expect(slots).toHaveLength(11);
    expect(slots[5].id).toBe('LM');
  });

  it('SS slot band is FWD (4-4-1-1)', () => {
    const slots = getFormationSlots('4-4-1-1');
    expect(slots).toHaveLength(11);
    const ss = slots.find(s => s.id === 'SS');
    expect(ss?.band).toBe('FWD');
  });

  it('parses generic 3-2-5 (3 defenders, 2 DMs, 5 forwards)', () => {
    const slots = getFormationSlots('3-2-5');
    expect(slots).toHaveLength(11);
    expect(slots[3].id).toBe('CB3');
    expect(slots[4].id).toBe('DM1');
    expect(slots[6].id).toBe('LW');
    expect(slots[10].id).toBe('SS');
    expect(getFormationFamily('3-2-5')).toBe('3-band');
  });

  it('parses generic 2-4-4 (4 mids, 4 forwards)', () => {
    const slots = getFormationSlots('2-4-4');
    expect(slots).toHaveLength(11);
    expect(slots[3].id).toBe('LM');
    expect(slots[7].id).toBe('LW');
  });

  it('parses generic 2-3-5 (3 central mids)', () => {
    const slots = getFormationSlots('2-3-5');
    expect(slots).toHaveLength(11);
    expect(slots[3].id).toBe('CM1');
    expect(slots[5].id).toBe('CM3');
  });

  it('parses generic 4-2-1-3 (single AM)', () => {
    const slots = getFormationSlots('4-2-1-3');
    expect(slots).toHaveLength(11);
    expect(slots[7].id).toBe('AM');
  });

  it('parses generic 4-2-0-4 (no AMs)', () => {
    const slots = getFormationSlots('4-2-0-4');
    expect(slots).toHaveLength(11);
    expect(slots[7].id).toBe('LW');
  });

  it('parses generic mid-4-band 2-4-2-2 (4 mids, 2 AMs)', () => {
    const slots = getFormationSlots('2-4-2-2');
    expect(slots).toHaveLength(11);
    expect(slots[3].id).toBe('LM');
    expect(slots[7].id).toBe('AM1');
  });

  it('parses generic mid-4-band 2-4-0-4 (no AMs)', () => {
    const slots = getFormationSlots('2-4-0-4');
    expect(slots).toHaveLength(11);
    expect(slots[7].id).toBe('LW');
    expect(slots[9].id).toBe('CF1');
  });

  it('rejects invalid band counts', () => {
    expect(getFormationSlots('6-2-1-1')).toEqual([]);
    expect(getFormationSlots('4-2-5-1')).toEqual([]);
    expect(getFormationSlots('x-y')).toEqual([]);
  });

  it('rejects 3-band formation with too many defenders (6-2-2)', () => {
    expect(getFormationSlots('6-2-2')).toEqual([]);
  });

  it('rejects 3-band formation with too many mids (2-7-1)', () => {
    expect(getFormationSlots('2-7-1')).toEqual([]);
  });

  it('rejects 3-band formation with too many forwards (2-2-6)', () => {
    expect(getFormationSlots('2-2-6')).toEqual([]);
  });

  it('rejects 4-band formation with too many AMs (2-2-5-1)', () => {
    expect(getFormationSlots('2-2-5-1')).toEqual([]);
  });

  it('rejects 4-band formation with too many forwards (2-2-0-6)', () => {
    expect(getFormationSlots('2-2-0-6')).toEqual([]);
  });

  it('rejects 4-band formation with 5 mids (2-5-1-2)', () => {
    expect(getFormationSlots('2-5-1-2')).toEqual([]);
  });

  it('rejects 4-band formation with fractional DM count (4-1.5-2.5-2)', () => {
    expect(getFormationSlots('4-1.5-2.5-2')).toEqual([]);
  });
});

describe('fitStartingXI', () => {
  const exact433: LineupPlayer[] = [
    { playerId: 1, position: 'goalkeeper' },
    { playerId: 2, position: 'centre-back' },
    { playerId: 3, position: 'centre-back' },
    { playerId: 4, position: 'left-back' },
    { playerId: 5, position: 'right-back' },
    { playerId: 6, position: 'central midfield' },
    { playerId: 7, position: 'central midfield' },
    { playerId: 8, position: 'central midfield' },
    { playerId: 9, position: 'left winger' },
    { playerId: 10, position: 'right winger' },
    { playerId: 11, position: 'centre-forward' },
  ];

  it('fits an exact 4-3-3 lineup with exact quality', () => {
    const fitted = fitStartingXI(exact433, '4-3-3');
    expect(fitted).toHaveLength(11);
    expect(fitted.every(f => f.fitQuality === 'exact')).toBe(true);
    expect(fitted[0].slotId).toBe('GK');
    expect(fitted[0].coords).toEqual({ x: 50, y: 90 });
  });

  it('is deterministic', () => {
    expect(fitStartingXI(exact433, '4-3-3')).toEqual(fitStartingXI(exact433, '4-3-3'));
  });

  it('static mode for null formation', () => {
    const fitted = fitStartingXI(exact433, null);
    expect(fitted.every(f => f.fitQuality === 'static' && f.slotId === null && f.band === null)).toBe(true);
    expect(fitted[0].coords).toEqual({ x: 50, y: 90 });
  });

  it('static mode for unknown formation increments unknownFormations', () => {
    const before = getFormationMappingStats().unknownFormations['bogus'] ?? 0;
    fitStartingXI(exact433, 'bogus');
    expect(getFormationMappingStats().unknownFormations['bogus']).toBe(before + 1);
  });

  it('static mode for empty string does not count unknown', () => {
    const before = getFormationMappingStats().unknownFormations[''] ?? 0;
    fitStartingXI(exact433, '');
    expect(getFormationMappingStats().unknownFormations[''] ?? 0).toBe(before);
  });

  it('returns [] for empty lineup', () => {
    expect(fitStartingXI([], '4-3-3')).toEqual([]);
  });

  it('returns [] for non-array lineup', () => {
    expect(fitStartingXI(undefined as unknown as LineupPlayer[], '4-3-3')).toEqual([]);
  });

  it('assigns first entry to GK slot when no goalkeeper (static)', () => {
    const noGk = exact433.slice(1).concat([{ playerId: 12, position: 'centre-forward' }]);
    const fitted = fitStartingXI(noGk, '4-3-3');
    expect(fitted[0].slotId).toBe('GK');
    expect(fitted[0].fitQuality).toBe('static');
  });

  it('second goalkeeper stays unassigned (static)', () => {
    const twoGk: LineupPlayer[] = [
      { playerId: 1, position: 'goalkeeper' },
      { playerId: 12, position: 'goalkeeper' },
      ...exact433.slice(1, 11),
    ];
    const fitted = fitStartingXI(twoGk, '4-3-3');
    expect(fitted[1].slotId).toBeNull();
    expect(fitted[1].fitQuality).toBe('static');
    expect(fitted[1].coords).toEqual({ x: 50, y: 90 });
  });

  it('repair pass swaps a static centre-forward into LW', () => {
    const lineup: LineupPlayer[] = [
      { playerId: 1, position: 'goalkeeper' },
      { playerId: 2, position: 'centre-back' },
      { playerId: 3, position: 'centre-back' },
      { playerId: 4, position: 'left-back' },
      { playerId: 5, position: 'right-back' },
      { playerId: 6, position: 'defensive midfield' },
      { playerId: 7, position: 'defensive midfield' },
      { playerId: 8, position: 'centre-forward' },
      { playerId: 9, position: 'centre-forward' },
      { playerId: 10, position: 'centre-forward' },
      { playerId: 11, position: 'left winger' },
    ];
    const fitted = fitStartingXI(lineup, '4-2-3-1');
    expect(fitted[7].slotId).toBe('LW');
    expect(fitted[7].fitQuality).toBe('tolerant');
    expect(fitted[10].slotId).toBe('AM');
    expect(fitted[10].fitQuality).toBe('exact');
  });

  it('handles lineups longer than 11 (extra player static)', () => {
    const twelve = [...exact433, { playerId: 12, position: 'centre-forward' }];
    const fitted = fitStartingXI(twelve, '4-3-3');
    expect(fitted).toHaveLength(12);
    expect(fitted[11].slotId).toBeNull();
    expect(fitted[11].fitQuality).toBe('static');
    expect(fitted[11].coords).toEqual({ x: 50, y: 15 });
  });

  it('narrows paired CB/CM/CF spacing in 4-4-2', () => {
    const lineup: LineupPlayer[] = [
      { playerId: 1, position: 'goalkeeper' },
      { playerId: 2, position: 'centre-back' },
      { playerId: 3, position: 'centre-back' },
      { playerId: 4, position: 'left-back' },
      { playerId: 5, position: 'right-back' },
      { playerId: 6, position: 'left midfield' },
      { playerId: 7, position: 'central midfield' },
      { playerId: 8, position: 'central midfield' },
      { playerId: 9, position: 'right midfield' },
      { playerId: 10, position: 'centre-forward' },
      { playerId: 11, position: 'centre-forward' },
    ];
    const fitted = fitStartingXI(lineup, '4-4-2');
    const cb = fitted.filter(f => f.coords.y === 72);
    expect(cb.map(f => f.coords.x).sort()).toEqual([35, 65]);
    const cm = fitted.filter(f => f.coords.y === 45);
    expect(cm.map(f => f.coords.x).sort()).toEqual([40, 60]);
    const cf = fitted.filter(f => f.coords.y === 15);
    expect(cf.map(f => f.coords.x).sort()).toEqual([37, 63]);
  });

  it('third centre-back in 4-3-3 is static while the CB pair narrows', () => {
    const lineup: LineupPlayer[] = [
      { playerId: 1, position: 'goalkeeper' },
      { playerId: 2, position: 'centre-back' },
      { playerId: 3, position: 'centre-back' },
      { playerId: 4, position: 'centre-back' },
      { playerId: 5, position: 'left-back' },
      { playerId: 6, position: 'right-back' },
      { playerId: 7, position: 'central midfield' },
      { playerId: 8, position: 'central midfield' },
      { playerId: 9, position: 'central midfield' },
      { playerId: 10, position: 'left winger' },
      { playerId: 11, position: 'right winger' },
    ];
    const fitted = fitStartingXI(lineup, '4-3-3');
    expect(fitted[3].slotId).toBe('CF3');
    expect(fitted[3].fitQuality).toBe('static');
    const cb = fitted.filter(f => f.coords.y === 72);
    expect(cb.map(f => f.coords.x).sort()).toEqual([35, 50, 65]);
  });

  it('narrows paired spacing when the wider player comes first in input order', () => {
    // The greedy fills CB1 (x=30) with the best-ranked CB; a worse CB ranked
    // earlier in input order lands in CB2 (x=70), exercising the mirrored
    // spacing branch (a.x===70 && b.x===30).
    const lineup: LineupPlayer[] = [
      { playerId: 1, position: 'goalkeeper' },
      { playerId: 2, position: 'left-back' },
      { playerId: 3, position: 'centre-back' },
      { playerId: 4, position: 'left-back' },
      { playerId: 5, position: 'right-back' },
      { playerId: 6, position: 'left midfield' },
      { playerId: 7, position: 'central midfield' },
      { playerId: 8, position: 'central midfield' },
      { playerId: 9, position: 'right midfield' },
      { playerId: 10, position: 'centre-forward' },
      { playerId: 11, position: 'centre-forward' },
    ];
    const fitted = fitStartingXI(lineup, '4-4-2');
    const cb = fitted.filter(f => f.coords.y === 72);
    expect(cb.map(f => f.coords.x).sort()).toEqual([35, 65]);
  });

  it('repair pass skips unassigned players', () => {
    const lineup: LineupPlayer[] = [
      { playerId: 1, position: 'goalkeeper' },
      { playerId: 2, position: 'centre-back' },
      { playerId: 3, position: 'centre-back' },
      { playerId: 4, position: 'left-back' },
      { playerId: 5, position: 'right-back' },
      { playerId: 6, position: 'central midfield' },
      { playerId: 7, position: 'central midfield' },
      { playerId: 8, position: 'central midfield' },
      { playerId: 9, position: 'left winger' },
      { playerId: 10, position: 'right winger' },
      { playerId: 11, position: 'utility player' },
      { playerId: 12, position: 'utility player' },
    ];
    const fitted = fitStartingXI(lineup, '4-3-3');
    expect(fitted[10].slotId).toBe('CF3');
    expect(fitted[10].fitQuality).toBe('static');
    expect(fitted[11].slotId).toBeNull();
  });

  it('static mode handles null player positions', () => {
    const fitted = fitStartingXI([{ playerId: 1, position: null }], null);
    expect(fitted[0].fitQuality).toBe('static');
    expect(fitted[0].coords).toEqual({ x: 50, y: 50 });
  });

  it('unassigned player with null position gets static coords', () => {
    const twelve = [...exact433, { playerId: 12, position: null }];
    const fitted = fitStartingXI(twelve, '4-3-3');
    expect(fitted[11].slotId).toBeNull();
    expect(fitted[11].fitQuality).toBe('static');
    expect(fitted[11].coords).toEqual({ x: 50, y: 50 });
  });

  it('deduplicates unknown-formation warnings', () => {
    fitStartingXI(exact433, 'bogus-formation');
    fitStartingXI(exact433, 'bogus-formation');
    expect(getFormationMappingStats().unknownFormations['bogus-formation']).toBeGreaterThanOrEqual(2);
  });

  it('formation stats return copies', () => {
    const stats = getFormationMappingStats();
    stats.sidesFitted = 999;
    expect(getFormationMappingStats().sidesFitted).not.toBe(999);
  });
});
