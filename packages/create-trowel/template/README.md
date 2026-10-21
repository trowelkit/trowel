# Trowel App

A [Void](https://void.cloud) app with React, built from the Trowel starter. People sign up, write posts and publish them. Publishing emails the author and adds an in-app notification, and each user can create five posts a minute.

## Run it

```sh
npm install
npm run dev
```

Open http://localhost:5173 and sign up. When the dev server starts, Void applies the migrations in `db/migrations/` to a local D1 database. Mail doesn't leave your machine: it lands in Void's local inbox, whose URL the dev server prints.

## What's where

| Path | What it does |
|---|---|
| `pages/` | React pages, with their loaders and actions in `.server.ts` files |
| `middleware/01.shared.ts` | The signed-in user and their unread count, for every page |
| `src/gate.ts`, `src/policies/post.ts` | Who may view, create, publish and delete posts ([`@trowelkit/policies`](https://github.com/trowelkit/trowel/tree/main/packages/policies)) |
| `src/events/`, `src/listeners/` | The event bus, the `PostPublished` event and its queued listener ([`@trowelkit/events`](https://github.com/trowelkit/trowel/tree/main/packages/events)) |
| `src/notifications/` | The notifier, and the mail and in-app notification sent on publish ([`@trowelkit/notifications`](https://github.com/trowelkit/trowel/tree/main/packages/notifications)) |
| `src/rate-limit.ts`, `durable-objects/rate-limiter.ts` | Five new posts per user per minute ([`@trowelkit/rate-limit`](https://github.com/trowelkit/trowel/tree/main/packages/rate-limit)) |
| `queues/` | Consumers for queued events and notification deliveries |
| `db/schema.ts`, `db/migrations/` | The `posts` and `notifications` tables |

Void's own conventions decide the top-level folders; Trowel code lives in `src/`.

## Generate more

[`@trowelkit/cli`](https://github.com/trowelkit/trowel/tree/main/packages/cli) writes new policies, events, listeners and notifications in the same layout:

```sh
npx trowel gen policy comment
npx trowel gen event comment-posted
npx trowel gen listener notify-post-author --event comment-posted --queued
npx trowel gen notification comment-posted
```

## Change the database

Edit `db/schema.ts`, then generate a migration and review it:

```sh
npx void db generate
```

The dev server applies new migrations when it starts. For quick local experiments, `npx void db push` changes the local database without a migration.

## Deploy

```sh
npx void deploy
```

Void provisions the database, queues and Durable Objects, and applies the migrations. On a Void platform, mail goes out from your project's sender, and recipients need to be verified first; see Void's email guide (`node_modules/void/docs/guide/email/sending.md`). When deploying to your own Cloudflare account, set `email.from` in `void.config.ts`.

Commit `void.lock.json` whenever Void changes it.
