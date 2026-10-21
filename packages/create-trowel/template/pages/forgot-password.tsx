import { Link } from '@void/react';
import { useState, type FormEvent } from 'react';
import { auth } from 'void/client';
import { Alert, AuthPage, Button, Field } from '../src/components/ui';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setPending(true);
    const result = await auth.requestPasswordReset({ email: String(form.get('email')), redirectTo: '/reset-password' });
    setPending(false);
    if (result.error) return setError(result.error.message ?? 'Could not send the email.');
    setSent(true);
  }

  return (
    <AuthPage
      title="Forgot your password?"
      description="Enter your email address and we'll send you a link to choose a new one."
      footer={<Link href="/sign-in" className="font-medium text-amber-700 dark:text-amber-500">Back to sign in</Link>}
    >
      {sent ? (
        // The same answer whether or not the address has an account.
        <Alert tone="success">If an account uses that address, a reset link is on its way.</Alert>
      ) : (
        <form onSubmit={requestReset} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Email" name="email" type="email" autoComplete="email" required />
          <Button disabled={pending} className="w-full">
            Send reset link
          </Button>
        </form>
      )}
    </AuthPage>
  );
}
