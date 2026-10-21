import { Link, useRouter } from '@void/react';
import { useState, type FormEvent } from 'react';
import { auth } from 'void/client';
import { Alert, AuthPage, Button, Field } from '../src/components/ui';
import type { Props } from './sign-in.server';

export default function SignInPage({ passwordReset }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setPending(true);
    const result = await auth.signIn.email({
      email: String(form.get('email')),
      password: String(form.get('password')),
    });
    setPending(false);
    if (result.error) return setError(result.error.message ?? 'Could not sign in.');
    await router.visit('/');
  }

  return (
    <AuthPage
      title="Sign in"
      description="Welcome back."
      footer={
        <>
          No account? <Link href="/sign-up" className="font-medium text-amber-700 dark:text-amber-500">Sign up</Link>
        </>
      }
    >
      <form onSubmit={signIn} className="space-y-4">
        {passwordReset && <Alert tone="success">Your password was changed. Sign in with the new one.</Alert>}
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        <div className="flex items-center justify-between">
          <Link href="/forgot-password" className="text-sm text-amber-700 hover:underline dark:text-amber-500">
            Forgot your password?
          </Link>
          <Button disabled={pending}>Sign in</Button>
        </div>
      </form>
    </AuthPage>
  );
}
