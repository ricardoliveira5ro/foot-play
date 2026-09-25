import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // IMPORTANT: '@' resolves to the frontend ROOT, not src/.
      // tsconfig paths are "@/*": ["./src/*", "./*"] — the "./*" fallback is
      // what makes "@/types" -> frontend/types/index.ts and
      // "@/lib/curatedTeams" -> frontend/lib/curatedTeams.ts work (neither
      // exists under src/). Mirror that fallback here.
      '@': path.resolve(__dirname, '.'),
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