import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export interface ScaffoldOptions {
  /** The template directory to copy. */
  templateDir: string;
  /** Where the new app goes. Must not exist yet, or be empty. */
  targetDir: string;
  /** The app's package name. */
  name: string;
  /** Versions of the `@trowelkit/*` packages the template uses, by package name. */
  versions: Readonly<Record<string, string>>;
  packageManager: PackageManager;
}

// Development leftovers that may sit in the template; never part of a new app.
const SKIPPED = new Set(['node_modules', 'dist', '.void', '.wrangler', '.void-wrangler.jsonc', '.npmignore']);

// Local secrets and data, in case a maintainer's copy of the template has them.
function isPrivate(name: string) {
  if (name === '.env.example') return false;
  return name === '.env' || name.startsWith('.env.') || name.startsWith('.dev.vars') || /\.sqlite/.test(name);
}

// npm leaves .gitignore files out of published packages, so the template ships it renamed.
const RENAMED: Readonly<Record<string, string>> = { _gitignore: '.gitignore' };

// Per Void's quickstart: let its native dependencies build, and use its bundled SQLite.
const PNPM_WORKSPACE = `# Lets Void's native dependencies run their install scripts. Void ships its own SQLite.
allowBuilds:
  esbuild: true
  sharp: true
  workerd: true
  better-sqlite3: false
`;

/** Guesses the package manager from the `npm_config_user_agent` that `npm create` and friends set. */
export function packageManagerFrom(userAgent: string | undefined): PackageManager {
  const name = userAgent?.split('/')[0];
  return name === 'pnpm' || name === 'yarn' || name === 'bun' ? name : 'npm';
}

/** Turns a directory name into a valid npm package name. */
export function toPackageName(directory: string): string {
  const name = directory
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/g, '-')
    .replace(/^[._-]+|[-]+$/g, '');
  return name || 'trowel-app';
}

/** The commands to run after scaffolding. */
export function nextSteps(directory: string, packageManager: PackageManager): string[] {
  const run = packageManager === 'npm' ? 'npm run' : packageManager;
  return [`cd ${directory}`, `${packageManager} install`, `${run} dev`];
}

async function isEmptyOrMissing(directory: string) {
  if (!existsSync(directory)) return true;
  return (await readdir(directory)).length === 0;
}

async function copyTemplate(from: string, to: string) {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (SKIPPED.has(entry.name) || isPrivate(entry.name)) continue;
    const target = join(to, RENAMED[entry.name] ?? entry.name);
    if (entry.isDirectory()) await copyTemplate(join(from, entry.name), target);
    else if (entry.isFile()) await copyFile(join(from, entry.name), target);
  }
}

/**
 * The template's package.json uses `workspace:*` for Trowel packages, so the
 * repository can test it. A new app gets the published versions instead.
 */
function pinVersions(manifest: Record<string, unknown>, versions: Readonly<Record<string, string>>) {
  for (const field of ['dependencies', 'devDependencies']) {
    const deps = manifest[field] as Record<string, string> | undefined;
    for (const [name, range] of Object.entries(deps ?? {})) {
      if (!range.startsWith('workspace:')) continue;
      const version = versions[name];
      if (!version) throw new Error(`No published version is known for ${name}.`);
      deps![name] = `^${version}`;
    }
  }
}

/** Copies the starter template into `targetDir` and makes it a standalone app. */
export async function scaffold(options: ScaffoldOptions): Promise<void> {
  const { templateDir, targetDir, name, versions, packageManager } = options;
  if (!(await isEmptyOrMissing(targetDir))) {
    throw new Error(`${targetDir} already exists and isn't empty.`);
  }
  await copyTemplate(templateDir, targetDir);

  const manifestPath = join(targetDir, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
  manifest.name = name;
  pinVersions(manifest, versions);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  if (packageManager === 'pnpm') await writeFile(join(targetDir, 'pnpm-workspace.yaml'), PNPM_WORKSPACE);
}

