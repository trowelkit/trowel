<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/wordmark-dark.svg">
    <img alt="Trowel" src=".github/assets/wordmark-light.svg" height="64">
  </picture>
</h1>

Building blocks for [Void](https://void.cloud) apps on Cloudflare.

Void gives you the foundation: routing, database, auth, queues, email, storage and deploys. Trowel adds the pieces most apps end up writing themselves, as small packages you can adopt one at a time.

> Trowel is an independent community project. It isn't affiliated with VoidZero or Cloudflare.

## Start a new app

```sh
npm create trowel my-app
```

This creates a Void app with React, sign-in, and the packages below already wired together. See [`create-trowel`](packages/create-trowel).

## Packages

| Package | What it does | Status |
|---|---|---|
| [`@trowelkit/policies`](packages/policies) | Gates and policies for authorization | In progress |
| [`@trowelkit/events`](packages/events) | Events with sync or queued listeners | In progress |
| [`@trowelkit/notifications`](packages/notifications) | Notifications over mail, database and custom channels | In progress |
| [`@trowelkit/rate-limit`](packages/rate-limit) | Rate limiting backed by Durable Objects | In progress |
| [`@trowelkit/testing`](packages/testing) | Test queues that run queued work in unit tests | In progress |
| [`@trowelkit/cli`](packages/cli) | Generators for policies, events, listeners and notifications | In progress |

## Development

Requires Node 22+ and pnpm 10.

```sh
pnpm install
pnpm test        # Vitest across all packages
pnpm typecheck   # tsc for each package
pnpm build       # tsdown for each package
```

Run `pnpm changeset` to describe a change that should be released.

## License

MIT
