# create-trowel

Creates a [Void](https://void.cloud) app with React and the Trowel packages already wired together.

```sh
npm create trowel my-app
# or
pnpm create trowel my-app
```

Then:

```sh
cd my-app
npm install
npm run dev
```

The app has:

- Sign-up and sign-in with Void's auth
- Posts with policies for who may view, publish and delete them ([`@trowelkit/policies`](../policies))
- A `PostPublished` event with a queued listener ([`@trowelkit/events`](../events))
- A notification to the author by mail and in the app ([`@trowelkit/notifications`](../notifications))
- A limit of five new posts per user per minute ([`@trowelkit/rate-limit`](../rate-limit))

It follows Void's project layout, and keeps Trowel code in `src/`. The generated README explains where everything is.

With pnpm, the app also gets a `pnpm-workspace.yaml` that allows the install scripts Void needs.

## Developing the template

`template/` is a workspace package, so the repository's typecheck covers it with the local packages. To try it, run `pnpm dev` in `template/`, then `scripts/e2e.sh` from this package in another terminal.

The CLI replaces the template's `workspace:*` ranges with the versions of the Trowel packages it was built with, so release `create-trowel` whenever those packages change.
