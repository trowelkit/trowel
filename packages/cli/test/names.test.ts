import { describe, expect, it } from 'vitest';
import { namesOf } from '../src/names.ts';

describe('namesOf', () => {
  it('reads the common styles', () => {
    const expected = { kebab: 'order-shipped', camel: 'orderShipped', pascal: 'OrderShipped', dotted: 'order.shipped', words: 'order shipped' };
    expect(namesOf('OrderShipped')).toEqual(expected);
    expect(namesOf('order-shipped')).toEqual(expected);
    expect(namesOf('order_shipped')).toEqual(expected);
    expect(namesOf('orderShipped')).toEqual(expected);
  });

  it('handles acronyms and digits', () => {
    expect(namesOf('HTMLReport').kebab).toBe('html-report');
    expect(namesOf('invoice2-paid').camel).toBe('invoice2Paid');
  });

  it('rejects names without a leading letter', () => {
    expect(() => namesOf('---')).toThrow("isn't a usable name");
    expect(() => namesOf('2fa-enabled')).toThrow("isn't a usable name");
  });
});
