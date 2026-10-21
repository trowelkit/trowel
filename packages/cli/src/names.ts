export interface Names {
  /** `order-shipped`: file names. */
  readonly kebab: string;
  /** `orderShipped`: functions and object keys. */
  readonly camel: string;
  /** `OrderShipped`: constants and types. */
  readonly pascal: string;
  /** `order.shipped`: event and notification names. */
  readonly dotted: string;
  /** `order shipped`: prose. */
  readonly words: string;
}

/**
 * Splits a name written in any common style (`OrderShipped`, `order-shipped`,
 * `order_shipped`) into its forms. Throws for names without a leading letter.
 */
export function namesOf(input: string): Names {
  const words = input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
  if (words.length === 0 || !/^[a-z]/.test(words[0]!)) {
    throw new Error(`"${input}" isn't a usable name. Start with a letter, e.g. "order-shipped".`);
  }
  const upper = (word: string) => word[0]!.toUpperCase() + word.slice(1);
  return {
    kebab: words.join('-'),
    camel: words[0] + words.slice(1).map(upper).join(''),
    pascal: words.map(upper).join(''),
    dotted: words.join('.'),
    words: words.join(' '),
  };
}
