#!/usr/bin/env node
import { basename, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { nextSteps, packageManagerFrom, scaffold, toPackageName } from './scaffold.ts';

declare const __TROWEL_VERSIONS__: Record<string, string>;

const HELP = `Create a Void app with Trowel.

Usage
  npm create trowel [directory]
  pnpm create trowel [directory]

Options
  -h, --help  Show this help`;

async function askForDirectory(): Promise<string> {
  if (!process.stdin.isTTY) return 'trowel-app';
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await prompt.question('Project directory (trowel-app): ');
    return answer.trim() || 'trowel-app';
  } finally {
    prompt.close();
  }
}

async function main(args: string[]) {
  if (args.includes('-h') || args.includes('--help')) {
    console.log(HELP);
    return;
  }
  const directory = args.find((arg) => !arg.startsWith('-')) ?? (await askForDirectory());
  const targetDir = resolve(directory);
  const packageManager = packageManagerFrom(process.env.npm_config_user_agent);

  await scaffold({
    templateDir: fileURLToPath(new URL('../template', import.meta.url)),
    targetDir,
    name: toPackageName(basename(targetDir)),
    versions: __TROWEL_VERSIONS__,
    packageManager,
  });

  console.log(`\nCreated a Trowel app in ${targetDir}.\n\nNext:\n`);
  for (const step of nextSteps(directory, packageManager)) console.log(`  ${step}`);
  console.log('\nThen open http://localhost:5173 and sign up. See README.md for a tour.\n');
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
