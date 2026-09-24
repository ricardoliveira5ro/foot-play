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
    // vitest 5.0.0's forks pool races on the shared tmp-copy cache when any
    // setup file is transformed by multiple parallel workers (ENOENT on the
    // setup file's cached transform). The threads pool transfers transformed
    // code in-memory and has no such cache, so it is stable. Revisit once
    // vitest ships a fix (5.0.1+ is blocked by a @types/node peer conflict).
    pool: 'threads',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}'],
    },
  },
});