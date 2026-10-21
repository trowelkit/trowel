import { defineHandler } from 'void';
import { getUser } from 'void/auth';

// Signed-in users have nothing to do here.
export const loader = defineHandler((c) => (getUser() ? c.redirect('/') : {}));
