import { namesOf } from './names.ts';

export interface GeneratedFile {
  /** Relative to the app root. */
  readonly path: string;
  readonly contents: string;
}

/** Text to add to an existing file, or to start it with when it doesn't exist. */
export interface FileAddition {
  readonly path: string;
  /** Skip the file when it already contains this. */
  readonly unless: string;
  /** Lines added at the top of the file. */
  readonly prepend?: string;
  /** Lines added at the end of the file. */
  readonly append: string;
}

export interface Generation {
  readonly files: readonly GeneratedFile[];
  readonly additions?: readonly FileAddition[];
  /** Packages the generated code imports. */
  readonly packages: readonly string[];
  /** What to do next, one step per line. */
  readonly next: readonly string[];
}

export function policy(name: string): Generation {
  const n = namesOf(name);
  return {
    files: [
      {
        path: `src/policies/${n.kebab}.ts`,
        contents: `import { definePolicy, guest } from '@trowelkit/policies';
import type { AuthUser } from 'void/auth';

// Replace with your own type, e.g. \`import type { ${n.pascal} } from '@schema'\`.
type ${n.pascal} = { authorId: string };

// Each ability gets the signed-in user first. Guests are denied with a 401
// before an ability runs, unless it is wrapped in guest().
export default definePolicy({
  view: guest((_user: AuthUser | null, _${n.camel}: ${n.pascal}) => true),
  create: (_user: AuthUser) => true,
  update: (user: AuthUser, ${n.camel}: ${n.pascal}) => ${n.camel}.authorId === user.id,
  delete: (user: AuthUser, ${n.camel}: ${n.pascal}) => ${n.camel}.authorId === user.id,
});
`,
      },
    ],
    packages: ['@trowelkit/policies'],
    next: [
      `Register it in src/gate.ts: import ${n.camel} from './policies/${n.kebab}', then add ${n.camel} to policies.`,
      `Check abilities with gate.authorize('${n.camel}.update', ${n.camel}).`,
    ],
  };
}

export function event(name: string): Generation {
  const n = namesOf(name);
  return {
    files: [
      {
        path: `src/events/${n.kebab}.ts`,
        contents: `import { defineEvent } from '@trowelkit/events';

// The payload listeners receive. Queued listeners get it through a queue, so keep it serializable.
// The name identifies the event in queued messages: keep it once deployed.
export const ${n.pascal} = defineEvent<{ id: number }>('${n.dotted}');
`,
      },
    ],
    packages: ['@trowelkit/events'],
    next: [
      `Dispatch it: await events.dispatch(${n.pascal}, { id }), with events from src/events.`,
      `Add a listener: trowel gen listener <name> --event ${n.kebab}`,
    ],
  };
}

export function listener(name: string, options: { event: string; queued: boolean }): Generation {
  const n = namesOf(name);
  const e = namesOf(options.event);
  return {
    files: [
      {
        path: `src/listeners/${n.kebab}.ts`,
        contents: `import type { PayloadOf } from '@trowelkit/events';
import type { ${e.pascal} } from '../events/${e.kebab}';

export async function ${n.camel}(payload: PayloadOf<typeof ${e.pascal}>) {
  // Runs ${options.queued ? 'from the events queue, after the dispatching request has returned' : 'during events.dispatch'}.
  void payload;
}
`,
      },
    ],
    packages: ['@trowelkit/events'],
    next: [
      `Register it in src/events/index.ts: import { ${n.camel} } from '../listeners/${n.kebab}' and import { ${e.pascal} } from './${e.kebab}', then`,
      `  events.on(${e.pascal}, ${n.camel}${options.queued ? ', { queued: true }' : ''});`,
    ],
  };
}

export function notification(name: string): Generation {
  const n = namesOf(name);
  const constant = n.pascal.endsWith('Notification') ? n.pascal : `${n.pascal}Notification`;
  return {
    files: [
      {
        path: `src/notifications/${n.kebab}.ts`,
        contents: `import { defineNotification } from '@trowelkit/notifications';

// Who it goes to: mail uses email and name, the database channel uses id. A signed-in user fits.
type Recipient = { id: string; name: string; email: string };

// One builder per channel. The name identifies stored and queued notifications: keep it once deployed.
export const ${constant} = defineNotification('${n.dotted}', {
  mail: (user: Recipient, data: { id: number }) => ({
    subject: '${n.words[0]!.toUpperCase()}${n.words.slice(1)}',
    text: \`Hi \${user.name}, ...\`,
  }),
  database: (_user, data) => ({ id: data.id }),
});
`,
      },
    ],
    packages: ['@trowelkit/notifications'],
    next: [`Send it: await notifier.send(user, ${constant}, { id }), with notifier from src/notifications.`],
  };
}

export const FEATURES = ['policies', 'events', 'notifications', 'rate-limit'] as const;
export type Feature = (typeof FEATURES)[number];

export function feature(name: Feature): Generation {
  switch (name) {
    case 'policies':
      return {
        files: [
          {
            path: 'src/gate.ts',
            contents: `import { defineGate } from '@trowelkit/policies/void';

// Abilities run against the signed-in user of the current request.
// Generate a policy with \`trowel gen policy <name>\` and add it to \`policies\`.
export const gate = defineGate({
  policies: {},
});
`,
          },
        ],
        packages: ['@trowelkit/policies'],
        next: ['Generate a policy: trowel gen policy <name>'],
      };
    case 'events':
      return {
        files: [
          {
            path: 'src/events/index.ts',
            contents: `import { createEventBus } from '@trowelkit/events';
import { queues } from 'void/queues';

export const events = createEventBus({
  // Queued listeners are sent here and run from queues/events.ts.
  queue: (message) => queues.events.send(message),
});

// Register listeners here, e.g. events.on(OrderShipped, sendTrackingEmail, { queued: true }).
`,
          },
          {
            path: 'queues/events.ts',
            contents: `import type { QueuedEventMessage } from '@trowelkit/events';
import { defineQueue } from 'void';
import { events } from '../src/events';

export default defineQueue<QueuedEventMessage>(events.consume);
`,
          },
        ],
        packages: ['@trowelkit/events'],
        next: ['Generate an event: trowel gen event <name>'],
      };
    case 'notifications':
      return {
        files: [
          {
            path: 'src/notifications/index.ts',
            contents: `/// <reference types="vite/client" />
import { notifications } from '@schema';
import { createNotifier, databaseChannel, mailChannel } from '@trowelkit/notifications/void';
import { queues } from 'void/queues';

export const inbox = databaseChannel({ table: notifications });

export const notifier = createNotifier({
  channels: {
    // In development mail lands in Void's local inbox, so any sender works.
    // Deployed on a Void platform, Void fills in your project's sender.
    mail: mailChannel(import.meta.env.DEV ? { from: 'App <app@example.com>' } : {}),
    database: inbox,
  },
  // Deliveries run from queues/notifications.ts, and each one is retried on its own.
  queue: (message) => queues.notifications.send(message),
});
`,
          },
          {
            path: 'queues/notifications.ts',
            contents: `import type { QueuedNotificationMessage } from '@trowelkit/notifications';
import { defineQueue } from 'void';
import { notifier } from '../src/notifications';

export default defineQueue<QueuedNotificationMessage>(notifier.consume);
`,
          },
        ],
        additions: [
          {
            path: 'db/schema.ts',
            unless: 'notificationsTable(',
            prepend: "import { notificationsTable } from '@trowelkit/notifications/void';",
            append: '// The database channel stores in-app notifications here.\nexport const notifications = notificationsTable();',
          },
        ],
        packages: ['@trowelkit/notifications'],
        next: [
          'Turn on email in void.config.ts with inference: { bindings: { email: true } }, unless your app imports void/email itself.',
          'Create the table: void db generate (or void db push while prototyping).',
          'Generate a notification: trowel gen notification <name>',
        ],
      };
    case 'rate-limit':
      return {
        files: [
          {
            path: 'durable-objects/rate-limiter.ts',
            contents: `import { rateLimitState } from '@trowelkit/rate-limit/void';
import { defineDurableState } from 'void/durable';

// One object per rate limit key, holding a fixed-window counter that an alarm clears.
export const RateLimiter = defineDurableState(rateLimitState);

export default RateLimiter;
`,
          },
          {
            path: 'src/rate-limit.ts',
            contents: `import { createRateLimiter, durableStore } from '@trowelkit/rate-limit/void';
import { RateLimiter } from '../durable-objects/rate-limiter';

// Sixty requests per client per minute. Create one limiter per kind of request.
export const apiLimiter = createRateLimiter({
  name: 'api',
  limit: 60,
  window: 60,
  store: durableStore(RateLimiter),
});
`,
          },
        ],
        packages: ['@trowelkit/rate-limit'],
        next: [
          'Limit a route: defineHandler(apiLimiter.middleware(), handler), with apiLimiter from src/rate-limit.',
          'Commit void.lock.json after the next void dev or deploy records the Durable Object.',
        ],
      };
  }
}
