import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests run in Node, without Void's Vite plugin, so point @schema at the schema directly.
export default defineConfig({
  resolve: {
    alias: { '@schema': fileURLToPath(new URL('./db/schema.ts', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
