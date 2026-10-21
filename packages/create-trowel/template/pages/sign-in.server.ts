import { defineHandler, type InferProps } from 'void';
import { getUser } from 'void/auth';

export type Props = InferProps<typeof loader>;

// Signed-in users have nothing to do here.
export const loader = defineHandler((c) => {
  if (getUser()) return c.redirect('/');
  return { passwordReset: c.req.query('reset') === '1' };
});
