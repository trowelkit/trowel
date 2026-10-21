import { action, Link } from '@void/react';
import type { Props } from './notifications.server';

export default function NotificationsPage({ notifications }: Props) {
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <>
      <h1>Notifications</h1>
      {unread > 0 && (
        <button className="link" onClick={() => action('/notifications', { method: 'POST' })}>
          Mark all as read
        </button>
      )}
      {notifications.length === 0 ? (
        <p className="muted">Nothing yet. Publish a post to get one.</p>
      ) : (
        <ul className="list">
          {notifications.map((n) => (
            <li key={n.id} className={n.readAt ? undefined : 'unread'}>
              {n.type === 'post.published' ? (
                <>
                  Your post <Link href={`/posts/${String(n.data.postId)}`}>{String(n.data.title)}</Link> is live.
                </>
              ) : (
                n.type
              )}
              <div className="muted">{formatTime(n.createdAt)}</div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// The same text on the server and in the browser, whatever their time zones.
function formatTime(value: Date | string) {
  return `${new Date(value).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
