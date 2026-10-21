#!/usr/bin/env node
import { run } from './run.ts';

run(process.argv.slice(2), process.cwd(), {
  log: (line) => console.log(line),
  error: (line) => console.error(line),
}).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  },
);
