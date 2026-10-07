import {
  DISCOUNT_SCOPE_PRECEDENCE,
  applyDiscountToPrice,
  calculateFinalPrice,
  isDiscountApplicable,
  isWithinValidity,
  matchesScope,
  roundTo,
  selectApplicableDiscount,
  sortByPriority,
  type DiscountLike,
  type PricingContext
} from '../../src/services/pricing.engine';

const NOW = new Date('2024-06-15T12:00:00.000Z');

function discount(overrides: Partial<DiscountLike> = {}): DiscountLike {
  return {
    id: 'discount-1',
    name: 'Discount',
    type: 'percentage',
    value: 10,
    appliesTo: 'product',
    productId: 'product-1',
    priceListId: null,
    marketplaceId: null,
    startDate: new Date('2024-01-01T00:00:00.000Z'),
    endDate: null,
    priority: 100,
    status: 'active',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides
  };
}

function context(overrides: Partial<PricingContext> = {}): PricingContext {
  return {
    productId: 'product-1',
    priceListId: 'list-1',
    marketplaceId: 'marketplace-1',
    basePrice: 100,
    currencyDecimals: 2,
    ...overrides
  };
}

describe('pricing engine — rounding', () => {
  it('rounds half-up to the given number of decimals', () => {
    expect(roundTo(10.005, 2)).toBe(10.01);
    expect(roundTo(10.004, 2)).toBe(10);
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(123.456, 2)).toBe(123.46);
  });

  it('falls back to 2 decimals when the given value is invalid', () => {
    expect(roundTo(1.2345, -1)).toBe(1.23);
    expect(roundTo(1.2345, 2.5 as unknown as number)).toBe(1.23);
  });
});

describe('pricing engine — validity and scope matching', () => {
  it('accepts a discount inside its validity window', () => {
    expect(isWithinValidity(discount(), NOW)).toBe(true);
  });

  it('rejects a discount that has not started yet', () => {
    expect(isWithinValidity(discount({ startDate: new Date('2024-07-01') }), NOW)).toBe(false);
  });

  it('rejects an expired discount', () => {
    expect(isWithinValidity(discount({ endDate: new Date('2024-06-01') }), NOW)).toBe(false);
  });

  it('keeps a same-day discount active through the tenant local end of day', () => {
    const sameDay = discount({
      startDate: new Date('2026-09-19T00:00:00.000Z'),
      endDate: new Date('2026-09-19T00:00:00.000Z')
    });

    expect(isWithinValidity(sameDay, new Date('2026-09-20T05:59:59.999Z'), 'America/Mexico_City')).toBe(true);
    expect(isWithinValidity(sameDay, new Date('2026-09-20T06:00:00.000Z'), 'America/Mexico_City')).toBe(false);
  });

  it('requires an active status', () => {
    expect(isDiscountApplicable(discount({ status: 'inactive' }), NOW)).toBe(false);
    expect(isDiscountApplicable(discount(), NOW)).toBe(true);
  });

  it('matches only the scope the discount belongs to', () => {
    const productDiscount = discount({ appliesTo: 'product' });
    expect(matchesScope(productDiscount, 'product', context())).toBe(true);
    expect(matchesScope(productDiscount, 'price_list', context())).toBe(false);

    const listDiscount = discount({ appliesTo: 'price_list', productId: null, priceListId: 'list-1' });
    expect(matchesScope(listDiscount, 'price_list', context())).toBe(true);
    expect(matchesScope(listDiscount, 'product', context())).toBe(false);

    const marketplaceDiscount = discount({
      appliesTo: 'marketplace',
      productId: null,
      marketplaceId: 'marketplace-1'
    });
    expect(matchesScope(marketplaceDiscount, 'marketplace', context())).toBe(true);
    expect(matchesScope(marketplaceDiscount, 'price_list', context())).toBe(false);
  });

  it('does not match when the scoped id differs', () => {
    expect(matchesScope(discount({ productId: 'other' }), 'product', context())).toBe(false);
  });

  it('does not match when the scoped id is missing', () => {
    expect(matchesScope(discount({ productId: null }), 'product', context())).toBe(false);
  });
});

describe('pricing engine — deterministic ordering', () => {
  it('orders by priority, then createdAt, then id', () => {
    const sorted = sortByPriority([
      discount({ id: 'b', priority: 100, createdAt: new Date('2024-02-01') }),
      discount({ id: 'a', priority: 100, createdAt: new Date('2024-01-01') }),
      discount({ id: 'c', priority: 1, createdAt: new Date('2024-05-01') })
    ]);

    expect(sorted.map((item) => item.id)).toEqual(['c', 'a', 'b']);
  });

  it('breaks ties by id when priority and createdAt are equal', () => {
    const sorted = sortByPriority([
      discount({ id: 'zeta' }),
      discount({ id: 'alpha' })
    ]);
    expect(sorted.map((item) => item.id)).toEqual(['alpha', 'zeta']);
  });
});

describe('pricing engine — discount precedence (non-stacking)', () => {
  it('applies the product discount when all three scopes exist', () => {
    const result = calculateFinalPrice(
      context(),
      [
        discount({ id: 'marketplace', appliesTo: 'marketplace', productId: null, marketplaceId: 'marketplace-1', value: 50 }),
        discount({ id: 'list', appliesTo: 'price_list', productId: null, priceListId: 'list-1', value: 30 }),
        discount({ id: 'product', appliesTo: 'product', value: 10 })
      ],
      { now: NOW }
    );

    expect(result.scope).toBe('product');
    expect(result.appliedDiscount?.id).toBe('product');
    expect(result.finalPrice).toBe(90);
    expect(result.discountAmount).toBe(10);
  });

  it('falls back to the price-list discount when no product discount applies', () => {
    const result = calculateFinalPrice(
      context(),
      [
        discount({ id: 'marketplace', appliesTo: 'marketplace', productId: null, marketplaceId: 'marketplace-1', value: 50 }),
        discount({ id: 'list', appliesTo: 'price_list', productId: null, priceListId: 'list-1', value: 30 })
      ],
      { now: NOW }
    );

    expect(result.scope).toBe('price_list');
    expect(result.finalPrice).toBe(70);
  });

  it('falls back to the marketplace discount when no product/list discount applies', () => {
    const result = calculateFinalPrice(
      context(),
      [discount({ id: 'marketplace', appliesTo: 'marketplace', productId: null, marketplaceId: 'marketplace-1', type: 'fixed', value: 25 })],
      { now: NOW }
    );

    expect(result.scope).toBe('marketplace');
    expect(result.finalPrice).toBe(75);
  });

  it('uses the base price when no discount applies', () => {
    const result = calculateFinalPrice(context(), [], { now: NOW });

    expect(result.scope).toBe('base');
    expect(result.appliedDiscount).toBeNull();
    expect(result.finalPrice).toBe(100);
    expect(result.discountAmount).toBe(0);
  });

  it('exposes the documented precedence order', () => {
    expect(DISCOUNT_SCOPE_PRECEDENCE).toEqual(['product', 'price_list', 'marketplace']);
  });

  it('never accumulates: only one discount affects the price', () => {
    const result = calculateFinalPrice(
      context(),
      [
        discount({ id: 'p1', value: 10 }),
        discount({ id: 'p2', value: 10 }),
        discount({ id: 'l1', appliesTo: 'price_list', productId: null, priceListId: 'list-1', value: 10 })
      ],
      { now: NOW }
    );

    // 100 - 10% = 90 (not 100 - 20% and not 90 - 10%)
    expect(result.finalPrice).toBe(90);
  });

  it('applies the highest-precedence discount among several in the same scope', () => {
    const result = calculateFinalPrice(
      context(),
      [
        discount({ id: 'low', priority: 500, value: 5 }),
        discount({ id: 'high', priority: 1, value: 20 })
      ],
      { now: NOW }
    );

    expect(result.appliedDiscount?.id).toBe('high');
    expect(result.finalPrice).toBe(80);
  });

  it('ignores inactive, future and expired discounts', () => {
    const result = calculateFinalPrice(
      context(),
      [
        discount({ id: 'inactive', status: 'inactive' }),
        discount({ id: 'future', startDate: new Date('2099-01-01') }),
        discount({ id: 'expired', endDate: new Date('2000-01-01') })
      ],
      { now: NOW }
    );

    expect(result.scope).toBe('base');
    expect(result.finalPrice).toBe(100);
  });

  it('ignores a discount scoped to a different product', () => {
    const selection = selectApplicableDiscount([discount({ productId: 'other' })], context(), NOW);
    expect(selection).toBeNull();
  });
});

describe('pricing engine — monetary rules', () => {
  it('computes a percentage discount', () => {
    expect(applyDiscountToPrice(200, { type: 'percentage', value: 15 }, 2)).toBe(170);
  });

  it('computes a fixed-amount discount', () => {
    expect(applyDiscountToPrice(200, { type: 'fixed', value: 35.5 }, 2)).toBe(164.5);
  });

  it('never goes below the floor', () => {
    expect(applyDiscountToPrice(50, { type: 'fixed', value: 80 }, 2)).toBe(0);
    expect(applyDiscountToPrice(50, { type: 'fixed', value: 80 }, 2, 10)).toBe(10);
  });

  it('rounds the result using the currency decimals', () => {
    const result = calculateFinalPrice(
      context({ basePrice: 99.99, currencyDecimals: 2 }),
      [discount({ type: 'percentage', value: 33.333 })],
      { now: NOW }
    );
    expect(result.finalPrice).toBe(66.66);
  });

  it('honours a currency with zero decimals', () => {
    const result = calculateFinalPrice(
      context({ basePrice: 1000, currencyDecimals: 0 }),
      [discount({ type: 'percentage', value: 12.5 })],
      { now: NOW }
    );
    expect(result.finalPrice).toBe(875);
  });

  it('accepts a decimal-like value object (Prisma Decimal shape)', () => {
    const result = calculateFinalPrice(
      context(),
      [discount({ value: { toString: () => '25' } as any })],
      { now: NOW }
    );
    expect(result.finalPrice).toBe(75);
  });

  it('reports the base price, final price and discount amount', () => {
    const result = calculateFinalPrice(context(), [discount({ value: 20 })], { now: NOW });
    expect(result).toMatchObject({ basePrice: 100, finalPrice: 80, discountAmount: 20, scope: 'product' });
  });
});
