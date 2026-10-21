# @trowelkit/policies

Gates and policies for [Void](https://void.cloud) apps.

```sh
npm install @trowelkit/policies
```

## Define a policy

A policy groups the abilities for one kind of resource. Each ability receives the user first, then whatever it needs to decide.

```ts
// src/policies/post.ts
import { definePolicy, denyAsNotFound, guest } from '@trowelkit/policies';
import type { Post, User } from '../types';

export default definePolicy({
  // Runs first. Return true/false to decide, or nothing to continue.
  before: (user: User) => (user.role === 'admin' ? true : undefined),

  view: guest((user: User | null, post: Post) => post.published || post.authorId === user?.id),
  create: (user: User) => user.emailVerified,
  update: (user: User, post: Post) => post.authorId === user.id,
  delete: (user: User, post: Post) => (post.authorId === user.id ? true : denyAsNotFound()),
});
```

## Register it in a gate

```ts
// src/gate.ts
import { defineGate } from '@trowelkit/policies/void';
import post from './policies/post';
import type { User } from './types';

export const gate = defineGate({
  abilities: {
    viewAdmin: (user: User) => user.role === 'admin',
  },
  policies: { post },
});
```

Policy abilities are addressed as `policy.ability`, so this gate knows `viewAdmin`, `post.view`, `post.create`, `post.update` and `post.delete`. Names and arguments are type-checked.

## Check abilities

`@trowelkit/policies/void` checks the signed-in user of the current request (from `void/auth`):

```ts
// routes/api/posts/[id].ts
import { defineHandler } from 'void';
import { gate } from '../../../src/gate';

export const PATCH = defineHandler(async (c) => {
  const post = await findPost(c.req.param('id'));
  await gate.authorize('post.update', post); // throws 401/403 when not allowed
  // ...
});
```

Guard a whole route with an ability that takes no arguments:

```ts
export const GET = defineHandler(gate.middleware('viewAdmin'), (c) => {
  return { stats: '...' };
});
```

| Method | Returns |
|---|---|
| `gate.allows(ability, ...args)` | `true` when allowed |
| `gate.denies(ability, ...args)` | `true` when denied |
| `gate.inspect(ability, ...args)` | The full response, including any message and status |
| `gate.authorize(ability, ...args)` | The response when allowed; throws `AuthorizationError` otherwise |
| `gate.forUser(user)` | The same checks for another user (or `null` for a guest) |
| `gate.middleware(ability)` | Route middleware for `defineHandler` |
| `gate.has(ability)` | Whether the gate knows the ability |

## Behavior

- **Results:** `true` allows; `false`, `null` and `undefined` deny. Return `allow()`, `deny(message)`, `denyAsNotFound()` or `denyWithStatus(status)` for a custom message or status.
- **Order:** the gate's `before` runs first (with the full name, e.g. `post.update`), then the policy's `before` (with the method name, e.g. `update`), then the ability. A hook that returns `null` or `undefined` lets the check continue.
- **Guests:** a signed-out visitor is denied with **401** before an ability runs, unless the ability is wrapped in `guest()`. `before` hooks are skipped for guests unless they're wrapped too. The 401 matches Void's `requireAuth`.
- **Errors:** `authorize()` throws `AuthorizationError`, which has `status`, `ability` and `getResponse()`. Void turns it into a plain-text response with that status, so you don't need to catch it.
- **Unknown abilities:** an ability name the gate doesn't know throws an `Error` instead of quietly denying.

## Your own user record

By default the gate checks Void's `getUser()`. To check against your own record, such as a user with roles from your database, pass a loader:

```ts
export const gate = defineGate(
  { policies: { post } },
  { user: async () => loadAppUser(getUser()) },
);
```

The core entry (`@trowelkit/policies`) has no Void dependency, so the same gate also works in queues, crons and tests with `gate.forUser(user)`.
