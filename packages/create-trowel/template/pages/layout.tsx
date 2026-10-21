import { Link, useRouter, useShared } from '@void/react';
import { useState, type ReactNode } from 'react';
import { auth } from 'void/client';
import { Badge, Button } from '../src/components/ui';
import '../src/app.css';

function VerifyEmailBanner({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  async function resend() {
    setState('sending');
    const result = await auth.sendVerificationEmail({ email, callbackURL: '/' });
    setState(result.error ? 'failed' : 'sent');
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
        <span>Check your inbox to verify {email}. You can post once it's verified.</span>
        {state === 'sent' ? (
          <span className="font-medium">Sent a new link.</span>
        ) : (
          <Button variant="link" onClick={resend} disabled={state === 'sending'}>
            {state === 'failed' ? 'Try again' : 'Resend the email'}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, unreadNotifications } = useShared();
  const router = useRouter();

  async function signOut() {
    await auth.signOut();
    await router.visit('/');
  }

  const nav = 'rounded-md px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-white';

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-3">
          <Link href="/" className="mr-4 text-base font-semibold tracking-tight">
            Trowel App
          </Link>
          <Link href="/" className={nav}>
            Posts
          </Link>
          {user && (
            <Link href="/notifications" className={nav}>
              Notifications{unreadNotifications > 0 && <Badge>{unreadNotifications}</Badge>}
            </Link>
          )}
          <span className="flex-1" />
          {user ? (
            <>
              <Link href="/settings" className={nav}>
                {user.name}
              </Link>
              <Button variant="secondary" onClick={signOut}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Link href="/sign-in" className={nav}>
                Sign in
              </Link>
              <Link href="/sign-up" className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">
                Sign up
              </Link>
            </>
          )}
        </div>
      </header>
      {user && !user.emailVerified && <VerifyEmailBanner email={user.email} />}
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t border-stone-200 py-6 text-center text-xs text-stone-500 dark:border-stone-800">
        Built with Void and Trowel
      </footer>
    </div>
  );
}
