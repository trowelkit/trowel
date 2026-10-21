import { defineNotification } from '@trowelkit/notifications';
import type { Recipient } from './post-published';

function linkEmail(user: Recipient, intro: string, action: string, url: string, outro: string) {
  return {
    text: `Hi ${user.name},\n\n${intro}\n\n${action}: ${url}\n\n${outro}`,
    html:
      `<p>Hi ${escape(user.name)},</p><p>${intro}</p>` +
      `<p><a href="${escape(url)}">${action}</a></p><p>${outro}</p>`,
  };
}

function escape(value: string) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export const VerifyEmailNotification = defineNotification('account.verify-email', {
  mail: (user: Recipient, { url }: { url: string }) => ({
    subject: 'Verify your email address',
    ...linkEmail(user, 'Thanks for signing up. Please confirm your email address.', 'Verify email address', url, "If you didn't create an account, you can ignore this email."),
  }),
});

export const ResetPasswordNotification = defineNotification('account.reset-password', {
  mail: (user: Recipient, { url }: { url: string }) => ({
    subject: 'Reset your password',
    ...linkEmail(user, 'Someone asked to reset the password for your account.', 'Choose a new password', url, "If it wasn't you, you can ignore this email: your password won't change."),
  }),
});
