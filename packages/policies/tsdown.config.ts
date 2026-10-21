import { defineConfig } from 'tsdown';

// `void` is a peer dependency, so tsdown leaves its imports external.
export default defineConfig({
  entry: ['src/index.ts', 'src/void.ts'],
  format: 'esm',
  dts: true,
  clean: true,
});
