import { useRouter, useShared } from '@void/react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { auth } from 'void/client';
import { Alert, Button, Card, Field, PageTitle } from '../src/components/ui';

type Status = { tone: 'success' | 'error'; message: string } | null;

/** Runs a settings form: reads its fields, calls `submit`, and reports the outcome. */
function useSettingsForm(submit: (form: FormData) => Promise<{ error?: { message?: string } | null }>, success: string) {
  const [status, setStatus] = useState<Status>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    setStatus(null);
    setPending(true);
    const result = await submit(new FormData(element));
    setPending(false);
    if (result.error) return setStatus({ tone: 'error', message: result.error.message ?? 'Something went wrong.' });
    element.reset();
    setStatus({ tone: 'success', message: success });
  }

  const message: ReactNode = status && <Alert tone={status.tone}>{status.message}</Alert>;
  return { onSubmit, pending, message };
}

export default function SettingsPage() {
  const { user } = useShared();
  const router = useRouter();

  const profile = useSettingsForm(async (form) => {
    const result = await auth.updateUser({ name: String(form.get('name')) });
    if (!result.error) await router.refresh();
    return result;
  }, 'Your name was saved.');

  const password = useSettingsForm(
    (form) =>
      auth.changePassword({
        currentPassword: String(form.get('current')),
        newPassword: String(form.get('password')),
        revokeOtherSessions: true,
      }),
    'Your password was changed. Other devices were signed out.',
  );

  const removal = useSettingsForm(async (form) => {
    const result = await auth.deleteUser({ password: String(form.get('password')) });
    if (!result.error) await router.visit('/');
    return result;
  }, 'Your account was deleted.');

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageTitle>Settings</PageTitle>

      <Card title="Profile" description={`Signed in as ${user.email}.`}>
        <form onSubmit={profile.onSubmit} className="max-w-md space-y-4">
          {profile.message}
          <Field label="Name" name="name" defaultValue={user.name} autoComplete="name" required />
          <Button disabled={profile.pending}>Save</Button>
        </form>
      </Card>

      <Card title="Password" description="Changing it signs you out on your other devices.">
        <form onSubmit={password.onSubmit} className="max-w-md space-y-4">
          {password.message}
          <Field label="Current password" name="current" type="password" autoComplete="current-password" required />
          <Field label="New password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          <Button disabled={password.pending}>Change password</Button>
        </form>
      </Card>

      <Card title="Delete account" description="This deletes your account, your posts and your notifications. It can't be undone.">
        <form onSubmit={removal.onSubmit} className="max-w-md space-y-4">
          {removal.message}
          <Field label="Password" name="password" type="password" autoComplete="current-password" required />
          <Button variant="danger" disabled={removal.pending}>
            Delete my account
          </Button>
        </form>
      </Card>
    </div>
  );
}
