import { Link, useRouter } from '@void/react';
import { useState, type FormEvent } from 'react';
import { auth } from 'void/client';
import { Alert, AuthPage, Button, Field } from '../src/components/ui';

export default function SignUpPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setPending(true);
    const result = await auth.signUp.email({
      name: String(form.get('name')),
      email: String(form.get('email')),
      password: String(form.get('password')),
      // Where the link in the verification email leads.
      callbackURL: '/',
    });
    setPending(false);
    if (result.error) return setError(result.error.message ?? 'Could not sign up.');
    await router.visit('/');
  }

  return (
    <AuthPage
      title="Create an account"
      description="We'll send you a link to verify your email address."
      footer={
        <>
          Have an account? <Link href="/sign-in" className="font-medium text-amber-700 dark:text-amber-500">Sign in</Link>
        </>
      }
    >
      <form onSubmit={signUp} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Name" name="name" autoComplete="name" required />
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={8} required hint="At least 8 characters." />
        <Button disabled={pending} className="w-full">
          Create account
        </Button>
      </form>
    </AuthPage>
  );
}
