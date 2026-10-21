declare const payloadType: unique symbol;

/** A named event. `P` is the payload type; it only exists at the type level. */
export interface EventDefinition<P = void> {
  readonly name: string;
  readonly [payloadType]?: P;
}

export type PayloadOf<E> = E extends EventDefinition<infer P> ? P : never;

/**
 * Declares an event and its payload type.
 *
 * ```ts
 * export const OrderShipped = defineEvent<{ orderId: number }>('order.shipped');
 * ```
 *
 * The name identifies the event in queued messages, so keep it stable once deployed.
 */
export function defineEvent<P = void>(name: string): EventDefinition<P> {
  if (!name) throw new Error('An event needs a name.');
  return Object.freeze({ name });
}
