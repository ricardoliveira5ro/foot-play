// @vitest-environment jsdom
/**
 * The Footer resolves its version string once, at module load, from
 * `NEXT_PUBLIC_APP_VERSION`. This test exists because that value has two
 * different "absent" shapes and only one of them was handled:
 *
 *   - the variable is unset (a bare `docker build`), and
 *   - the variable is the literal string `unknown`, which is what
 *     `docker-compose.prod.yml` substitutes whenever `APP_VERSION` is missing
 *     from the environment — the case a real deploy without version injection
 *     actually takes.
 *
 * The second used to render `vunknown`, which reads as a version rather than as
 * a failure. The test lives under `src/` because that is the only directory the
 * Vitest `include` glob and the Sonar `sources` list both cover; the component
 * it imports lives outside `src/` and is therefore not itself measured.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const ORIGINAL = process.env.NEXT_PUBLIC_APP_VERSION;

/** Renders the Footer with `NEXT_PUBLIC_APP_VERSION` set to `value`. */
const footerText = async (value: string | undefined): Promise<string> => {
  if (value === undefined) {
    delete process.env.NEXT_PUBLIC_APP_VERSION;
  } else {
    process.env.NEXT_PUBLIC_APP_VERSION = value;
  }
  // The version is a module-level const, so the module has to be re-evaluated
  // for the new env value to be read.
  vi.resetModules();
  const { default: Footer } = await import('../../components/Footer');
  const { container } = render(<Footer />);
  return container.textContent ?? '';
};

/** The version paragraph is the only node without a year or a menu item. */
const versionText = async (value: string | undefined): Promise<string> => {
  await footerText(value);
  return screen.getByText(/^(v.+|unknown)$/).textContent ?? '';
};

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.NEXT_PUBLIC_APP_VERSION;
  } else {
    process.env.NEXT_PUBLIC_APP_VERSION = ORIGINAL;
  }
  vi.resetModules();
});

describe('Footer version display', () => {
  it('prefixes a real version with v', async () => {
    await expect(versionText('0.2.3')).resolves.toBe('v0.2.3');
  });

  it('trims a padded version before prefixing', async () => {
    await expect(versionText('  0.2.3  ')).resolves.toBe('v0.2.3');
  });

  it('renders "unknown" unprefixed when the variable is unset', async () => {
    await expect(versionText(undefined)).resolves.toBe('unknown');
  });

  it('renders "unknown" unprefixed when the variable is empty', async () => {
    await expect(versionText('')).resolves.toBe('unknown');
  });

  it('renders "unknown" unprefixed when the variable is whitespace', async () => {
    await expect(versionText('   ')).resolves.toBe('unknown');
  });

  // The regression: docker-compose.prod.yml defaults this build arg to the
  // literal 'unknown', so this is the production "no version injected" path.
  it('never renders "vunknown" for the unknown sentinel', async () => {
    const text = await footerText('unknown');
    expect(text).not.toContain('vunknown');
    expect(text).toContain('unknown');
  });
});
