import { action, Link } from '@void/react';
import { useState } from 'react';
import { Alert, Badge, Button, Card } from '../../src/components/ui';
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
    <article className="space-y-6">
      <Link href="/" className="text-sm text-amber-700 hover:underline dark:text-amber-500">
        ← All posts
      </Link>
      <Card>
        <h1 className="text-2xl font-semibold tracking-tight">
          {post.title}
          {!post.published && <Badge>Draft</Badge>}
        </h1>
        <p className="mt-1 text-sm text-stone-500">by {post.authorName}</p>
        {post.body && <p className="mt-6 whitespace-pre-line leading-relaxed">{post.body}</p>}
        {(can.publish || can.delete) && (
          <div className="mt-6 flex gap-3 border-t border-stone-200 pt-6 dark:border-stone-800">
            {can.publish && <Button onClick={() => run('publish')}>Publish</Button>}
            {can.delete && (
              <Button variant="secondary" onClick={() => confirm('Delete this post?') && run('delete')}>
                Delete
              </Button>
            )}
          </div>
        )}
      </Card>
      {error && <Alert tone="error">{error}</Alert>}
    </article>
  );
}
