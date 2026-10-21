import { describe, expect, it, vi } from 'vitest';
import { createNotifier, defineNotification, DeliveryError, webhookChannel, type QueuedNotificationMessage } from '../src/index.ts';
import { batchOf } from './helpers.ts';

interface Team {
  id: string;
  webhook?: string;
}

const Deployed = defineNotification('deployed', {
  chat: (_team: Team, deploy: { version: string }) => ({ text: `Deployed ${deploy.version}` }),
});

function fetchAnswering(status: number) {
  return vi.fn(async (_url: string, _init: RequestInit) => new Response(null, { status }));
}

describe('webhookChannel', () => {
  it("posts the builder's message as JSON", async () => {
    const fetch = fetchAnswering(200);
    const notifier = createNotifier({
      channels: { chat: webhookChannel<Team>({ url: (team) => team.webhook, headers: { authorization: 'Bearer t' }, fetch }) },
    });
    await notifier.sendNow({ id: 'core', webhook: 'https://chat.example.com/hooks/secret' }, Deployed, { version: '1.2.0' });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://chat.example.com/hooks/secret');
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
      body: '{"text":"Deployed 1.2.0"}',
    });
  });

  it('retries rate limits and server errors, but not other client errors', async () => {
    const outcome = async (status: number) => {
      const channel = webhookChannel({ url: 'https://chat.example.com/hooks/secret', fetch: fetchAnswering(status) });
      const error = await Promise.resolve(
        channel.send({ id: 'n1', notification: 'deployed', channel: 'chat', recipient: {}, message: { text: 'hi' } }),
      ).catch((e: unknown) => e);
      return error as DeliveryError;
    };

    expect((await outcome(429)).retryable).toBe(true);
    expect((await outcome(503)).retryable).toBe(true);
    expect((await outcome(404)).retryable).toBe(false);
    const error = await outcome(400);
    expect(error.message).toBe('The chat webhook for "deployed" answered 400.');
    expect(error.message).not.toContain('secret');
  });

  it("doesn't retry a recipient without a webhook", async () => {
    const sent: QueuedNotificationMessage[] = [];
    const fetch = fetchAnswering(200);
    const notifier = createNotifier({
      channels: { chat: webhookChannel<Team>({ url: (team) => team.webhook, fetch }) },
      queue: (m) => void sent.push(m),
      onQueuedError: () => {},
    });
    await notifier.send({ id: 'core' }, Deployed, { version: '1.2.0' });
    const { batch, decisions } = batchOf(sent);
    await notifier.consume(batch);

    expect(decisions).toEqual(['ack 0']);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reads the URL and headers when sending', async () => {
    const fetch = fetchAnswering(200);
    let token = 'first';
    const channel = webhookChannel({ url: async () => 'https://chat.example.com/hook', headers: () => ({ authorization: token }), fetch });
    token = 'second';
    await channel.send({ id: 'n1', notification: 'x', channel: 'chat', recipient: {}, message: {} });
    expect(fetch.mock.calls[0]![1].headers).toMatchObject({ authorization: 'second' });
  });
});
