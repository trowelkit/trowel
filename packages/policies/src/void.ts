import { getUser } from 'void/auth';
import {
  defineGate as defineBaseGate,
  type AbilityArgs,
  type AbilityName,
  type Authorizer,
  type Gate,
  type GateDefinition,
  type GateUser,
  type UntypedAuthorizer,
} from './gate.ts';
import type { MaybePromise } from './policy.ts';

export * from './index.ts';

/** Abilities that take no arguments besides the user, so they can guard a route. */
export type RouteAbility<D> = {
  [N in AbilityName<D>]: AbilityArgs<D, N> extends [] ? N : never;
}[AbilityName<D>];

/** Matches Void's `defineHandler(middleware, handler)` middleware slot. */
export type GateMiddleware = (c: unknown, next: () => Promise<void>) => Promise<void>;

export interface VoidGateOptions<D> {
  /**
   * Loads the user that abilities receive. Defaults to Void's `getUser()`.
   * Override it to attach app data, such as roles from your own table.
   */
  user?: () => MaybePromise<GateUser<D> | null | undefined>;
}

/** A gate whose checks run against the signed-in user of the current request. */
export interface VoidGate<D> extends Gate<D>, Authorizer<D> {
  /**
   * Route middleware that requires an ability:
   * `export const GET = defineHandler(gate.middleware('viewAdmin'), handler)`.
   */
  middleware<N extends RouteAbility<D>>(ability: N): GateMiddleware;
}

/**
 * `defineGate` for Void apps. `gate.authorize('post.update', post)` checks the
 * current request's user; `gate.forUser(other)` still checks anyone else.
 */
export function defineGate<const D extends GateDefinition>(
  definition: D,
  options: VoidGateOptions<D> = {},
): VoidGate<D> {
  const gate = defineBaseGate(definition);
  const loadUser = options.user ?? (() => getUser() as GateUser<D> | null);
  const current = async () => gate.forUser(await loadUser()) as unknown as UntypedAuthorizer;

  const voidGate: Gate<D> & UntypedAuthorizer & { middleware(ability: string): GateMiddleware } = {
    ...gate,
    inspect: async (ability, ...args) => (await current()).inspect(ability, ...args),
    allows: async (ability, ...args) => (await current()).allows(ability, ...args),
    denies: async (ability, ...args) => (await current()).denies(ability, ...args),
    authorize: async (ability, ...args) => (await current()).authorize(ability, ...args),
    middleware: (ability) => async (_c, next) => {
      await (await current()).authorize(ability);
      await next();
    },
  };
  return voidGate as unknown as VoidGate<D>;
}
