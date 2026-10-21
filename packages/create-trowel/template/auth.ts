import { defineAuth } from 'void/auth';

// Void reads this config outside the app too (for migrations), so the app's code
// is imported only when an email is actually sent or an account deleted.
const account = () => import('./src/account');

export default defineAuth(({ defaults }) => ({
  ...defaults,
  emailAndPassword: {
    ...defaults.emailAndPassword,
    enabled: true,
    minPasswordLength: 8,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => (await account()).sendPasswordResetEmail(user, url),
  },
  emailVerification: {
    ...defaults.emailVerification,
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => (await account()).sendVerificationEmail(user, url),
  },
  user: {
    ...defaults.user,
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => (await account()).deleteUserData(user.id),
    },
  },
}));
