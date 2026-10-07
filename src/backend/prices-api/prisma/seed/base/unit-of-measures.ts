import { UNIT_OF_MEASURES } from '../data';

/**
 * Base seed: the global unit-of-measure catalog.
 *
 * The catalog is global — one row serves every company — and it is
 * administrable by a global administrator, which is what fixes the contract of
 * this seed: it inserts the codes that are **missing** and never touches a row
 * that already exists.
 *
 * The previous upsert refreshed `name`, `symbol`, `dimension`, `decimals` and
 * forced `status: 'active'` on every run. That silently reverted an
 * administrator's correction, deactivation or soft deletion at the next
 * deployment and, for `decimals`, could invalidate values already captured
 * under the edited unit.
 *
 * A soft-deleted row still owns its code (the unique index covers it), so
 * "exists but deleted" counts as existing and stays untouched. Recovery is
 * deliberate rather than implicit: recreating the code through
 * `POST /units-of-measure` restores that same row and its id.
 *
 * Returns the number of codes that were missing, i.e. the rows it created.
 */
export async function seedUnitOfMeasures(prisma: any): Promise<number> {
  let inserted = 0;

  for (const unit of UNIT_OF_MEASURES) {
    const existing = await prisma.unitOfMeasure.findUnique({ where: { code: unit.code } });
    if (existing) continue;

    await prisma.unitOfMeasure.create({
      data: {
        code: unit.code,
        name: unit.name,
        symbol: unit.symbol,
        dimension: unit.dimension,
        decimals: unit.decimals,
        status: 'active',
        createdByType: 'system',
        updatedByType: 'system'
      }
    });

    inserted += 1;
  }

  return inserted;
}
