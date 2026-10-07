/**
 * Canonical seed catalogs. Kept declarative so both the seeds and their unit
 * tests share a single source of truth.
 */

import type { IdentifierType } from '../../src/common/utils/product-identifier';

export interface CurrencySeed {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
}

export const CURRENCIES: CurrencySeed[] = [
  { code: 'MXN', name: 'Peso mexicano', symbol: '$', decimals: 2 },
  { code: 'USD', name: 'Dólar estadounidense', symbol: '$', decimals: 2 }
];

export type UnitDimension = 'count' | 'mass' | 'length';

export interface UnitOfMeasureSeed {
  code: string;
  name: string;
  symbol: string;
  dimension: UnitDimension;
  decimals: number;
}

/**
 * Global unit catalog, administered by global administrators only.
 *
 * Codes are stable because they are both what the API sends and the key the UI
 * translates, and they are immutable after creation. `dimension` gates what a
 * unit may express: weight accepts only `mass`, length and depth only `length`,
 * and a presentation quantity only `count`. No automatic conversion between
 * units is ever performed — the stored value keeps the unit it was captured in.
 *
 * This array is the seed of *missing* rows only: once a unit exists, an
 * administrator's edits, deactivation or soft deletion are never overwritten
 * (see `base/unit-of-measures.ts`).
 */
export const UNIT_OF_MEASURES: UnitOfMeasureSeed[] = [
  { code: 'EA', name: 'Each', symbol: 'ea', dimension: 'count', decimals: 0 },
  { code: 'KG', name: 'Kilogram', symbol: 'kg', dimension: 'mass', decimals: 3 },
  { code: 'G', name: 'Gram', symbol: 'g', dimension: 'mass', decimals: 3 },
  { code: 'LB', name: 'Pound', symbol: 'lb', dimension: 'mass', decimals: 3 },
  { code: 'OZ', name: 'Ounce', symbol: 'oz', dimension: 'mass', decimals: 3 },
  { code: 'M', name: 'Meter', symbol: 'm', dimension: 'length', decimals: 3 },
  { code: 'CM', name: 'Centimeter', symbol: 'cm', dimension: 'length', decimals: 3 },
  { code: 'MM', name: 'Millimeter', symbol: 'mm', dimension: 'length', decimals: 3 },
  { code: 'IN', name: 'Inch', symbol: 'in', dimension: 'length', decimals: 3 },
  { code: 'FT', name: 'Foot', symbol: 'ft', dimension: 'length', decimals: 3 }
];

/** module -> actions, following the `module:action` permission convention. */
export const PERMISSION_MODULES: Record<string, string[]> = {
  tenants: ['read', 'create', 'update', 'delete', 'switch'],
  users: ['read', 'create', 'update', 'delete'],
  roles: ['read', 'create', 'update', 'delete', 'assign-permissions'],
  permissions: ['read'],
  products: ['read', 'create', 'update', 'delete'],
  brands: ['read', 'create', 'update', 'delete'],
  suppliers: ['read', 'create', 'update', 'delete'],
  'units-of-measure': ['read', 'create', 'update', 'delete'],
  marketplaces: ['read', 'create', 'update', 'delete'],
  'price-lists': ['read', 'create', 'update', 'delete'],
  prices: ['read', 'create', 'update', 'delete', 'calculate'],
  discounts: ['read', 'create', 'update', 'delete'],
  'price-catalog': ['read', 'read-all', 'export'],
  'price-list-access': ['read', 'manage'],
  'price-history': ['read'],
  'api-keys': ['read', 'create', 'update', 'delete', 'revoke'],
  currencies: ['read'],
  dashboard: ['read'],
  settings: ['read', 'update']
};

const PRETTY_MODULE: Record<string, string> = {
  tenants: 'companies',
  users: 'users',
  roles: 'roles',
  permissions: 'permissions',
  products: 'products',
  brands: 'brands',
  suppliers: 'suppliers',
  'units-of-measure': 'units of measure',
  marketplaces: 'marketplaces',
  'price-lists': 'price lists',
  prices: 'prices',
  discounts: 'discounts',
  'price-catalog': 'price catalog',
  'price-list-access': 'price-list access',
  'price-history': 'price history',
  'api-keys': 'API keys',
  currencies: 'currencies',
  dashboard: 'dashboard',
  settings: 'settings'
};

const PRETTY_ACTION: Record<string, string> = {
  read: 'View',
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
  switch: 'Switch company',
  'assign-permissions': 'Assign permissions',
  manage: 'Manage',
  'read-all': 'View all',
  calculate: 'Calculate',
  revoke: 'Revoke'
};

export interface PermissionSeed {
  slug: string;
  name: string;
  description: string;
}

export function buildPermissionCatalog(): PermissionSeed[] {
  const catalog: PermissionSeed[] = [];
  for (const [module, actions] of Object.entries(PERMISSION_MODULES)) {
    for (const action of actions) {
      catalog.push({
        slug: `${module}:${action}`,
        name: `${PRETTY_ACTION[action] ?? action} ${PRETTY_MODULE[module] ?? module}`,
        description: `Allows ${action} on ${PRETTY_MODULE[module] ?? module}`
      });
    }
  }
  return catalog;
}

export const PERMISSION_CATALOG: PermissionSeed[] = buildPermissionCatalog();

export const ALL_PERMISSION_SLUGS: string[] = PERMISSION_CATALOG.map((p) => p.slug);

/**
 * Slugs no administrator of a company may hold.
 *
 * The unit catalog and the supplier catalog are both global — a write there is
 * visible to every company at once — so their write actions are global-only,
 * exactly like company management. The reads stay with the tenant roles because
 * the specification screen needs them to fill its pickers.
 */
export const TENANT_ADMIN_EXCLUDED = [
  'tenants:create',
  'tenants:update',
  'tenants:delete',
  'tenants:switch',
  'units-of-measure:create',
  'units-of-measure:update',
  'units-of-measure:delete',
  'suppliers:create',
  'suppliers:update',
  'suppliers:delete'
];

export const TENANT_USER_PERMISSIONS = [
  'products:read',
  'products:create',
  'products:update',
  // The specification aggregate reuses the Product permissions; these add the
  // Brand/Supplier catalogs and the unit catalog, which tenants read only.
  'brands:read',
  'brands:create',
  'brands:update',
  'suppliers:read',
  'suppliers:create',
  'suppliers:update',
  'units-of-measure:read',
  'price-lists:read',
  'price-lists:create',
  'price-lists:update',
  'prices:read',
  'prices:create',
  'prices:update',
  'prices:calculate',
  'discounts:read',
  'discounts:create',
  'discounts:update',
  'marketplaces:read',
  'price-history:read',
  'currencies:read',
  'dashboard:read',
  // Read access to Settings is what makes the Suppliers navigation section
  // reachable for a role that may read suppliers. It grants nothing editable:
  // every control on that page keeps its own `settings:update` gate.
  'settings:read'
];

export const READONLY_USER_PERMISSIONS = [
  'products:read',
  // Catalog read only: a read-only user sees the specification, brands,
  // suppliers, and units but can never edit the aggregate.
  'brands:read',
  'suppliers:read',
  'units-of-measure:read',
  'marketplaces:read',
  'price-lists:read',
  'prices:read',
  'discounts:read',
  'price-history:read',
  'currencies:read',
  'dashboard:read',
  // Same reason as `tenant_user`: without it, `suppliers:read` would grant a
  // navigation target the role cannot open. Read-only, so it exposes nothing
  // beyond the Settings panels that were already readable.
  'settings:read'
];

/**
 * Deliberately unchanged by the product-specification feature: this role is
 * restricted to reading and exporting its assigned price lists and does not hold
 * `products:read`, so it can never reach the specification screen. Granting it
 * brand/supplier/unit reads would contradict the role's stated scope.
 */
export const PRICE_CATALOG_VIEWER_PERMISSIONS = ['price-catalog:read', 'price-catalog:export'];

export interface RoleSeed {
  slug: string;
  name: string;
  description: string;
  permissions: string[];
}

export const SYSTEM_ROLES: RoleSeed[] = [
  {
    slug: 'global_admin',
    name: 'Global administrator',
    description: 'Full access across every company',
    permissions: ALL_PERMISSION_SLUGS
  },
  {
    slug: 'tenant_admin',
    name: 'Company administrator',
    description: 'Full access inside the company, excluding global company management',
    permissions: ALL_PERMISSION_SLUGS.filter((slug) => !TENANT_ADMIN_EXCLUDED.includes(slug))
  },
  {
    slug: 'tenant_user',
    name: 'Company operator',
    description: 'Operational read/write access on the main catalog modules',
    permissions: TENANT_USER_PERMISSIONS
  },
  {
    slug: 'readonly_user',
    name: 'Read-only user',
    description: 'Read-only access to the price catalog',
    permissions: READONLY_USER_PERMISSIONS
  },
  {
    slug: 'price_catalog_viewer',
    name: 'Price catalog viewer',
    description: 'Read and export assigned price lists only',
    permissions: PRICE_CATALOG_VIEWER_PERMISSIONS
  }
];

export const DEMO_TENANT = {
  commercialName: 'Demo Company',
  legalName: 'Demo Company S.A. de C.V.',
  slug: 'demo-company',
  defaultCurrency: 'MXN',
  timeZone: 'America/Mexico_City',
  notes: 'Empresa inicial para desarrollo y pruebas'
};

/**
 * UI language pinned for the seeded accounts. The demo dataset is
 * Spanish-language copy, so it is pinned explicitly instead of inheriting
 * `DEFAULT_LOCALE`, which is free to change.
 */
export const DEMO_USER_LOCALE = 'es-419' as const;

export const DEMO_MARKETPLACES = [
  { name: 'Amazon', code: 'amazon' as const },
  { name: 'Mercado Libre', code: 'mercadolibre' as const },
  { name: 'Tienda propia', code: 'own_store' as const }
];

export const DEMO_PRICE_LISTS = [
  { name: 'Retail', description: 'Lista de precios minorista' },
  { name: 'Wholesale', description: 'Lista de precios mayorista' },
  { name: 'Marketplace', description: 'Lista de precios para marketplaces' }
];

/**
 * Demo products with deterministic costs.
 *
 * `cost: null` is intentional on SKU-DEMO-003: it exercises the "cost not
 * captured" state next to real costs, so the demo data shows that a missing cost
 * is not a zero cost. Costs are stated per product in the tenant currency and
 * are never derived from `basePrice`.
 */
export const DEMO_PRODUCTS = [
  {
    sku: 'SKU-DEMO-001',
    name: 'Producto Demo 1',
    basePrice: 100,
    cost: 60,
    description: 'Producto de ejemplo para desarrollo'
  },
  {
    sku: 'SKU-DEMO-002',
    name: 'Producto Demo 2',
    basePrice: 250,
    cost: 175,
    description: 'Producto de ejemplo para desarrollo'
  },
  {
    sku: 'SKU-DEMO-003',
    name: 'Producto Demo 3',
    basePrice: 500,
    cost: null,
    description: 'Producto de ejemplo para desarrollo'
  }
];

export const DEMO_DISCOUNT = {
  name: 'Descuento demo 10%',
  type: 'percentage' as const,
  value: 10,
  priority: 10,
  description: 'Descuento de ejemplo creado por los seeds de desarrollo'
};

export const DEMO_BRANDS = [{ name: 'Acme' }, { name: 'Globex' }];

export const DEMO_SUPPLIERS = [
  { name: 'Distribuidora Norte' },
  { name: 'Suministros del Valle' }
];

export interface DemoIdentifierSeed {
  type: IdentifierType;
  /** Digits only, check digit included; leading zeroes are meaningful. */
  value: string;
}

export interface DemoPresentationSeed {
  name: string;
  quantity: number;
  unitCode: string;
  identifiers: DemoIdentifierSeed[];
}

export interface DemoSpecificationSeed {
  sku: string;
  brandName: string;
  model: string;
  measurements: {
    weight: { value: number; unitCode: string } | null;
    length: { value: number; unitCode: string } | null;
    depth: { value: number; unitCode: string } | null;
  };
  presentations: DemoPresentationSeed[];
  supplierNames: string[];
}

/**
 * Specification applied to `SKU-DEMO-001` by the demo seeds.
 *
 * The fixture covers the states the UI and the API must render rather than only
 * the happy path:
 *
 * - `depth` is `null` with no unit, i.e. "not captured" — never zero;
 * - two presentations, so the multi-record editor has real data;
 * - two identifiers of **different** symbologies (`ean_13` and `ean_8`), both
 *   with valid GS1 check digits, so the card list shows more than one row;
 * - one supplier out of the two seeded, so the chip list has an unselected
 *   option to add.
 *
 * `SKU-DEMO-003` is intentionally left without any specification, which keeps
 * the empty-aggregate state present in the demo data.
 */
export const DEMO_SPECIFICATION: DemoSpecificationSeed = {
  sku: 'SKU-DEMO-001',
  brandName: 'Acme',
  model: 'ACM-2026',
  measurements: {
    weight: { value: 1.25, unitCode: 'KG' },
    length: { value: 30, unitCode: 'CM' },
    depth: null
  },
  presentations: [
    {
      name: 'Caja de 12',
      quantity: 12,
      unitCode: 'EA',
      identifiers: [{ type: 'ean_13', value: '7501234567893' }]
    },
    {
      name: 'Unidad',
      quantity: 1,
      unitCode: 'EA',
      identifiers: [{ type: 'ean_8', value: '12345670' }]
    }
  ],
  supplierNames: ['Distribuidora Norte']
};
