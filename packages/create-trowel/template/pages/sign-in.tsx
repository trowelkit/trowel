import { Link, useRouter } from '@void/react';
import { useState, type FormEvent } from 'react';
import { auth } from 'void/client';

export default function SignInPage() {
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
    <>
      <h1>Sign in</h1>
      <form onSubmit={signIn}>
        <input name="email" type="email" placeholder="Email" autoComplete="email" required />
        <input name="password" type="password" placeholder="Password" autoComplete="current-password" required />
        {error && <p className="error">{error}</p>}
        <button disabled={pending}>Sign in</button>
      </form>
      <p className="muted">
        No account? <Link href="/sign-up">Sign up</Link>
      </p>
    </>
  );
}
