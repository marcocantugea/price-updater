import type { CrudModelOptions } from '../common/crud/types';

/**
 * Relation-aware search for records whose text lives on the related product.
 *
 * `Price` and `PriceHistory` cannot use `searchableFields` for this: a dotted
 * path such as `product.sku` is not a scalar column, so the generic builder
 * would emit an invalid Prisma filter. The two clauses below are the `OR` block
 * of the query, while tenant/soft-delete/status stay in the outer `where`.
 */
const searchByProductSkuOrName = (term: string): Record<string, unknown>[] => [
  { product: { is: { sku: { contains: term } } } },
  { product: { is: { name: { contains: term } } } }
];

/**
 * Declarative CRUD configuration per Prisma model. Keeps repositories thin and
 * makes the tenant/soft-delete/search behaviour explicit.
 */
export const MODEL_OPTIONS: Record<string, CrudModelOptions> = {
  tenant: {
    model: 'tenant',
    tenantScoped: false,
    hasDeletedAt: true,
    searchableFields: ['commercialName', 'legalName', 'slug'],
    filterableFields: ['status', 'defaultCurrency'],
    defaultSortField: 'createdAt',
    include: { currency: true }
  },

  user: {
    model: 'user',
    tenantScoped: true,
    hasDeletedAt: true,
    searchableFields: ['name', 'email'],
    filterableFields: ['status', 'roleId'],
    defaultSortField: 'createdAt',
    include: {
      role: { select: { id: true, slug: true, name: true, isSystem: true } },
      tenant: { select: { id: true, commercialName: true, slug: true } }
    }
  },

  role: {
    model: 'role',
    tenantScoped: true,
    hasDeletedAt: true,
    searchableFields: ['name', 'slug', 'description'],
    filterableFields: ['status', 'isSystem'],
    defaultSortField: 'name',
    defaultSortOrder: 'asc',
    include: {
      rolePermissions: { include: { permission: true } },
      _count: { select: { users: true } }
    }
  },

  product: {
    model: 'product',
    tenantScoped: true,
    hasDeletedAt: true,
    searchableFields: ['sku', 'name'],
    filterableFields: ['status', 'currencyCode'],
    defaultSortField: 'createdAt',
    include: { currency: true }
  },

  marketplace: {
    model: 'marketplace',
    tenantScoped: true,
    hasDeletedAt: true,
    searchableFields: ['name', 'code'],
    filterableFields: ['status', 'code'],
    defaultSortField: 'createdAt'
  },

  priceList: {
    model: 'priceList',
    tenantScoped: true,
    hasDeletedAt: true,
    searchableFields: ['name', 'description'],
    filterableFields: ['status', 'currencyCode'],
    defaultSortField: 'createdAt',
    include: {
      currency: true,
      priceListProducts: { include: { product: { select: { id: true, sku: true, name: true } } } },
      priceListMarketplaces: { include: { marketplace: { select: { id: true, name: true, code: true } } } }
    }
  },

  price: {
    model: 'price',
    tenantScoped: true,
    hasDeletedAt: true,
    searchableFields: [],
    searchWhere: searchByProductSkuOrName,
    filterableFields: ['status', 'productId', 'priceListId', 'marketplaceId', 'currencyCode'],
    defaultSortField: 'createdAt',
    include: {
      product: { select: { id: true, sku: true, name: true } },
      priceList: { select: { id: true, name: true } },
      marketplace: { select: { id: true, name: true, code: true } },
      currency: true
    }
  },

  priceHistory: {
    model: 'priceHistory',
    tenantScoped: true,
    hasDeletedAt: false,
    hasStatus: false,
    searchableFields: [],
    searchWhere: searchByProductSkuOrName,
    filterableFields: ['priceId', 'productId', 'changedByType'],
    defaultSortField: 'createdAt',
    include: { product: { select: { id: true, sku: true, name: true } } }
  },

  discount: {
    model: 'discount',
    tenantScoped: true,
    hasDeletedAt: true,
    searchableFields: ['name', 'description'],
    filterableFields: ['status', 'type', 'appliesTo', 'productId', 'priceListId', 'marketplaceId'],
    defaultSortField: 'createdAt',
    include: {
      product: { select: { id: true, sku: true, name: true } },
      priceList: { select: { id: true, name: true } },
      marketplace: { select: { id: true, name: true, code: true } }
    }
  },

  currency: {
    model: 'currency',
    tenantScoped: false,
    hasDeletedAt: true,
    searchableFields: ['code', 'name'],
    filterableFields: ['status'],
    defaultSortField: 'code',
    defaultSortOrder: 'asc'
  },

  permission: {
    model: 'permission',
    tenantScoped: false,
    hasDeletedAt: true,
    hasStatus: false,
    searchableFields: ['name', 'slug'],
    filterableFields: [],
    defaultSortField: 'slug',
    defaultSortOrder: 'asc'
  },

  apiKey: {
    model: 'apiKey',
    tenantScoped: true,
    hasDeletedAt: true,
    searchableFields: ['name', 'prefix'],
    filterableFields: ['status'],
    defaultSortField: 'createdAt'
  },

  // --- Product-specification catalogs --------------------------------------
  //
  // Note: `defaultSortOrder` is deliberately NOT declared below. The generic
  // list resolves its order as `query.order ?? options.defaultSortOrder ??
  // 'desc'`, but `parseListQuery` always fills `order` in (defaulting to
  // 'desc'), so `defaultSortOrder` can never take effect. The pre-existing
  // `currency` and `permission` entries declare `'asc'` and are silently
  // ignored for the same reason. Declaring it here would read as if the
  // catalogs came back ascending, which they do not.

  brand: {
    model: 'brand',
    tenantScoped: true,
    hasDeletedAt: true,
    searchableFields: ['name'],
    filterableFields: ['status'],
    defaultSortField: 'name'
  },

  /**
   * Global supplier catalog, shared by every company like `unitOfMeasure`.
   * Reads stay open to any role with `suppliers:read` (the specification picker
   * needs them); writes are global-administrator only at the route.
   */
  supplier: {
    model: 'supplier',
    tenantScoped: false,
    hasDeletedAt: true,
    searchableFields: ['name'],
    filterableFields: ['status'],
    defaultSortField: 'name'
  },

  /**
   * Global unit catalog, shaped like `currency` in that it is not tenant-scoped.
   * Unlike `currency` it is administrable at runtime, but only by a global
   * administrator: it is shared by every company, so a write there is visible to
   * all of them. `dimension` is
   * filterable because the UI narrows the unit picker to the measurement being
   * captured (weight offers `mass`, length and depth offer `length`).
   *
   * Note the deliberate omission: nothing here is added to `product`'s include.
   * That include is shared with the external `/external/products` API, so adding
   * specification relations to it would expose them to API keys without an
   * approved scope or contract.
   */
  unitOfMeasure: {
    model: 'unitOfMeasure',
    tenantScoped: false,
    hasDeletedAt: true,
    searchableFields: ['code', 'name'],
    filterableFields: ['status', 'dimension'],
    defaultSortField: 'code'
  }
};
