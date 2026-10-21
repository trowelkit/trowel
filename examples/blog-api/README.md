# Blog API example

A small API-only Void app that uses [`@trowelkit/policies`](../../packages/policies), [`@trowelkit/events`](../../packages/events) and [`@trowelkit/notifications`](../../packages/notifications) with Void's built-in auth, a D1 database, queues and email.

| Route | Rule |
|---|---|
| `GET /api/posts` | Lists the posts the viewer may see (`post.view`) |
| `POST /api/posts` | Signed-in users only (`post.create`); guests get 401 |
| `GET /api/posts/:id` | Published posts for anyone, drafts for their author (`post.view` with `guest()`) |
| `PATCH /api/posts/:id` | The author only (`post.update`) |
| `DELETE /api/posts/:id` | The author only; anyone else gets 404 (`denyAsNotFound()`) |
| `GET /api/admin/stats` | Admins only, through `gate.middleware('viewStats')` |
| `GET /api/admin/activity` | Admins only; the rows written by the queued listener below |
| `GET /api/notifications` | The signed-in user's unread notifications |
| `POST /api/notifications/read` | Marks the given `ids`, or all of them, as read |

`admin@example.com` is treated as the admin (see `src/gate.ts`), and the policy's `before` hook lets the admin do anything.

## Events

Creating a published post, or publishing a draft, dispatches `PostPublished` (see `src/events.ts`). Its listener is queued: the bus sends a message to the `events` queue, and `queues/events.ts` runs the listener with `defineQueue(events.consume)`. The listener writes a row to the `activity` table.

A second, sync listener sends the author the `PostLive` notification (see `src/notifications/post-live.ts`) on two channels: mail and database. The notifier in `src/notifier.ts` queues each delivery to `queues/notifications.ts`, which sends the mail with Void's `sendEmail` and stores the in-app notification in the `notifications` table. During `pnpm dev` the mail lands in Void's local inbox; the dev server prints its URL.

The app never imports `void/email` itself, so `void.json` turns email on with `inference.bindings.email`.

## Run it

From the repo root:

```sh
pnpm install
pnpm build          # the example uses the packages' built output
cd examples/blog-api
pnpm void db push   # create the posts table locally
pnpm dev            # http://localhost:5173
```

In another terminal, `./scripts/e2e.sh` signs up three users (or signs them in on later runs), checks every rule above, waits for the queued listener's `activity` rows, and checks the author's email in the dev inbox and their in-app notifications.

This example uses `void db push` for local development only. Before deploying, generate migrations with `void db generate`.
