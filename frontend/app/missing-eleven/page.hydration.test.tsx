// @vitest-environment jsdom
//
// First-paint hydration for the real page architecture. The server and the
// first client render both show the pre-screen (empty URL), not a loading
// board: `started`, `urlReady` and `todayKey` all begin false/null and are
// filled in by effects after hydration. The daily entry must therefore be
// absent from both renders, and no storage may be touched during render.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { act } from '@testing-library/react';
import MissingElevenPage from './page';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/missing-eleven',
}));

// Never settles: the page must remain in its first-paint branch, which is the
// state the server rendered.
const never = () => new Promise<never>(() => {});

vi.mock('@/lib/api', () => ({
  fetchRandomMatch: () => never(),
  fetchDailyMatch: () => never(),
  fetchFilterOptions: () => never(),
  submitGuess: () => never(),
  fetchReveal: () => never(),
  revealOnePlayer: () => never(),
}));

vi.mock('@/components/MatchInfo', () => ({ default: () => null }));
vi.mock('@/components/TacticBoard', () => ({ default: () => null }));
vi.mock('@/components/WordleModal', () => ({ default: () => null }));
vi.mock('@/components/ScoreCounter', () => ({ default: () => null }));
vi.mock('@/components/GameComplete', () => ({ default: () => null }));

const HYDRATION_NOISE = /hydrat|did not match|server (HTML|rendered)|text content does not match/i;

beforeEach(() => {
  window.history.replaceState(null, '', '/missing-eleven');
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('first-paint hydration', () => {
  it('server render and first client render produce identical markup', async () => {
    const html = renderToString(<MissingElevenPage />);
    // The real first paint is the pre-screen, not a loading board.
    expect(html).toContain('Choose your match');
    expect(html).not.toContain('Loading puzzle');

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);

    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map((a) => String(a)).join(' '));
    });
    await act(async () => {
      hydrateRoot(container, <MissingElevenPage />);
    });
    spy.mockRestore();

    expect(errors.filter((e) => HYDRATION_NOISE.test(e))).toEqual([]);
  });

  it('does not reach for storage during render — there is none in v1.3.1', () => {
    // A Storage-shaped property that throws on every access. Any code path
    // reachable from render that touched storage would throw here.
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('localStorage accessed during render');
      },
    });
    expect(() => renderToString(<MissingElevenPage />)).not.toThrow();
  });
});
