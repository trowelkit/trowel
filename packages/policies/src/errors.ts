import type { AuthorizationResponse } from './response.ts';

const DEFAULT_MESSAGES: Record<number, string> = {
  401: 'Unauthenticated.',
  403: 'This action is unauthorized.',
  404: 'Not Found',
};

/**
 * Thrown by `authorize()` when an ability is denied.
 *
 * It implements `getResponse()`, which Void's error handler (and Hono's) turn
 * into an HTTP response, so throwing it from a route or loader is enough.
 */
export class AuthorizationError extends Error {
  override readonly name = 'AuthorizationError';
  readonly status: number;
  readonly ability: string;
  readonly response: AuthorizationResponse;

  constructor(ability: string, response: AuthorizationResponse) {
    const status = response.status ?? 403;
    super(response.message ?? DEFAULT_MESSAGES[status] ?? DEFAULT_MESSAGES[403]);
    this.status = status;
    this.ability = ability;
    this.response = response;
  }

  getResponse(): Response {
    return new Response(this.message, {
      status: this.status,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
}
