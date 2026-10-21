import { Link, useRouter } from '@void/react';
import { useState, type FormEvent } from 'react';
import { auth } from 'void/client';

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
    });
    setPending(false);
    if (result.error) return setError(result.error.message ?? 'Could not sign up.');
    await router.visit('/');
  }

  return (
    <>
      <h1>Sign up</h1>
      <form onSubmit={signUp}>
        <input name="name" placeholder="Name" autoComplete="name" required />
        <input name="email" type="email" placeholder="Email" autoComplete="email" required />
        <input
          name="password"
          type="password"
          placeholder="Password (8+ characters)"
          autoComplete="new-password"
          minLength={8}
          required
        />
        {error && <p className="error">{error}</p>}
        <button disabled={pending}>Create account</button>
      </form>
      <p className="muted">
        Have an account? <Link href="/sign-in">Sign in</Link>
      </p>
    </>
  );
}
