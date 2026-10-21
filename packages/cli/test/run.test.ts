import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { run } from '../src/run.ts';

let root: string;
let logs: string[];
let errors: string[];
const out = { log: (line: string) => void logs.push(line), error: (line: string) => void errors.push(line) };

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'trowel-cli-'));
  logs = [];
  errors = [];
  await writeFile(join(root, 'package.json'), JSON.stringify({ devDependencies: { void: '^1.1.12' } }));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const read = (path: string) => readFile(join(root, path), 'utf8');
const trowel = (...args: string[]) => run(args, root, out);

describe('trowel gen', () => {
  it('generates a policy', async () => {
    expect(await trowel('gen', 'policy', 'BlogPost')).toBe(0);
    const source = await read('src/policies/blog-post.ts');
    expect(source).toContain("import { definePolicy, guest } from '@trowelkit/policies';");
    expect(source).toContain('type BlogPost = { authorId: string };');
    expect(source).toContain('update: (user: AuthUser, blogPost: BlogPost) => blogPost.authorId === user.id,');
    expect(logs).toContain('  create  src/policies/blog-post.ts');
    expect(logs.join('\n')).toContain('Install: npm install @trowelkit/policies');
    expect(logs.join('\n')).toContain("import blogPost from './policies/blog-post'");
  });

  it('generates an event', async () => {
    await trowel('gen', 'event', 'order-shipped');
    const source = await read('src/events/order-shipped.ts');
    expect(source).toContain("export const OrderShipped = defineEvent<{ id: number }>('order.shipped');");
  });

  it('generates a listener for an event', async () => {
    await trowel('gen', 'listener', 'send-tracking-email', '--event', 'OrderShipped', '--queued');
    const source = await read('src/listeners/send-tracking-email.ts');
    expect(source).toContain("import type { OrderShipped } from '../events/order-shipped';");
    expect(source).toContain('export async function sendTrackingEmail(payload: PayloadOf<typeof OrderShipped>) {');
    expect(logs.join('\n')).toContain('events.on(OrderShipped, sendTrackingEmail, { queued: true });');
  });

  it('needs the event for a listener', async () => {
    expect(await trowel('gen', 'listener', 'send-tracking-email')).toBe(1);
    expect(errors[0]).toContain('--event <event>');
  });

  it('generates a notification', async () => {
    await trowel('gen', 'notification', 'invoice-paid');
    const source = await read('src/notifications/invoice-paid.ts');
    expect(source).toContain("export const InvoicePaidNotification = defineNotification('invoice.paid', {");
    expect(source).toContain("subject: 'Invoice paid',");
  });

  it('never overwrites a file', async () => {
    await mkdir(join(root, 'src/events'), { recursive: true });
    await writeFile(join(root, 'src/events/order-shipped.ts'), 'mine');
    await trowel('gen', 'event', 'order-shipped');
    expect(await read('src/events/order-shipped.ts')).toBe('mine');
    expect(logs).toContain('  skip    src/events/order-shipped.ts (exists)');
  });

  it('rejects unknown kinds and bad names', async () => {
    expect(await trowel('gen', 'widget', 'x')).toBe(1);
    expect(await trowel('gen', 'event', '123')).toBe(1);
    expect(errors).toEqual([
      'Unknown kind "widget". Choose policy, event, listener or notification.',
      '"123" isn\'t a usable name. Start with a letter, e.g. "order-shipped".',
    ]);
  });
});

describe('trowel add', () => {
  it('sets up several features at once', async () => {
    expect(await trowel('add', 'policies', 'events', 'rate-limit')).toBe(0);
    for (const file of ['src/gate.ts', 'src/events/index.ts', 'queues/events.ts', 'durable-objects/rate-limiter.ts', 'src/rate-limit.ts']) {
      expect(existsSync(join(root, file)), file).toBe(true);
    }
    expect(logs.join('\n')).toContain('Install: npm install @trowelkit/policies @trowelkit/events @trowelkit/rate-limit');
  });

  it('adds the notifications table to an existing schema once', async () => {
    await mkdir(join(root, 'db'));
    await writeFile(join(root, 'db/schema.ts'), "import { sqliteTable, text } from 'void/schema-d1';\n\nexport const posts = sqliteTable('posts', { id: text('id') });\n");
    await trowel('add', 'notifications');
    await trowel('add', 'notifications');

    expect(await read('db/schema.ts')).toBe(
      "import { notificationsTable } from '@trowelkit/notifications/void';\n" +
        "import { sqliteTable, text } from 'void/schema-d1';\n\n" +
        "export const posts = sqliteTable('posts', { id: text('id') });\n\n" +
        '// The database channel stores in-app notifications here.\nexport const notifications = notificationsTable();\n',
    );
    expect(logs).toContain('  update  db/schema.ts');
    expect(logs).toContain('  skip    db/schema.ts (already set up)');
    expect(logs.join('\n')).toContain('inference: { bindings: { email: true } }');
  });

  it('creates the schema when there is none', async () => {
    await trowel('add', 'notifications');
    expect(await read('db/schema.ts')).toBe(
      "import { notificationsTable } from '@trowelkit/notifications/void';\n\n" +
        '// The database channel stores in-app notifications here.\nexport const notifications = notificationsTable();\n',
    );
  });

  it('suggests the package manager the app uses and skips installed packages', async () => {
    await writeFile(join(root, 'pnpm-lock.yaml'), '');
    await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { '@trowelkit/events': '^0.1.0' }, devDependencies: { void: '^1' } }));
    await trowel('add', 'events', 'policies');
    expect(logs.join('\n')).toContain('Install: pnpm add @trowelkit/policies');
    expect(logs.join('\n')).not.toContain('@trowelkit/events @');
  });

  it('rejects unknown features', async () => {
    expect(await trowel('add', 'billing')).toBe(1);
    expect(errors[0]).toBe('Unknown feature "billing". Choose from policies, events, notifications, rate-limit.');
  });
});

describe('trowel', () => {
  it('prints help', async () => {
    expect(await trowel('--help')).toBe(0);
    expect(logs[0]).toContain('trowel gen policy <name>');
    expect(await trowel()).toBe(0);
  });

  it('only runs in a Void app', async () => {
    await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: {} }));
    expect(await trowel('gen', 'event', 'x')).toBe(1);
    await rm(join(root, 'package.json'));
    expect(await trowel('gen', 'event', 'x')).toBe(1);
    expect(errors).toEqual([
      "This package.json doesn't list void. Run trowel in the root of a Void app.",
      'No package.json here. Run trowel in the root of a Void app.',
    ]);
  });

  it('rejects unknown commands', async () => {
    expect(await trowel('deploy')).toBe(1);
    expect(errors[0]).toBe('Unknown command "deploy". Run trowel --help.');
  });
});
