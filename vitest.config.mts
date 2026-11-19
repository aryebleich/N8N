import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname), 'server-only': path.resolve(__dirname, 'tests/unit/server-only-stub.ts') } },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    env: {
      TURSO_DATABASE_URL: 'file::memory:',
      INTERNAL_API_SECRET: 'test-internal-secret-0123456789abcdef',
      APP_URL: 'http://localhost:3000',
    },
  },
});
