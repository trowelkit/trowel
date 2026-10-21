import { AuthorizationError } from './errors.ts';
import { allowsGuests, type Ability, type AbilityResult, type BeforeHook, type Policy } from './policy.ts';
import { denyWithStatus, isAuthorizationResponse, type AuthorizationResponse } from './response.ts';

export interface GateDefinition {
  /** Runs before every ability. Receives the full ability name, e.g. `post.update`. */
  readonly before?: BeforeHook;
  /** Abilities that aren't tied to a resource, e.g. `viewAdmin`. */
  readonly abilities?: { readonly [name: string]: Ability };
  /** Policies by resource name. `post: postPolicy` exposes `post.update`, etc. */
  readonly policies?: { readonly [name: string]: Policy };
}

type AbilityMap<D> = D extends { readonly abilities: infer A } ? A : {};
type PolicyMap<D> = D extends { readonly policies: infer P } ? P : {};

type PolicyAbilityName<Ps> = {
  [PK in keyof Ps & string]: `${PK}.${Exclude<keyof Ps[PK] & string, 'before'>}`;
}[keyof Ps & string];

/** Every ability name a gate knows: plain abilities plus `policy.ability`. */
export type AbilityName<D> = (keyof AbilityMap<D> & string) | PolicyAbilityName<PolicyMap<D>>;

export type AbilityFor<D, N> = N extends keyof AbilityMap<D>
  ? AbilityMap<D>[N]
  : N extends `${infer PK}.${infer AK}`
    ? PK extends keyof PolicyMap<D>
      ? AK extends keyof PolicyMap<D>[PK]
        ? PolicyMap<D>[PK][AK]
        : never
      : never
    : never;

/** The arguments an ability takes after the user, e.g. `[post: Post]`. */
export type AbilityArgs<D, N> = AbilityFor<D, N> extends (user: any, ...args: infer A) => any ? A : never;

type AllChecks<D> =
  | (D extends { readonly before: infer B } ? B : never)
  | AbilityMap<D>[keyof AbilityMap<D>]
  | { [PK in keyof PolicyMap<D>]: PolicyMap<D>[PK][keyof PolicyMap<D>[PK]] }[keyof PolicyMap<D>];
// Checks that ignore the user, like `guest(() => true)`, would otherwise add `unknown`.
type UserOf<F> = F extends () => any ? never : F extends (user: infer U, ...args: any[]) => any ? U : never;
type DeclaredUser<D> = Exclude<UserOf<AllChecks<D>>, null | undefined>;

/**
 * The user type the gate's checks expect, taken from their first parameter.
 * `unknown` when no check declares one.
 */
export type GateUser<D> = [DeclaredUser<D>] extends [never] ? unknown : DeclaredUser<D>;

/** Authorization checks for one user. */
export interface Authorizer<D> {
  /** Runs the check and returns the full response, including any message. */
  inspect<N extends AbilityName<D>>(ability: N, ...args: AbilityArgs<D, N>): Promise<AuthorizationResponse>;
  allows<N extends AbilityName<D>>(ability: N, ...args: AbilityArgs<D, N>): Promise<boolean>;
  denies<N extends AbilityName<D>>(ability: N, ...args: AbilityArgs<D, N>): Promise<boolean>;
  /** Throws `AuthorizationError` (401, 403 or the denial's status) unless allowed. */
  authorize<N extends AbilityName<D>>(ability: N, ...args: AbilityArgs<D, N>): Promise<AuthorizationResponse>;
}

/** `Authorizer` without the ability typing, for code that wraps a gate. */
export interface UntypedAuthorizer {
  inspect(ability: string, ...args: unknown[]): Promise<AuthorizationResponse>;
  allows(ability: string, ...args: unknown[]): Promise<boolean>;
  denies(ability: string, ...args: unknown[]): Promise<boolean>;
  authorize(ability: string, ...args: unknown[]): Promise<AuthorizationResponse>;
}

export interface Gate<D> {
  readonly definition: D;
  /** Checks for a specific user. Pass `null` for a signed-out visitor. */
  forUser(user: GateUser<D> | null | undefined): Authorizer<D>;
  has(ability: string): ability is AbilityName<D>;
}

const ALLOWED: AuthorizationResponse = Object.freeze({ allowed: true });
const DENIED: AuthorizationResponse = Object.freeze({ allowed: false });
const UNAUTHENTICATED: AuthorizationResponse = Object.freeze(denyWithStatus(401));

interface ResolvedAbility {
  check: Ability;
  policyBefore?: BeforeHook | undefined;
  method: string;
}

function toResponse(result: AbilityResult): AuthorizationResponse {
  if (result === true) return ALLOWED;
  if (isAuthorizationResponse(result)) return result;
  return DENIED;
}

function decided(result: AbilityResult): boolean {
  return result !== undefined && result !== null;
}

/**
 * Collects a project's abilities and policies in one place.
 *
 * ```ts
 * export const gate = defineGate({
 *   before: (user: User) => (user.role === 'admin' ? true : undefined),
 *   abilities: { viewAdmin: (user: User) => user.role === 'staff' },
 *   policies: { post: postPolicy },
 * });
 *
 * await gate.forUser(user).authorize('post.update', post);
 * ```
 */
export function defineGate<const D extends GateDefinition>(definition: D): Gate<D> {
  const { before, abilities = {}, policies = {} } = definition as GateDefinition;

  for (const name of Object.keys(policies)) {
    if (name.includes('.')) {
      throw new Error(`Policy name "${name}" can't contain "." because abilities are addressed as "${name}.<ability>".`);
    }
  }

  function resolve(ability: string): ResolvedAbility | undefined {
    if (Object.hasOwn(abilities, ability)) {
      return { check: abilities[ability]!, method: ability };
    }
    const dot = ability.indexOf('.');
    if (dot === -1) return undefined;
    const policyName = ability.slice(0, dot);
    const method = ability.slice(dot + 1);
    const policy = Object.hasOwn(policies, policyName) ? policies[policyName] : undefined;
    if (!policy || method === 'before' || !Object.hasOwn(policy, method)) return undefined;
    return { check: policy[method]!, policyBefore: policy.before as BeforeHook | undefined, method };
  }

  async function inspect(user: unknown, ability: string, args: unknown[]): Promise<AuthorizationResponse> {
    const resolved = resolve(ability);
    if (!resolved) {
      throw new Error(`Unknown ability "${ability}". Add it to defineGate({ abilities }) or to a policy.`);
    }
    const signedIn = user !== null && user !== undefined;

    if (before && (signedIn || allowsGuests(before))) {
      const early = await before(user, ability, args);
      if (decided(early)) return toResponse(early);
    }
    const { policyBefore } = resolved;
    if (policyBefore && (signedIn || allowsGuests(policyBefore))) {
      const early = await policyBefore(user, resolved.method, args);
      if (decided(early)) return toResponse(early);
    }
    if (!signedIn && !allowsGuests(resolved.check)) return UNAUTHENTICATED;

    return toResponse(await resolved.check(user, ...args));
  }

  function forUser(user: unknown): Authorizer<D> {
    const authorizer: UntypedAuthorizer = {
      inspect: (ability, ...args) => inspect(user, ability, args),
      allows: async (ability, ...args) => (await inspect(user, ability, args)).allowed,
      denies: async (ability, ...args) => !(await inspect(user, ability, args)).allowed,
      authorize: async (ability, ...args) => {
        const response = await inspect(user, ability, args);
        if (!response.allowed) throw new AuthorizationError(ability, response);
        return response;
      },
    };
    return authorizer as unknown as Authorizer<D>;
  }

  return {
    definition,
    forUser,
    has: (ability: string): ability is AbilityName<D> => resolve(ability) !== undefined,
  };
}
