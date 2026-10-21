# @trowelkit/cli

Generators for Trowel in [Void](https://void.cloud) apps. They write files in Void's project layout, with Trowel code under `src/`, and never overwrite a file.

```sh
npm install -D @trowelkit/cli
npx trowel --help
```

Apps made with `npm create trowel` already have it.

## Set up a feature

```sh
npx trowel add policies events notifications rate-limit
```

| Feature | Creates |
|---|---|
| `policies` | `src/gate.ts` |
| `events` | `src/events/index.ts` (the bus) and `queues/events.ts` (its consumer) |
| `notifications` | `src/notifications/index.ts` (the notifier, with mail and database channels), `queues/notifications.ts`, and the `notifications` table in `db/schema.ts` |
| `rate-limit` | `durable-objects/rate-limiter.ts` and `src/rate-limit.ts` |

Afterwards it lists what's left: the packages to install with your package manager, and steps such as turning on email or generating a migration.

## Generate code

```sh
npx trowel gen policy comment
npx trowel gen event comment-posted
npx trowel gen listener notify-post-author --event comment-posted --queued
npx trowel gen notification comment-posted
```

| Command | Creates |
|---|---|
| `gen policy <name>` | `src/policies/<name>.ts`: view, create, update and delete abilities to edit |
| `gen event <name>` | `src/events/<name>.ts`: the event and its payload type |
| `gen listener <name> --event <event> [--queued]` | `src/listeners/<name>.ts`: a function typed with the event's payload |
| `gen notification <name>` | `src/notifications/<name>.ts`: mail and database builders |

Names can be written as `comment-posted`, `comment_posted` or `CommentPosted`. Files use the dashed form, events and notifications the dotted one (`comment.posted`).

Generated code isn't registered for you. The output says where to add each piece, for example the `events.on(...)` line for a listener.
