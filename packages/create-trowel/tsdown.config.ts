import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsdown';

// The starter depends on the Trowel packages it was built and tested with.
const packages = ['cli', 'events', 'notifications', 'policies', 'rate-limit', 'testing'];
const versions = Object.fromEntries(
  packages.map((name) => {
    const manifest = JSON.parse(readFileSync(new URL(`../${name}/package.json`, import.meta.url), 'utf8'));
    return [manifest.name as string, manifest.version as string];
  }),
);

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'node',
  dts: false,
  clean: true,
  define: { __TROWEL_VERSIONS__: JSON.stringify(versions) },
});
