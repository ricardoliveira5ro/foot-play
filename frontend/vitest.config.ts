import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // Mirror tsconfig's "@/*": ["./src/*", "./*"] mapping. Most modules
      // live under src; these imports currently resolve from the frontend root.
      '@/types': path.resolve(__dirname, 'types'),
      '@/lib/curatedTeams': path.resolve(__dirname, 'lib/curatedTeams'),
      '@/components/TeamTabBar': path.resolve(__dirname, 'components/TeamTabBar'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    // forks pool fails with ENOENT on the tmp-copy cache in this environment
    // (tmpdir write quirk); threads pool is stable here and in CI. Revisit if
    // the forks failure is confirmed upstream.
    pool: 'threads',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}'],
      // Global floors, enforced on `npm run test:coverage` (the step
      // "Run frontend tests with coverage" in .github/workflows/ci.yml).
      //
      // SCOPE: these floors measure `frontend/src/` and nothing else. The
      // `include` glob above deliberately excludes `app/`, `components/`,
      // `lib/`, `types/` and `vitest.setup.ts`, so a change to any of those
      // cannot move these numbers and cannot fail this gate. Widening the glob
      // is not a neutral edit: the excluded directories are far less covered
      // than src/, so adding them drops the percentages below the floors and
      // fails CI immediately. Widen it only in the same change that brings
      // tests for the newly included files.
      //
      // No glob keys, so these are whole-scope numbers (all of `src/`), not
      // per-file.
      //
      // Baseline measured at 2026-09-27: statements 98.71, branches 95.42,
      // functions 99.12, lines 99.23. These sit below it on purpose — a floor
      // that is at or above today's number would fail CI on unrelated work.
      // With 466 statements (460 covered) and 350 branches (334 covered) in the
      // report, the 95/90 floors leave room for 17 further uncovered statements
      // or 19 further uncovered branches before the gate trips, which is enough
      // headroom for a new (not yet unit-tested) file while still catching real
      // erosion. Ratchet up as tests are added.
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 95,
        lines: 95,
      },
    },
  },
});
