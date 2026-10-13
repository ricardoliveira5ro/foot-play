import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRandomMatch } from '../../lib/api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchRandomMatch difficulty query', () => {
  it('sends Hard as the selected difficulty', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => '{}',
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchRandomMatch(undefined, 'hard');

    expect(fetchMock).toHaveBeenCalledWith('/api/matches/random?difficulty=hard');
  });
});
