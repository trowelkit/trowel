# Working on Trowel

Trowel is a pnpm monorepo of small packages that add common app features to Void apps (https://void.cloud).

## Layout

- `packages/<name>/`: one published package each, named `@trowelkit/<name>`.
  - `src/index.ts`: the core entry. It must not import `void`, so it works in tests, queues and other runtimes.
  - `src/void.ts`: the Void integration, exported as `@trowelkit/<name>/void`. It re-exports the core entry.
- `packages/cli/`: the `trowel` command (`@trowelkit/cli`). Its generated code must match the layout of the starter template.
- `packages/create-trowel/`: `npm create trowel`. `template/` is a workspace package, so the repo's typecheck covers it with `workspace:*` dependencies; the CLI swaps those for the versions it was built with.
- `examples/`: Void apps that use the packages. They are workspace members and are not published.

## Rules

- Use only Void's documented public API (`node_modules/void/docs/`). Don't import Void internals.
- `void` is an optional peer dependency of each package, never a direct dependency.
- Prefer short, familiar names (`authorize`, `before`, `denyAsNotFound`) and plain TypeScript: no global magic.
- App code in examples and the template goes under `src/`, which Void leaves to the app. Don't add top-level folders that could clash with Void's conventions.
- Thrown HTTP errors implement `getResponse()`; Void's error handler turns them into responses.
- `db/schema.ts` is also loaded by drizzle-kit outside Vite, through CommonJS. A `/void` entry an app may import there needs a `default` export condition and must not import `void/email` at the top level (import it where it's used).
- Void only turns on email for apps that import `void/email` themselves. Apps that send mail only through a package set `inference.bindings.email: true` in `void.config.ts`.
- Describe features on their own terms. Don't reference other frameworks or where ideas came from, in code, docs or commit messages.

## Commands

Run these in order: the examples and the template import the packages' `dist/`.

- `pnpm build`: tsdown per package.
- `pnpm typecheck`: `tsc` per package. Type-level tests use `@ts-expect-error` inside functions that never run.
- `pnpm test`: Vitest across all packages, run from the repo root.

End to end, against a running dev server:

- Blog example: in `examples/blog-api`, run `pnpm void db push` and `pnpm dev`, then `./scripts/e2e.sh`.
- Starter: in `packages/create-trowel/template`, run `pnpm dev`, then `packages/create-trowel/scripts/e2e.sh`.

## Releases

- `pnpm changeset`: add a release note for any user-facing change, one per package.
- `create-trowel` pins the Trowel versions it was built with. When a package the template uses changes, add a `create-trowel` changeset too.
- Nothing is published without the maintainer's go-ahead.
