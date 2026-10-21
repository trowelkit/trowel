import { notifications, posts } from '@schema';
import { db, eq } from 'void/db';
import { notifier } from './notifications';
import { ResetPasswordNotification, VerifyEmailNotification } from './notifications/account';

interface AccountUser {
  id: string;
  name: string;
  email: string;
}

// Queued, so the request that asked for the email doesn't wait for it (or reveal timing).
export async function sendVerificationEmail(user: AccountUser, url: string) {
  await notifier.send({ id: user.id, name: user.name, email: user.email }, VerifyEmailNotification, { url });
}

export async function sendPasswordResetEmail(user: AccountUser, url: string) {
  await notifier.send({ id: user.id, name: user.name, email: user.email }, ResetPasswordNotification, { url });
}

/** Removes a user's own data before their account is deleted. */
export async function deleteUserData(userId: string) {
  await db.delete(posts).where(eq(posts.authorId, userId));
  await db.delete(notifications).where(eq(notifications.notifiableId, userId));
}
