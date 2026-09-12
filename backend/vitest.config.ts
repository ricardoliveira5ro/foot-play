import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./src/__tests__/setup/globalSetup.ts'],
    setupFiles: ['./src/__tests__/setup/setupEnv.ts'],
    include: ['src/**/*.test.ts'],
    // Integration tests share one real database; files must not run in parallel.
    fileParallelism: false,
    // Vitest 5.0.0 forks pool (default) has a tmp-copy bug that breaks
    // multi-file runs with ENOENT; threads pool avoids it.
    pool: 'threads',
    testTimeout: 30000,
    hookTimeout: 120000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/prisma.ts',
        'src/generated/**',
        'src/**/*.test.ts',
        'src/__tests__/**',
      ],
      thresholds: {
        lines: 95,
        statements: 95,
        functions: 95,
        branches: 95,
      },
    },
  },
});