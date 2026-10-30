import { describe, it, expect } from 'vitest';
import { POSITION_ORDER, getPositionLabel, compareShirtPosition } from './positionOrder';

describe('compareShirtPosition', () => {
  it('orders a goalkeeper before a centre-forward', () => {
    expect(compareShirtPosition({ position: 'GK' }, { position: 'ST' })).toBeLessThan(0);
  });

  it('orders a centre-forward after a winger', () => {
    expect(compareShirtPosition({ position: 'ST' }, { position: 'LW' })).toBeGreaterThan(0);
  });

  it('orders back-line roles left to right', () => {
    const sorted = ['RB', 'GK', 'CB', 'LB']
      .map((position) => ({ position }))
      .sort(compareShirtPosition)
      .map((shirt) => shirt.position);
    expect(sorted).toEqual(['GK', 'CB', 'LB', 'RB']);
  });

  it('sorts an unknown position last', () => {
    const sorted = ['ST', 'Sweeper', 'Wizard', 'GK']
      .map((position) => ({ position }))
      .sort(compareShirtPosition)
      .map((shirt) => shirt.position);
    expect(sorted).toEqual(['GK', 'Sweeper', 'ST', 'Wizard']);
  });

  it('sorts a missing position last', () => {
    const sorted = ['ST', 'GK', null]
      .map((position) => ({ position }))
      .sort(compareShirtPosition)
      .map((shirt) => shirt.position);
    expect(sorted).toEqual(['GK', 'ST', null]);
  });

  it('returns 0 for two shirts in the same role, so input order is kept', () => {
    expect(compareShirtPosition({ position: 'CM' }, { position: 'CM' })).toBe(0);
  });

  it('gives every known abbreviation a rank below the unknown rank', () => {
    const unknownRank = POSITION_ORDER['Wizard'];
    expect(unknownRank).toBeUndefined();
    for (const rank of Object.values(POSITION_ORDER)) {
      expect(rank).toBeLessThan(99);
    }
  });
});

describe('getPositionLabel', () => {
  it('returns the abbreviation unchanged when it has a label', () => {
    expect(getPositionLabel('GK')).toBe('GK');
    expect(getPositionLabel('RWB')).toBe('RWB');
  });

  it('renders CF as the striker label', () => {
    expect(getPositionLabel('CF')).toBe('ST');
  });

  it('falls back to the raw position when it has no label', () => {
    expect(getPositionLabel('Sweeper')).toBe('Sweeper');
  });

  it('renders ? for a missing position', () => {
    expect(getPositionLabel(null)).toBe('?');
    expect(getPositionLabel('')).toBe('?');
  });
});
