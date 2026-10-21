import { Form, Link, useForm, useShared } from '@void/react';
import type { Props } from './index.server';

export default function HomePage({ posts }: Props) {
  const { user } = useShared();
  const form = useForm('/', { title: '', body: '' });

  return (
    <>
      <h1>Posts</h1>
      {user ? (
        <Form
          form={form}
          renderError={(error) => (
            <p className="error">
              {error.status === 429 ? "You're posting too fast. Try again in a minute." : error.message}
            </p>
          )}
        >
          <input
            placeholder="Title"
            value={form.data.title}
            onChange={(event) => form.setData('title', event.target.value)}
          />
          {form.errors.title && <p className="error">{form.errors.title}</p>}
          <textarea
            placeholder="Write something…"
            rows={4}
            value={form.data.body ?? ''}
            onChange={(event) => form.setData('body', event.target.value)}
          />
          <button disabled={form.pending}>Save draft</button>
        </Form>
      ) : (
        <p>
          <Link href="/sign-in">Sign in</Link> to write a post.
        </p>
      )}

      {posts.length === 0 ? (
        <p className="muted">No posts yet.</p>
      ) : (
        <ul className="list">
          {posts.map((post) => (
            <li key={post.id}>
              <Link href={`/posts/${post.id}`}>{post.title}</Link>
              {!post.published && <span className="badge">Draft</span>}
              <div className="muted">by {post.authorName}</div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
