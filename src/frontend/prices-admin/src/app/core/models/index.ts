/**
 * Shared domain types for the Price Updater admin frontend.
 * These mirror the payloads returned by the Express API.
 */

import type { SupportedLocale } from '../i18n/supported-locales';

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export interface ListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  [key: string]: unknown;
}

/**
 * Machine-readable field detail from the API error envelope.
 *
 * `code`/`params` let the UI render a localized message instead of the English
 * `message` fallback; `field` is retained so Reactive Forms can bind the error
 * to the offending control.
 */
export interface ApiErrorDetail {
  field?: string;
  code?: string;
  message: string;
  params?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  details?: ApiErrorDetail[];
  traceId?: string;
  timestamp?: string;
}

// --- Auth ------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleSlug: string;
  tenantId: string | null;
  isGlobalAdmin: boolean;
  permissions: string[];
  /** Per-user UI language; it is presentation state, not authorization data. */
  preferredLocale: SupportedLocale;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

// --- Catalogs --------------------------------------------------------------

export interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  status: string;
}

export interface Tenant {
  id: string;
  commercialName: string;
  legalName: string;
  slug: string;
  status: string;
  defaultCurrency: string;
  timeZone: string;
  notes?: string | null;
  currency?: Currency;
}

export interface Permission {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
}

export interface Role {
  id: string;
  tenantId: string | null;
  name: string;
  slug: string;
  description?: string | null;
  isSystem: boolean;
  status: string;
  rolePermissions?: { permission: Permission }[];
  _count?: { users: number };
}

export interface User {
  id: string;
  tenantId: string | null;
  name: string;
  email: string;
  roleId: string;
  status: string;
  preferredLocale?: SupportedLocale;
  lastLoginAt?: string | null;
  role?: Role;
  tenant?: Tenant;
}

export interface PriceListAccess {
  userId: string;
  priceListIds: string[];
  priceLists: PriceList[];
}

// --- Pricing ---------------------------------------------------------------

export interface Product {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  description?: string | null;
  basePrice: number;
  /**
   * Current cost of one complete product record, in `currencyCode`.
   *
   * `null` means the cost has not been captured and must never be read as 0;
   * 0 is a real, known cost. The API exposes no cost history and performs no
   * currency conversion.
   */
  cost: number | null;
  currencyCode: string;
  status: string;
  currency?: Currency;
}

export interface Marketplace {
  id: string;
  tenantId: string;
  name: string;
  code: 'amazon' | 'mercadolibre' | 'own_store';
  config?: Record<string, unknown> | null;
  status: string;
}

export interface PriceList {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  currencyCode?: string | null;
  status: string;
  currency?: Currency | null;
  priceListProducts?: { product: Product }[];
  priceListMarketplaces?: { marketplace: Marketplace }[];
}

export interface Price {
  id: string;
  tenantId: string;
  productId: string;
  priceListId: string;
  marketplaceId: string;
  basePrice: number;
  currencyCode: string;
  finalPrice: number;
  startDate: string;
  endDate?: string | null;
  status: string;
  notes?: string | null;
  product?: Product;
  priceList?: PriceList;
  marketplace?: Marketplace;
  currency?: Currency;
}

export interface PriceCalculation {
  basePrice: number;
  finalPrice: number;
  discountAmount: number;
  scope: 'product' | 'price_list' | 'marketplace' | 'base';
  appliedDiscount: {
    id: string;
    name: string;
    type: 'percentage' | 'fixed';
    value: number;
    appliesTo: string;
    priority: number;
  } | null;
}

export interface Discount {
  id: string;
  tenantId: string;
  name: string;
  type: 'percentage' | 'fixed';
  value: number;
  appliesTo: 'product' | 'price_list' | 'marketplace';
  productId?: string | null;
  priceListId?: string | null;
  marketplaceId?: string | null;
  startDate: string;
  endDate?: string | null;
  priority: number;
  status: string;
  description?: string | null;
  product?: Product;
  priceList?: PriceList;
  marketplace?: Marketplace;
}

export interface CatalogRow {
  product: { id: string; sku: string; name: string };
  priceList: { id: string; name: string };
  marketplace: { id: string; name: string; code: string };
  basePrice: number;
  discountAmount: number;
  finalPrice: number;
  scope: 'product' | 'price_list' | 'marketplace' | 'base';
  appliedDiscount: {
    id: string;
    name: string;
    type: 'percentage' | 'fixed';
    value: number;
    appliesTo: string;
    priority: number;
  } | null;
  currencyCode: string;
  calculatedAt: string;
}

export interface ExportRequest {
  id: string;
  priceListId: string;
  marketplaceId: string;
  format: 'csv' | 'json' | 'txt';
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'expired';
  fileName?: string | null;
  contentType?: string | null;
  byteSize?: number | null;
  errorMessage?: string | null;
  createdAt: string;
  completedAt?: string | null;
  expiresAt?: string | null;
}

export interface PriceHistoryEntry {
  id: string;
  tenantId: string;
  priceId: string;
  productId: string;
  oldBasePrice?: number | null;
  newBasePrice?: number | null;
  oldFinalPrice?: number | null;
  newFinalPrice?: number | null;
  changedByType: 'user' | 'api_key' | 'system';
  changedById?: string | null;
  reason: string;
  createdAt: string;
  product?: Product;
}

// --- API keys --------------------------------------------------------------

export interface ApiKey {
  id: string;
  tenantId: string;
  name: string;
  prefix: string;
  scopes: string[];
  status: 'active' | 'revoked';
  effectiveStatus: 'active' | 'revoked' | 'expired';
  expiresAt?: string | null;
  revokedAt?: string | null;
  lastUsedAt?: string | null;
  plaintextKey?: string;
}

// --- Dashboard -------------------------------------------------------------

export interface DashboardSummary {
  activeProducts: number;
  marketplaces: number;
  priceLists: number;
  activePrices: number;
  expiringWindowDays: number;
  expiringDiscounts: Discount[];
}

export interface MarketplaceChartPoint {
  marketplaceId: string;
  name: string;
  code: string | null;
  priceCount: number;
  averageFinalPrice: number;
}

// ---------------------------------------------------------------------------
// Product specifications
// ---------------------------------------------------------------------------

export type UnitDimension = 'count' | 'mass' | 'length';

/**
 * Global unit catalog, administered by global administrators only: a unit is
 * shared by every company, so a write there is visible to all of them.
 *
 * `code` is the value exchanged with the API and the key the UI translates into a
 * label; the UI never sends the surrogate `id`. Units are never converted
 * automatically, so a stored measurement keeps the unit it was captured in.
 */
export interface UnitOfMeasure {
  id: string;
  code: string;
  name: string;
  symbol: string;
  dimension: UnitDimension;
  /** Allowed decimal scale for values expressed in this unit. */
  decimals: number;
  status: string;
}

/**
 * A unit as a picker option.
 *
 * `historical` marks a unit that is listed only because the record already
 * stores its code: it is inactive or deleted in the global catalog, so it may be
 * kept but never chosen for a new assignment. The flag is presentation state and
 * deliberately not part of the API entity.
 */
export interface UnitOption extends UnitOfMeasure {
  historical?: boolean;
}

export interface Brand {
  id: string;
  tenantId: string;
  name: string;
  status: string;
}

export interface Supplier {
  id: string;
  name: string;
  status: string;
}

export type IdentifierType = 'ean_8' | 'ean_13' | 'upc_a' | 'upc_e';

/**
 * A captured measurement.
 *
 * The value and its unit are always present together — the API rejects one
 * without the other — and `null` in place of the whole measurement means "not
 * captured". It is never a stand-in for zero.
 */
export interface Measurement {
  value: number;
  unitCode: string;
}

export interface SpecificationMeasurements {
  weight: Measurement | null;
  length: Measurement | null;
  depth: Measurement | null;
}

/** The optional one-per-product specification, as returned by the API. */
export interface ProductSpecificationSummary {
  id: string;
  brandId: string | null;
  /**
   * Present even when the brand has been deactivated: deleting a brand must not
   * detach historical specifications, so the name still renders.
   */
  brandName: string | null;
  model: string | null;
  measurements: SpecificationMeasurements;
}

export interface ProductIdentifier {
  id: string;
  type: IdentifierType;
  /** Digits exactly as entered, check digit included. Leading zeroes matter. */
  value: string;
  /** GTIN-14 form the server uses for tenant-wide uniqueness. */
  normalizedValue: string;
}

export interface Presentation {
  id: string;
  name: string;
  quantity: number;
  unitCode: string;
  identifiers: ProductIdentifier[];
}

export interface AggregateSupplier {
  id: string;
  name: string | null;
}

/**
 * The whole aggregate, in the single shape all three verbs return.
 *
 * `specification` is `null` and both arrays are empty when a product has nothing
 * captured — an empty aggregate is a normal 200, not a 404.
 */
export interface ProductSpecificationAggregate {
  product: Pick<Product, 'id' | 'sku' | 'name'>;
  specification: ProductSpecificationSummary | null;
  presentations: Presentation[];
  suppliers: AggregateSupplier[];
}

export interface IdentifierPayload {
  /** Omitted creates a row; present must be an existing row of this product. */
  id?: string;
  type: IdentifierType;
  value: string;
}

export interface PresentationPayload {
  id?: string;
  name: string;
  quantity: number;
  unitCode: string;
  identifiers: IdentifierPayload[];
}

/**
 * Request body for the full-replacement `PUT`.
 *
 * Every top-level key is required — omitting one is **not** "leave it alone",
 * because the request replaces the whole aggregate. Clearing a single value
 * means sending `null`; removing every presentation or supplier means sending
 * `[]`.
 *
 * Identifier ids must be echoed back from the previous read. Omitting them
 * creates new rows while the previous ones are soft-deleted, and the server
 * never releases a barcode, so a second save without ids is a 409.
 */
export interface ProductSpecificationPayload {
  brandId: string | null;
  model: string | null;
  measurements: SpecificationMeasurements;
  presentations: PresentationPayload[];
  supplierIds: string[];
}
