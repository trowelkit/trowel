import type { AuthorizationResponse } from './response.ts';

export type MaybePromise<T> = T | Promise<T>;

/**
 * What an ability may return. `true` allows; `false`, `null` and `undefined`
 * deny. Return an `AuthorizationResponse` for a custom message or status.
 */
export type AbilityResult = boolean | AuthorizationResponse | null | undefined | void;

/** An ability check: the user first, then whatever the ability needs. */
export type Ability = (user: any, ...args: any[]) => MaybePromise<AbilityResult>;

/**
 * Runs before every ability of a policy (or of the whole gate). Return
 * `true`/`false` (or a response) to decide early, or nothing to continue.
 */
export type BeforeHook = (user: any, ability: string, args: readonly unknown[]) => MaybePromise<AbilityResult>;

export type Policy = { readonly [ability: string]: Ability };

const GUEST = Symbol.for('trowel.policies.guest');

/**
 * Lets an ability (or `before` hook) run for signed-out visitors. Without it,
 * a guest is denied with a 401 before the check is called, so the `user`
 * parameter of an unwrapped ability is never `null`.
 */
export function guest<F extends (user: any, ...args: any[]) => any>(check: F): F {
  Object.defineProperty(check, GUEST, { value: true });
  return check;
}

export function allowsGuests(check: unknown): boolean {
  return typeof check === 'function' && (check as { [GUEST]?: boolean })[GUEST] === true;
}

/**
 * Groups the abilities for one kind of resource, such as posts or invoices.
 *
 * ```ts
 * export default definePolicy({
 *   before: (user: User) => (user.role === 'admin' ? true : undefined),
 *   create: (user: User) => user.emailVerified,
 *   update: (user: User, post: Post) => post.authorId === user.id,
 * });
 * ```
 *
 * `before` is optional and is not an ability itself.
 */
export function definePolicy<const P extends Policy>(policy: P): P {
  return policy;
}
