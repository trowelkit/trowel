import { defineHandler, type InferProps } from 'void';

export type Props = InferProps<typeof loader>;

// The link in the email leads here with ?token=..., or ?error=INVALID_TOKEN when it has expired.
export const loader = defineHandler((c) => ({
  token: c.req.query('token') ?? null,
  invalid: c.req.query('error') !== undefined,
}));
