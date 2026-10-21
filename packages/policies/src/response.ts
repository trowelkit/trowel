/**
 * The outcome of an authorization check. Abilities can return one of these
 * (via `allow`, `deny`, `denyAsNotFound`, `denyWithStatus`) instead of a
 * boolean when they need a custom message or HTTP status.
 */
export interface AuthorizationResponse {
  readonly allowed: boolean;
  readonly message?: string;
  /** HTTP status used when the denial is thrown. Defaults to 403. */
  readonly status?: number;
}

export function allow(message?: string): AuthorizationResponse {
  return message === undefined ? { allowed: true } : { allowed: true, message };
}

export function deny(message?: string): AuthorizationResponse {
  return message === undefined ? { allowed: false } : { allowed: false, message };
}

export function denyWithStatus(status: number, message?: string): AuthorizationResponse {
  return message === undefined ? { allowed: false, status } : { allowed: false, status, message };
}

/** Deny with a 404, so the caller can't tell the resource exists. */
export function denyAsNotFound(message?: string): AuthorizationResponse {
  return denyWithStatus(404, message);
}

export function isAuthorizationResponse(value: unknown): value is AuthorizationResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { allowed?: unknown }).allowed === 'boolean'
  );
}
