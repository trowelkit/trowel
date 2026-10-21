# Trowel

Building blocks for [Void](https://void.cloud) apps on Cloudflare.

Void gives you the foundation: routing, database, auth, queues, email, storage and deploys. Trowel adds the pieces most apps end up writing themselves, as small packages you can adopt one at a time.

> Trowel is an independent community project. It isn't affiliated with VoidZero or Cloudflare.

## Packages

| Package | What it does | Status |
|---|---|---|
| [`@trowelkit/policies`](packages/policies) | Gates and policies for authorization | In progress |
| `@trowelkit/events` | Events with sync or queued listeners | Planned |
| `@trowelkit/notifications` | Notifications over mail, database, SMS and chat | Planned |
| `@trowelkit/rate-limit` | Rate limiting backed by Durable Objects | Planned |
| `@trowelkit/testing` | Fakes for events, notifications and queues | Planned |
| `@trowelkit/cli` | Generators for policies, events and notifications | Planned |

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
