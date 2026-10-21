# Blog API example

A small API-only Void app that uses [`@trowelkit/policies`](../../packages/policies) with Void's built-in auth and a D1 `posts` table.

| Route | Rule |
|---|---|
| `GET /api/posts` | Lists the posts the viewer may see (`post.view`) |
| `POST /api/posts` | Signed-in users only (`post.create`); guests get 401 |
| `GET /api/posts/:id` | Published posts for anyone, drafts for their author (`post.view` with `guest()`) |
| `PATCH /api/posts/:id` | The author only (`post.update`) |
| `DELETE /api/posts/:id` | The author only; anyone else gets 404 (`denyAsNotFound()`) |
| `GET /api/admin/stats` | Admins only, through `gate.middleware('viewStats')` |

`admin@example.com` is treated as the admin (see `src/gate.ts`), and the policy's `before` hook lets the admin do anything.

## Run it

From the repo root:

```sh
pnpm install
pnpm build          # the example uses the packages' built output
cd examples/blog-api
pnpm void db push   # create the posts table locally
pnpm dev            # http://localhost:5173
```

In another terminal, `./scripts/e2e.sh` signs up three users and checks every rule above.

This example uses `void db push` for local development only. Before deploying, generate migrations with `void db generate`.
