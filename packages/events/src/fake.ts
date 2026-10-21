import type { EventDefinition } from './event.ts';

export interface FakeOptions {
  /** Fake only these events; others keep running their listeners. Defaults to all events. */
  only?: readonly EventDefinition<any>[];
}

/** Records dispatched events and asserts on them. Assertions throw an `Error` when they fail. */
export interface EventFake {
  /** Payloads dispatched for an event, in order. */
  dispatched<P>(event: EventDefinition<P>): P[];
  assertDispatched<P>(event: EventDefinition<P>, predicate?: (payload: P) => boolean): void;
  assertDispatchedTimes<P>(event: EventDefinition<P>, times: number): void;
  assertNotDispatched<P>(event: EventDefinition<P>, predicate?: (payload: P) => boolean): void;
  assertNothingDispatched(): void;
  /** Stops faking; later dispatches run listeners again. */
  restore(): void;
}

export function createFake(options: FakeOptions = {}, onRestore: () => void) {
  const only = options.only ? new Set(options.only.map((e) => e.name)) : undefined;
  const records: { event: string; payload: unknown }[] = [];

  const payloads = <P>(event: EventDefinition<P>) =>
    records.filter((r) => r.event === event.name).map((r) => r.payload as P);

  const fake: EventFake & {
    intercepts(event: EventDefinition<any>): boolean;
    record(event: EventDefinition<any>, payload: unknown): void;
  } = {
    intercepts: (event) => !only || only.has(event.name),
    record: (event, payload) => void records.push({ event: event.name, payload }),
    dispatched: payloads,
    assertDispatched(event, predicate) {
      const matches = payloads(event).filter((p) => !predicate || predicate(p));
      if (matches.length === 0) {
        throw new Error(
          predicate
            ? `Expected "${event.name}" to be dispatched with a matching payload, but none of ${payloads(event).length} matched.`
            : `Expected "${event.name}" to be dispatched, but it wasn't.`,
        );
      }
    },
    assertDispatchedTimes(event, times) {
      const count = payloads(event).length;
      if (count !== times) {
        throw new Error(`Expected "${event.name}" to be dispatched ${times} time(s), but it was dispatched ${count}.`);
      }
    },
    assertNotDispatched(event, predicate) {
      const matches = payloads(event).filter((p) => !predicate || predicate(p));
      if (matches.length > 0) {
        throw new Error(`Expected "${event.name}" not to be dispatched, but it was dispatched ${matches.length} time(s).`);
      }
    },
    assertNothingDispatched() {
      if (records.length > 0) {
        const names = [...new Set(records.map((r) => r.event))].join(', ');
        throw new Error(`Expected no events to be dispatched, but these were: ${names}.`);
      }
    },
    restore: onRestore,
  };
  return fake;
}
