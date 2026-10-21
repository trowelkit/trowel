# Working on Trowel

Trowel is a pnpm monorepo of small packages that add common app features to Void apps (https://void.cloud).

## Layout

- `packages/<name>/`: one published package each, named `@trowelkit/<name>`.
  - `src/index.ts`: the core entry. It must not import `void`, so it works in tests, queues and other runtimes.
  - `src/void.ts`: the Void integration, exported as `@trowelkit/<name>/void`. It re-exports the core entry.
- `examples/`: Void apps that use the packages. They are workspace members and are not published.

## Rules

- Use only Void's documented public API (`node_modules/void/docs/`). Don't import Void internals.
- `void` is an optional peer dependency of each package, never a direct dependency.
- Prefer short, familiar names (`authorize`, `before`, `denyAsNotFound`) and plain TypeScript: no global magic.
- App code in examples goes under `src/`, which Void leaves to the app. Don't add top-level folders that could clash with Void's conventions.
- Thrown HTTP errors implement `getResponse()`; Void's error handler turns them into responses.

## Commands

- `pnpm test`: Vitest across all packages, run from the repo root.
- `pnpm typecheck`: `tsc` per package. Type-level tests use `@ts-expect-error` inside functions that never run.
- `pnpm build`: tsdown per package.
- `pnpm changeset`: add a release note for any user-facing change.
