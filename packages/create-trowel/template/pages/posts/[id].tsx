import { action, Link } from '@void/react';
import { useState } from 'react';
import type { Props } from './[id].server';

export default function PostPage({ post, can }: Props) {
  const [error, setError] = useState<string | null>(null);
  const params = { id: String(post.id) };

  async function run(name: 'publish' | 'delete') {
    setError(null);
    const result =
      name === 'publish'
        ? await action('/posts/:id?publish', { params, method: 'POST' })
        : await action('/posts/:id?delete', { params, method: 'POST' });
    if (!result.ok) setError(result.error.message);
  }

  return (
    <article>
      <p>
        <Link href="/">← All posts</Link>
      </p>
      <h1>
        {post.title}
        {!post.published && <span className="badge">Draft</span>}
      </h1>
      <p className="muted">by {post.authorName}</p>
      {post.body && <p>{post.body}</p>}
      <p>
        {can.publish && <button onClick={() => run('publish')}>Publish</button>}{' '}
        {can.delete && (
          <button className="link" onClick={() => confirm('Delete this post?') && run('delete')}>
            Delete
          </button>
        )}
      </p>
      {error && <p className="error">{error}</p>}
    </article>
  );
}
