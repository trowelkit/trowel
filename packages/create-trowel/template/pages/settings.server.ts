import { defineHandler } from 'void';
import { getUser } from 'void/auth';

// Only for signed-in users; the page reads the user from the layout's shared data.
export const loader = defineHandler((c) => (getUser() ? {} : c.redirect('/sign-in')));
