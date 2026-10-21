import { Link, useRouter, useShared } from '@void/react';
import type { ReactNode } from 'react';
import { auth } from 'void/client';
import '../src/app.css';

export default function Layout({ children }: { children: ReactNode }) {
  const { user, unreadNotifications } = useShared();
  const router = useRouter();

  async function signOut() {
    await auth.signOut();
    await router.visit('/');
  }

  return (
    <>
      <header>
        <Link href="/">
          <strong>Trowel App</strong>
        </Link>
        <span className="spacer" />
        {user ? (
          <>
            <Link href="/notifications">
              Notifications{unreadNotifications > 0 && <span className="badge">{unreadNotifications}</span>}
            </Link>
            <span className="muted">{user.name}</span>
            <button className="link" onClick={signOut}>
              Sign out
            </button>
          </>
        ) : (
          <>
            <Link href="/sign-in">Sign in</Link>
            <Link href="/sign-up">Sign up</Link>
          </>
        )}
      </header>
      <main>{children}</main>
    </>
  );
}
