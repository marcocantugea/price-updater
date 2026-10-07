import { Prisma } from '@prisma/client';

/**
 * Converts a Prisma result into a JSON-safe value: Decimal -> number,
 * Date -> ISO string. Keeps responses stable for the Angular client.
 */
export function toPlain<T = unknown>(value: unknown): T {
  if (value === null || value === undefined) return value as T;

  if (Prisma.Decimal.isDecimal(value)) {
    return (value as Prisma.Decimal).toNumber() as unknown as T;
  }

  if (value instanceof Date) {
    return value.toISOString() as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toPlain(item)) as unknown as T;
  }

  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(source)) {
      output[key] = toPlain(item);
    }
    return output as T;
  }

  return value as T;
}
