import { Form, Link, useForm, useShared } from '@void/react';
import { Badge, Button, Card, Field, PageTitle, TextArea } from '../src/components/ui';
import type { Props } from './index.server';

function NewPost() {
  const form = useForm('/', { title: '', body: '' });
  return (
    <Card title="New post">
      <Form
        form={form}
        className="space-y-4"
        renderError={(error) => (
          <p className="text-sm text-red-600">
            {error.status === 429 ? "You're posting too fast. Try again in a minute." : error.message}
          </p>
        )}
      >
        <Field
          label="Title"
          value={form.data.title}
          onChange={(event) => form.setData('title', event.target.value)}
          error={form.errors.title}
        />
        <TextArea
          label="Body"
          rows={4}
          value={form.data.body ?? ''}
          onChange={(event) => form.setData('body', event.target.value)}
          error={form.errors.body}
        />
        <Button disabled={form.pending}>Save draft</Button>
      </Form>
    </Card>
  );
}

export default function HomePage({ posts, canCreate }: Props) {
  const { user } = useShared();

  return (
    <div className="space-y-6">
      <PageTitle>Posts</PageTitle>
      {canCreate && <NewPost />}
      {!user && (
        <Card>
          <p className="text-sm">
            <Link href="/sign-up" className="font-medium text-amber-700 dark:text-amber-500">Create an account</Link> to write
            posts, or <Link href="/sign-in" className="font-medium text-amber-700 dark:text-amber-500">sign in</Link>.
          </p>
        </Card>
      )}

      {posts.length === 0 ? (
        <p className="text-sm text-stone-500">No posts yet.</p>
      ) : (
        <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white dark:divide-stone-800 dark:border-stone-800 dark:bg-stone-900">
          {posts.map((post) => (
            <li key={post.id} className="px-5 py-4">
              <Link href={`/posts/${post.id}`} className="font-medium hover:underline">
                {post.title}
              </Link>
              {!post.published && <Badge>Draft</Badge>}
              <p className="mt-1 text-xs text-stone-500">by {post.authorName}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
