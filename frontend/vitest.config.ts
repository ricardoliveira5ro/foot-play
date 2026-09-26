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
    },
  },
});
