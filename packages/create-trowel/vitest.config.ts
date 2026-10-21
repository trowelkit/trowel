import { defineConfig } from 'vitest/config';

// The template has its own tests and config; run them as their own project.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
