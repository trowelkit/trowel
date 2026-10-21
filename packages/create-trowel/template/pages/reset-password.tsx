import { Link, useRouter } from '@void/react';
import { useState, type FormEvent } from 'react';
import { auth } from 'void/client';
import { Alert, AuthPage, Button, Field } from '../src/components/ui';
import type { Props } from './reset-password.server';

export default function ResetPasswordPage({ token, invalid }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function reset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get('password'));
    if (newPassword !== String(form.get('confirm'))) return setError("The passwords don't match.");
    setError(null);
    setPending(true);
    const result = await auth.resetPassword({ newPassword, token: token ?? '' });
    setPending(false);
    if (result.error) return setError(result.error.message ?? 'Could not change the password.');
    await router.visit('/sign-in?reset=1');
  }

  if (invalid || !token) {
    return (
      <AuthPage title="This link doesn't work" footer={<Link href="/forgot-password" className="font-medium text-amber-700 dark:text-amber-500">Get a new link</Link>}>
        <Alert tone="error">The reset link is invalid or has expired.</Alert>
      </AuthPage>
    );
  }

  return (
    <AuthPage title="Choose a new password">
      <form onSubmit={reset} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="New password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        <Field label="Confirm the new password" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
        <Button disabled={pending} className="w-full">
          Change password
        </Button>
      </form>
    </AuthPage>
  );
}
