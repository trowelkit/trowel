import { describe, expect, it } from 'vitest';
import { testBatch } from '../src/index.ts';

describe('testBatch', () => {
  it('records the first decision for each message', () => {
    const { batch, decisions } = testBatch(['a', 'b', 'c'], { queue: 'jobs', attempts: [1, 2] });

    expect(batch.queue).toBe('jobs');
    expect(batch.messages.map((m) => [m.id, m.body, m.attempts])).toEqual([
      ['1', 'a', 1],
      ['2', 'b', 2],
      ['3', 'c', 1],
    ]);
    batch.messages[0]!.ack();
    batch.messages[0]!.retry();
    batch.messages[1]!.retry({ delaySeconds: 30 });
    expect(decisions).toEqual([{ type: 'ack' }, { type: 'retry', delaySeconds: 30 }, undefined]);
  });

  it('decides the rest with ackAll and retryAll', () => {
    const first = testBatch([1, 2]);
    first.batch.messages[1]!.retry();
    first.batch.ackAll();
    expect(first.decisions).toEqual([{ type: 'ack' }, { type: 'retry' }]);

    const second = testBatch([1]);
    second.batch.retryAll({ delaySeconds: 5 });
    expect(second.decisions).toEqual([{ type: 'retry', delaySeconds: 5 }]);
  });
});
