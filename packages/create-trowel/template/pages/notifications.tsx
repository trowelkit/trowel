import { action, Link } from '@void/react';
import { Button, PageTitle } from '../src/components/ui';
import type { Props } from './notifications.server';

// The same text on the server and in the browser, whatever their time zones.
function formatTime(value: Date | string) {
  return `${new Date(value).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export default function NotificationsPage({ notifications }: Props) {
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <div>
      <PageTitle
        action={
          unread > 0 && (
            <Button variant="secondary" onClick={() => action('/notifications', { method: 'POST' })}>
              Mark all as read
            </Button>
          )
        }
      >
        Notifications
      </PageTitle>
      {notifications.length === 0 ? (
        <p className="text-sm text-stone-500">Nothing yet. Publish a post to get one.</p>
      ) : (
        <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white dark:divide-stone-800 dark:border-stone-800 dark:bg-stone-900">
          {notifications.map((n) => (
            <li key={n.id} className="flex gap-3 px-5 py-4">
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? 'bg-transparent' : 'bg-amber-500'}`} />
              <div>
                <p className={n.readAt ? 'text-stone-600 dark:text-stone-400' : 'font-medium'}>
                  {n.type === 'post.published' ? (
                    <>
                      Your post{' '}
                      <Link href={`/posts/${String(n.data.postId)}`} className="text-amber-700 hover:underline dark:text-amber-500">
                        {String(n.data.title)}
                      </Link>{' '}
                      is live.
                    </>
                  ) : (
                    n.type
                  )}
                </p>
                <p className="mt-1 text-xs text-stone-500">{formatTime(n.createdAt)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
