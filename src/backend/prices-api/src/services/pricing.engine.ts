/**
 * Pure pricing / discount engine (phase 1).
 *
 * Phase 1 rule: EXACTLY ONE discount is applied — discounts never stack or
 * accumulate. Precedence is fixed and deterministic:
 *
 *   1. product-scoped discount
 *   2. price-list-scoped discount
 *   3. marketplace-scoped discount
 *   4. base price (no discount)
 *
 * Within the same scope, the discount is chosen by `priority ASC`, then
 * `createdAt ASC`, then `id ASC` for a fully deterministic tie-break.
 */

import { isBusinessDateWithinRange } from '../common/utils/business-date';

export type DiscountScopeName = 'product' | 'price_list' | 'marketplace';

export const DISCOUNT_SCOPE_PRECEDENCE: readonly DiscountScopeName[] = [
  'product',
  'price_list',
  'marketplace'
];

export interface DiscountLike {
  id: string;
  name: string;
  type: 'percentage' | 'fixed';
  value: number | string | { toString(): string };
  appliesTo: string;
  productId?: string | null;
  priceListId?: string | null;
  marketplaceId?: string | null;
  startDate: Date;
  endDate?: Date | null;
  priority: number;
  status: string;
  createdAt: Date;
}

export interface PricingContext {
  productId: string;
  priceListId: string;
  marketplaceId: string;
  basePrice: number;
  currencyDecimals: number;
}

export interface AppliedDiscount {
  id: string;
  name: string;
  type: 'percentage' | 'fixed';
  value: number;
  appliesTo: DiscountScopeName;
  priority: number;
}

export interface PricingResult {
  basePrice: number;
  finalPrice: number;
  discountAmount: number;
  scope: DiscountScopeName | 'base';
  appliedDiscount: AppliedDiscount | null;
}

export const DEFAULT_PRICE_FLOOR = 0;

function numeric(value: DiscountLike['value']): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return Number(value.toString());
}

/** Rounds half-up to the currency's number of decimals. */
export function roundTo(value: number, decimals: number): number {
  const safeDecimals = Number.isInteger(decimals) && decimals >= 0 ? decimals : 2;
  const factor = Math.pow(10, safeDecimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function isWithinValidity(
  discount: Pick<DiscountLike, 'startDate' | 'endDate'>,
  now: Date,
  timeZone = 'UTC'
): boolean {
  return isBusinessDateWithinRange(discount.startDate, discount.endDate, now, timeZone);
}

export function isDiscountApplicable(discount: DiscountLike, now: Date, timeZone = 'UTC'): boolean {
  return discount.status === 'active' && isWithinValidity(discount, now, timeZone);
}

export function matchesScope(
  discount: DiscountLike,
  scope: DiscountScopeName,
  context: PricingContext
): boolean {
  if (discount.appliesTo !== scope) return false;
  switch (scope) {
    case 'product':
      return !!discount.productId && discount.productId === context.productId;
    case 'price_list':
      return !!discount.priceListId && discount.priceListId === context.priceListId;
    case 'marketplace':
      return !!discount.marketplaceId && discount.marketplaceId === context.marketplaceId;
    default:
      return false;
  }
}

/** Deterministic ordering inside one scope level. */
export function sortByPriority(candidates: DiscountLike[]): DiscountLike[] {
  return [...candidates].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const createdDiff = a.createdAt.getTime() - b.createdAt.getTime();
    if (createdDiff !== 0) return createdDiff;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Selects the single discount that applies, or null when only the base price
 * should be used.
 */
export function selectApplicableDiscount(
  discounts: DiscountLike[],
  context: PricingContext,
  now: Date = new Date(),
  timeZone = 'UTC'
): { discount: DiscountLike; scope: DiscountScopeName } | null {
  const applicable = discounts.filter((discount) => isDiscountApplicable(discount, now, timeZone));

  for (const scope of DISCOUNT_SCOPE_PRECEDENCE) {
    const candidates = applicable.filter((discount) => matchesScope(discount, scope, context));
    if (candidates.length > 0) {
      const [chosen] = sortByPriority(candidates);
      return { discount: chosen, scope };
    }
  }

  return null;
}

export function applyDiscountToPrice(
  basePrice: number,
  discount: Pick<DiscountLike, 'type' | 'value'>,
  decimals: number,
  floor: number = DEFAULT_PRICE_FLOOR
): number {
  const value = numeric(discount.value);
  const raw = discount.type === 'percentage'
    ? basePrice * (1 - value / 100)
    : basePrice - value;

  return Math.max(roundTo(raw, decimals), floor);
}

/** Full calculation: base price -> final price using at most one discount. */
export function calculateFinalPrice(
  context: PricingContext,
  discounts: DiscountLike[],
  options: { now?: Date; floor?: number; timeZone?: string } = {}
): PricingResult {
  const now = options.now ?? new Date();
  const floor = options.floor ?? DEFAULT_PRICE_FLOOR;
  const selection = selectApplicableDiscount(discounts, context, now, options.timeZone ?? 'UTC');

  if (!selection) {
    return {
      basePrice: roundTo(context.basePrice, context.currencyDecimals),
      finalPrice: roundTo(context.basePrice, context.currencyDecimals),
      discountAmount: 0,
      scope: 'base',
      appliedDiscount: null
    };
  }

  const finalPrice = applyDiscountToPrice(context.basePrice, selection.discount, context.currencyDecimals, floor);
  const basePrice = roundTo(context.basePrice, context.currencyDecimals);

  return {
    basePrice,
    finalPrice,
    discountAmount: roundTo(basePrice - finalPrice, context.currencyDecimals),
    scope: selection.scope,
    appliedDiscount: {
      id: selection.discount.id,
      name: selection.discount.name,
      type: selection.discount.type,
      value: numeric(selection.discount.value),
      appliesTo: selection.scope,
      priority: selection.discount.priority
    }
  };
}
