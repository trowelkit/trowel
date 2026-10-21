import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  event,
  feature,
  FEATURES,
  listener,
  notification,
  policy,
  type Feature,
  type FileAddition,
  type Generation,
} from './generators.ts';

export interface Output {
  log(line: string): void;
  error(line: string): void;
}

const HELP = `Generators for Trowel in Void apps.

Usage
  trowel gen policy <name>                            src/policies/<name>.ts
  trowel gen event <name>                             src/events/<name>.ts
  trowel gen listener <name> --event <event> [--queued]
                                                      src/listeners/<name>.ts
  trowel gen notification <name>                      src/notifications/<name>.ts
  trowel add <feature...>                             Set up ${FEATURES.join(', ')}

Names can be written as order-shipped, order_shipped or OrderShipped.
Existing files are never overwritten.`;

type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

function packageManagerIn(root: string): PackageManager {
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(root, 'bun.lock')) || existsSync(join(root, 'bun.lockb'))) return 'bun';
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

async function readManifest(root: string): Promise<Record<string, Record<string, string> | undefined> | null> {
  try {
    return JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}

/** Runs the CLI in `root`. Returns the exit code. */
export async function run(args: readonly string[], root: string, out: Output): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...args],
      allowPositionals: true,
      options: {
        event: { type: 'string' },
        queued: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (error) {
    out.error((error as Error).message);
    return 1;
  }
  const { positionals, values } = parsed;
  const [command, kind, ...rest] = positionals;
  if (values.help || !command || command === 'help') {
    out.log(HELP);
    return 0;
  }

  const manifest = await readManifest(root);
  if (!manifest) {
    out.error('No package.json here. Run trowel in the root of a Void app.');
    return 1;
  }
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
  if (!('void' in dependencies)) {
    out.error("This package.json doesn't list void. Run trowel in the root of a Void app.");
    return 1;
  }

  const generations: Generation[] = [];
  try {
    if (command === 'gen') {
      const [name] = rest;
      if (!name) throw new Error(`Usage: trowel gen ${kind ?? '<kind>'} <name>`);
      if (kind === 'policy') generations.push(policy(name));
      else if (kind === 'event') generations.push(event(name));
      else if (kind === 'notification') generations.push(notification(name));
      else if (kind === 'listener') {
        if (!values.event) throw new Error('A listener needs its event: trowel gen listener <name> --event <event>');
        generations.push(listener(name, { event: values.event, queued: values.queued }));
      } else throw new Error(`Unknown kind "${kind ?? ''}". Choose policy, event, listener or notification.`);
    } else if (command === 'add') {
      const features = [kind, ...rest].filter((f): f is string => Boolean(f));
      if (features.length === 0) throw new Error(`Usage: trowel add <feature...>, with ${FEATURES.join(', ')}`);
      for (const name of features) {
        if (!(FEATURES as readonly string[]).includes(name)) {
          throw new Error(`Unknown feature "${name}". Choose from ${FEATURES.join(', ')}.`);
        }
        generations.push(feature(name as Feature));
      }
    } else {
      throw new Error(`Unknown command "${command}". Run trowel --help.`);
    }
  } catch (error) {
    out.error((error as Error).message);
    return 1;
  }

  for (const generation of generations) {
    for (const file of generation.files) {
      const path = join(root, file.path);
      if (existsSync(path)) {
        out.log(`  skip    ${file.path} (exists)`);
        continue;
      }
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, file.contents);
      out.log(`  create  ${file.path}`);
    }
    for (const addition of generation.additions ?? []) {
      const path = join(root, addition.path);
      const before = existsSync(path) ? await readFile(path, 'utf8') : '';
      if (before.includes(addition.unless)) {
        out.log(`  skip    ${addition.path} (already set up)`);
        continue;
      }
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, withAddition(before, addition));
      out.log(`  ${before ? 'update' : 'create'}  ${addition.path}`);
    }
  }

  const missing = [...new Set(generations.flatMap((g) => g.packages))].filter((name) => !(name in dependencies));
  const next = [
    ...(missing.length > 0 ? [`Install: ${installCommand(packageManagerIn(root), missing)}`] : []),
    ...generations.flatMap((g) => g.next),
  ];
  if (next.length > 0) {
    out.log('\nNext:');
    for (const step of next) out.log(step.startsWith('  ') ? `  ${step}` : `  - ${step}`);
  }
  return 0;
}

/** The import goes above the existing code and the rest after it. */
function withAddition(before: string, addition: FileAddition): string {
  const body = before.trim();
  const top = [addition.prepend, body].filter(Boolean).join('\n');
  return `${[top, addition.append].filter(Boolean).join('\n\n')}\n`;
}

function installCommand(packageManager: PackageManager, packages: readonly string[]) {
  const verb = packageManager === 'npm' ? 'install' : 'add';
  return `${packageManager} ${verb} ${packages.join(' ')}`;
}
