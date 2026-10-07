import { CURRENCIES } from '../data';

/** Base seed: ISO currencies. Idempotent (upsert by unique `code`). */
export async function seedCurrencies(prisma: any): Promise<number> {
  let count = 0;

  for (const currency of CURRENCIES) {
    await prisma.currency.upsert({
      where: { code: currency.code },
      update: {
        name: currency.name,
        symbol: currency.symbol,
        decimals: currency.decimals,
        status: 'active'
      },
      create: {
        code: currency.code,
        name: currency.name,
        symbol: currency.symbol,
        decimals: currency.decimals,
        status: 'active',
        createdByType: 'system',
        updatedByType: 'system'
      }
    });
    count += 1;
  }

  return count;
}
