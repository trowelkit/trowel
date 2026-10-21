import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nextSteps, packageManagerFrom, scaffold, toPackageName, type ScaffoldOptions } from '../src/scaffold.ts';

const templateDir = fileURLToPath(new URL('../template', import.meta.url));
const versions = {
  '@trowelkit/cli': '0.1.0',
  '@trowelkit/events': '0.1.0',
  '@trowelkit/notifications': '0.1.0',
  '@trowelkit/policies': '0.1.0',
  '@trowelkit/rate-limit': '0.1.0',
  '@trowelkit/testing': '0.1.0',
};

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'create-trowel-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function options(overrides: Partial<ScaffoldOptions> = {}): ScaffoldOptions {
  return { templateDir, targetDir: join(root, 'my-app'), name: 'my-app', versions, packageManager: 'npm', ...overrides };
}

const manifestOf = async (dir: string) => JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));

describe('scaffold', () => {
  it('copies the template as a standalone app', async () => {
    const { targetDir } = options();
    await scaffold(options());

    for (const file of ['vite.config.ts', 'void.config.ts', 'tsconfig.json', 'README.md', 'pages/index.tsx', 'src/gate.ts']) {
      expect(existsSync(join(targetDir, file)), file).toBe(true);
    }
    expect(existsSync(join(targetDir, '.gitignore'))).toBe(true);
    expect(existsSync(join(targetDir, '_gitignore'))).toBe(false);
    expect(existsSync(join(targetDir, '.npmignore'))).toBe(false);
    for (const leftover of ['node_modules', '.void', 'dist']) {
      expect(existsSync(join(targetDir, leftover)), leftover).toBe(false);
    }
    expect(existsSync(join(targetDir, 'pnpm-workspace.yaml'))).toBe(false);
  });

  it('leaves out local secrets and data from a copy of the template', async () => {
    const copy = join(root, 'template-copy');
    await scaffold(options({ targetDir: copy, packageManager: 'npm' }));
    for (const file of ['.env', '.env.local', '.dev.vars', 'local.sqlite']) await writeFile(join(copy, file), 'secret');
    await writeFile(join(copy, '.env.example'), 'NAME=');

    const { targetDir } = options();
    await scaffold(options({ templateDir: copy }));
    for (const file of ['.env', '.env.local', '.dev.vars', 'local.sqlite']) {
      expect(existsSync(join(targetDir, file)), file).toBe(false);
    }
    expect(existsSync(join(targetDir, '.env.example'))).toBe(true);
  });

  it('names the app and pins the Trowel packages to published versions', async () => {
    await scaffold(options());
    const manifest = await manifestOf(options().targetDir);

    expect(manifest.name).toBe('my-app');
    expect(manifest.dependencies).toMatchObject({
      '@trowelkit/events': '^0.1.0',
      '@trowelkit/notifications': '^0.1.0',
      '@trowelkit/policies': '^0.1.0',
      '@trowelkit/rate-limit': '^0.1.0',
    });
    expect(JSON.stringify(manifest)).not.toContain('workspace:');
  });

  it('allows the builds Void needs for pnpm', async () => {
    await scaffold(options({ packageManager: 'pnpm' }));
    const workspace = await readFile(join(options().targetDir, 'pnpm-workspace.yaml'), 'utf8');
    expect(workspace).toContain('workerd: true');
    expect(workspace).toContain('better-sqlite3: false');
  });

  it('uses an empty directory but refuses one with files', async () => {
    const { targetDir } = options();
    await mkdir(targetDir);
    await scaffold(options());

    const other = join(root, 'taken');
    await mkdir(other);
    await writeFile(join(other, 'notes.txt'), 'keep me');
    await expect(scaffold(options({ targetDir: other }))).rejects.toThrow("already exists and isn't empty");
  });

  it('fails without a version for a Trowel package', async () => {
    await expect(scaffold(options({ versions: {} }))).rejects.toThrow('No published version is known for @trowelkit/');
  });
});

describe('packageManagerFrom', () => {
  it('reads the user agent', () => {
    expect(packageManagerFrom('pnpm/10.28.0 npm/? node/v24.5.0 darwin arm64')).toBe('pnpm');
    expect(packageManagerFrom('yarn/4.5.0 npm/? node/v22.0.0')).toBe('yarn');
    expect(packageManagerFrom('bun/1.3.0 npm/? node/v24.3.0')).toBe('bun');
    expect(packageManagerFrom('npm/11.0.0 node/v24.5.0')).toBe('npm');
    expect(packageManagerFrom(undefined)).toBe('npm');
  });
});

describe('toPackageName', () => {
  it('makes a valid package name', () => {
    expect(toPackageName('My App')).toBe('my-app');
    expect(toPackageName('.hidden_app')).toBe('hidden_app');
    expect(toPackageName('!!!')).toBe('trowel-app');
  });
});

describe('nextSteps', () => {
  it('uses the package manager', () => {
    expect(nextSteps('my-app', 'npm')).toEqual(['cd my-app', 'npm install', 'npm run dev']);
    expect(nextSteps('my-app', 'pnpm')).toEqual(['cd my-app', 'pnpm install', 'pnpm dev']);
  });
});
