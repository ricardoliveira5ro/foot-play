import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    club: { findMany: vi.fn().mockResolvedValue([]) },
    competition: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import { prisma } from '../../prisma';
import { getFilterOptions } from '../../services/filterService';

const EMPTY_FILTERS = {
  teamIds: null,
  opponentIds: null,
  competitionIds: null,
  seasonFrom: null,
  seasonTo: null,
};

describe('getFilterOptions', () => {
  beforeEach(() => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
  });

  it('throws when the counts query returns no result row', async () => {
    await expect(getFilterOptions(EMPTY_FILTERS)).rejects.toThrow(
      'Filter counts query returned no result row',
    );
  });
});
