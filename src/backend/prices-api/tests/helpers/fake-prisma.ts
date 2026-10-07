import { randomUUID } from 'node:crypto';

type Row = Record<string, any>;

export const FAKE_MODELS = [
  'currency',
  'permission',
  'tenant',
  'role',
  'rolePermission',
  'user',
  'refreshToken',
  'apiKey',
  'product',
  'marketplace',
  'priceList',
  'priceListProduct',
  'priceListMarketplace',
  'price',
  'priceHistory',
  'discount',
  'userPriceListAccess',
  'exportRequest',
  'unitOfMeasure',
  'brand',
  'supplier',
  'productSpecification',
  'productPresentation',
  'productIdentifier',
  'productSupplier'
];

function valueOf(row: Row, path: string): any {
  return path.split('.').reduce<any>((acc, key) => (acc == null ? acc : acc[key]), row);
}

/** Supported subset of the Prisma filter operators. */
interface MatchContext {
  store: Record<string, Row[]>;
  /** Model currently being filtered; needed to resolve relation keys. */
  model: string;
  /** When true, a filter the double cannot evaluate throws instead of matching. */
  strict: boolean;
}

interface UnknownFilterError extends Error {
  filterKey?: string;
}

/** Supports the Prisma filter operators used across the codebase. */
/**
 * Value-level matcher.
 *
 * Exported so a spec can assert the operator contract directly, without going
 * through a delegate and a full model fixture.
 */
export function matchCondition(value: any, condition: any, context: MatchContext): boolean {
  if (condition === null || condition === undefined) {
    return value === null || value === undefined;
  }
  if (condition instanceof Date) {
    return value instanceof Date && value.getTime() === condition.getTime();
  }
  if (typeof condition !== 'object' || Array.isArray(condition)) {
    return value === condition;
  }

  const entries = Object.entries(condition);
  if (entries.length === 0) return true;

  return entries.every(([operator, operand]) => {
    switch (operator) {
      case 'equals':
        return matchCondition(value, operand, context);
      case 'not':
        return !matchCondition(value, operand, context);
      case 'in':
        return Array.isArray(operand) && operand.some((item) => matchCondition(value, item, context));
      case 'notIn':
        return Array.isArray(operand) && !operand.some((item) => matchCondition(value, item, context));
      case 'contains':
        return (
          typeof value === 'string' &&
          value.toLowerCase().includes(String(operand).toLowerCase())
        );
      case 'startsWith':
        return typeof value === 'string' && value.startsWith(String(operand));
      case 'endsWith':
        return typeof value === 'string' && value.endsWith(String(operand));
      case 'gte':
        return value !== null && value !== undefined && value >= (operand as any);
      case 'lte':
        return value !== null && value !== undefined && value <= (operand as any);
      case 'gt':
        return value !== null && value !== undefined && value > (operand as any);
      case 'lt':
        return value !== null && value !== undefined && value < (operand as any);
      default:
        return unexpectedFilter(operator, context);
    }
  });
}

function isRelationKey(model: string, key: string): boolean {
  return Boolean(BELONGS_TO[model]?.[key]);
}

/**
 * Evaluates a to-one relation filter such as
 * `{ product: { is: { sku: { contains: 'x' } } } }`.
 *
 * The row only stores the foreign key (`productId`), so the related row is
 * resolved through the `BELONGS_TO` mapping before the nested condition is
 * evaluated. The caller has already unwrapped `is`.
 */
function matchRelationFilter(
  row: Row,
  relation: string,
  condition: any,
  context: MatchContext
): boolean {
  const mapping = BELONGS_TO[context.model]?.[relation];
  if (!mapping) return false;

  const [relatedModel, localKey, relatedKey] = mapping;
  const foreignKey = valueOf(row, localKey);
  const related =
    foreignKey === null || foreignKey === undefined
      ? null
      : context.store[relatedModel]?.find((candidate) => candidate[relatedKey] === foreignKey) ?? null;

  if (condition === null || condition === undefined) return related === null;
  if (related === null) return false;

  return matchWhere(related, condition, { ...context, model: relatedModel });
}

/**
 * Wraps a value into its Prisma single-value filter operators.
 *
 * A model field named exactly like an operator (e.g. a boolean column called
 * `not`) would be misread as an operator. No current model has one, and the
 * failure mode is loud rather than silent, so this is documented rather than
 * engineered around.
 */
const SINGLE_VALUE_OPERATORS = ['equals', 'not', 'in', 'notIn', 'is', 'isNot'] as const;

/** Operators that compare a value directly (never a nested where input). */
const FILTER_OPERATORS = new Set<string>([
  'contains',
  'startsWith',
  'endsWith',
  'gte',
  'lte',
  'gt',
  'lt'
]);

function isOperatorKey(key: string): boolean {
  return (SINGLE_VALUE_OPERATORS as readonly string[]).includes(key) || FILTER_OPERATORS.has(key);
}
function isPlainObject(value: any): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

/**
 * Normalizes a condition into `[operators, value]`.
 *
 * Prisma accepts a bare value (`status: 'active'`) or an operator object
 * (`status: { in: [...] }`). A relation key instead holds a foreign key, so it
 * resolves through `matchRelationFilter`.
 */
function resolveCondition(
  value: any,
  condition: any,
  context: MatchContext,
  key?: string,
  row?: Row
): [Record<string, any>, any] {
  let operators: Record<string, any> = {};
  let operand = condition;

  // `{ is: { ... } }` reads as "the related row matches this where input", so the
  // wrapper is unwrapped before matching the relation. `is: null` / `isNot: null`
  // are kept as operators for the matcher to interpret.
  if (isPlainObject(operand)) {
    const wrapper = operand as Record<string, any>;
    if (wrapper['is'] !== null && wrapper['is'] !== undefined && 'is' in wrapper) {
      operators = { is: wrapper['is'] };
      operand = wrapper['is'];
    } else if (wrapper['isNot'] !== null && wrapper['isNot'] !== undefined && 'isNot' in wrapper) {
      operators = { isNot: wrapper['isNot'] };
      operand = wrapper['isNot'];
    } else if ('is' in wrapper || 'isNot' in wrapper) {
      operators = wrapper;
      operand = null;
    }
  }

  if (key && row && isRelationKey(context.model, key) && (isPlainObject(operand) || operand === null)) {
    return [operators, () => matchRelationFilter(row, key, operand, context)];
  }

  // A primitive operand is a plain equality comparison, never a nested where
  // input: `{ id: 'missing' }` must not be read as "filter id by 'missing'".
  if (!isPlainObject(operand)) {
    return [operators, (candidate: any) => matchCondition(candidate, operand, context)];
  }

  const keys = Object.keys(operand);
  if (keys.length > 0 && keys.every(isOperatorKey)) {
    return [operators, (candidate: any) => matchCondition(candidate, operand, context)];
  }

  // A nested where input (`{ sku: { contains: 'x' } }`) is only meaningful when
  // the value being filtered is itself a row. For a scalar value the keys of the
  // operand are operators, never field names.
  if (isPlainObject(operand) && isPlainObject(value)) {
    return [operators, (candidate: any) => matchWhere(candidate, operand, context)];
  }

  // A nested where input that the caller could not classify still has to be
  // evaluated with the scalar operator semantics.
  return [operators, (candidate: any) => matchCondition(candidate, operand, context)];
}

function applyMatcher(value: any, operators: Record<string, any>, matcher: Matcher, context: MatchContext): boolean {
  const entries = Object.entries(operators);
  // With no wrapper operator the matcher *is* the answer. Returning true for an
  // empty operator map would make every filter match.
  if (entries.length === 0) return matcher(value);

  return entries.every(([operator, operand]) => {
    switch (operator) {
      case 'is':
        // Without a related row the only meaningful check is `is: null`.
        return matcher === null ? value === null || value === undefined : matcher(value);
      case 'isNot':
        return matcher === null ? value !== null && value !== undefined : !matcher(value);
      case 'not': {
        const [, nested] = resolveCondition(value, operand, context);
        return !nested(value);
      }
      default:
        // `equals` and the scalar operators are handled by matchCondition, which
        // owns the value-level comparison semantics.
        return matchCondition(value, { [operator]: operand }, context);
    }
  });
}

/** Single place where the operator/value contract of the double is decided. */
function matchesCondition(
  value: any,
  condition: any,
  context: MatchContext,
  key?: string,
  row?: Row
): boolean {
  const [operators, matcher] = resolveCondition(value, condition, context, key, row);
  return applyMatcher(value, operators, matcher, context);
}

function unexpectedFilter(operator: string, context: MatchContext): boolean {
  // Matching an unimplemented filter silently would turn a broken query into a
  // passing test, which is worse than failing here.
  if (context.strict) {
    const error = new Error(
      `fake-prisma: cannot evaluate filter '${operator}' on model '${context.model}'`
    ) as UnknownFilterError;
    error.filterKey = operator;
    throw error;
  }
  return false;
}

type Matcher = (value: any) => boolean;

export function matchWhere(row: Row, where: any, context?: Partial<MatchContext>): boolean {
  if (!where) return true;

  const resolved: MatchContext = {
    store: context?.store ?? {},
    model: context?.model ?? '',
    strict: context?.strict ?? true
  };

  // `where` is sometimes a value filter rather than a field map
  // (`matchCondition` recurses with the operand of `not`, for example).
  if (isPlainObject(where)) {
    const keys = Object.keys(where);
    if (keys.length > 0 && keys.every(isOperatorKey)) {
      return matchesCondition(row, where, resolved);
    }
  }

  return Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') {
      const clauses = Array.isArray(condition) ? condition : [condition];
      return clauses.every((clause) => matchWhere(row, clause, resolved));
    }
    if (key === 'OR') {
      const clauses = Array.isArray(condition) ? condition : [condition];
      return clauses.some((clause) => matchWhere(row, clause, resolved));
    }
    if (key === 'NOT') {
      const clauses = Array.isArray(condition) ? condition : [condition];
      return !clauses.some((clause) => matchWhere(row, clause, resolved));
    }

    // A composite unique selector (`{ tenantId_name: { tenantId, name } }`) names
    // no column: it stands for the conjunction of the columns it covers.
    const compositeFields = COMPOSITE_UNIQUE_KEYS[resolved.model]?.[key];
    if (compositeFields) {
      if (!isPlainObject(condition)) return false;
      return compositeFields.every((field) =>
        matchesCondition(valueOf(row, field), (condition as Row)[field], resolved, field, row)
      );
    }

    return matchesCondition(valueOf(row, key), condition, resolved, key, row);
  });
}

function sortRows(rows: Row[], orderBy?: any): Row[] {
  if (!orderBy) return rows;
  const entries = Object.entries(orderBy) as [string, 'asc' | 'desc'][];
  if (entries.length === 0) return rows;

  const [field, direction] = entries[0];
  return [...rows].sort((a, b) => {
    const left = a[field];
    const right = b[field];

    let comparison = 0;
    if (left instanceof Date && right instanceof Date) {
      comparison = left.getTime() - right.getTime();
    } else if (left === right) {
      comparison = 0;
    } else if (left === null || left === undefined) {
      comparison = -1;
    } else if (right === null || right === undefined) {
      comparison = 1;
    } else {
      comparison = left < right ? -1 : 1;
    }

    return direction === 'desc' ? -comparison : comparison;
  });
}

/** belongsTo relation map used to resolve simple `include` clauses. */
const BELONGS_TO: Record<string, Record<string, [string, string, string]>> = {
  rolePermission: {
    permission: ['permission', 'permissionId', 'id'],
    role: ['role', 'roleId', 'id']
  },
  user: {
    role: ['role', 'roleId', 'id'],
    tenant: ['tenant', 'tenantId', 'id']
  },
  apiKey: { tenant: ['tenant', 'tenantId', 'id'] },
  product: { currency: ['currency', 'currencyCode', 'code'] },
  priceList: { currency: ['currency', 'currencyCode', 'code'] },
  price: {
    product: ['product', 'productId', 'id'],
    priceList: ['priceList', 'priceListId', 'id'],
    marketplace: ['marketplace', 'marketplaceId', 'id'],
    currency: ['currency', 'currencyCode', 'code']
  },
  priceHistory: {
    product: ['product', 'productId', 'id'],
    price: ['price', 'priceId', 'id']
  },
  discount: {
    product: ['product', 'productId', 'id'],
    priceList: ['priceList', 'priceListId', 'id'],
    marketplace: ['marketplace', 'marketplaceId', 'id']
  },
  priceListProduct: {
    product: ['product', 'productId', 'id'],
    priceList: ['priceList', 'priceListId', 'id']
  },
  priceListMarketplace: {
    marketplace: ['marketplace', 'marketplaceId', 'id'],
    priceList: ['priceList', 'priceListId', 'id']
  },
  userPriceListAccess: {
    priceList: ['priceList', 'priceListId', 'id'],
    user: ['user', 'userId', 'id']
  },
  exportRequest: {
    priceList: ['priceList', 'priceListId', 'id'],
    marketplace: ['marketplace', 'marketplaceId', 'id'],
    requestedByUser: ['user', 'requestedByUserId', 'id']
  },
  tenant: { currency: ['currency', 'defaultCurrency', 'code'] },
  brand: { tenant: ['tenant', 'tenantId', 'id'] },
  // `supplier` has no relation to declare: it is a global catalog, so there is no
  // tenant to resolve and no `tenantId` column to read.
  productSpecification: {
    product: ['product', 'productId', 'id'],
    brand: ['brand', 'brandId', 'id']
  },
  productPresentation: {
    product: ['product', 'productId', 'id'],
    unit: ['unitOfMeasure', 'unitCode', 'code']
  },
  productIdentifier: {
    presentation: ['productPresentation', 'presentationId', 'id']
  },
  productSupplier: {
    product: ['product', 'productId', 'id'],
    supplier: ['supplier', 'supplierId', 'id']
  }
};

/**
 * Composite unique selectors accepted in `where`, per model.
 *
 * Prisma exposes every `@@unique` as a named object selector such as
 * `{ tenantId_name: { tenantId, name } }`. The double stores flat columns, so
 * `matchWhere` expands the selector into one condition per column.
 *
 * Only the models added for the product-specification feature are declared here;
 * the older models keep their unsupported selectors as before.
 */
const COMPOSITE_UNIQUE_KEYS: Record<string, Record<string, string[]>> = {
  brand: {
    tenantId_name: ['tenantId', 'name'],
    tenantId_id: ['tenantId', 'id']
  },
  productSpecification: {
    tenantId_productId: ['tenantId', 'productId']
  },
  productPresentation: {
    tenantId_productId_id: ['tenantId', 'productId', 'id']
  },
  productIdentifier: {
    tenantId_normalizedValue: ['tenantId', 'normalizedValue']
  },
  productSupplier: {
    tenantId_productId_supplierId: ['tenantId', 'productId', 'supplierId']
  }
};

/**
 * Models whose identity is a composite natural key (`@@id([...])`) and that
 * therefore have no surrogate `id` column in the schema.
 *
 * `create`/`createMany` must not invent an `id` for them: `ProductSupplier` is
 * the first model whose `@@id` is a business key, and a phantom `id` would make
 * the stored row differ from what the database holds. The older join tables
 * (`priceListProduct`, `priceListMarketplace`, `userPriceListAccess`) keep their
 * historical synthesised `id` so the already-green suites see exactly the rows
 * they saw before.
 */
const NO_SURROGATE_ID_MODELS = new Set<string>(['productSupplier']);

/**
 * Column defaults the database applies itself, for the models where the
 * difference is observable from application code.
 *
 * MySQL stores an unset nullable column as `NULL`, but the double would leave the
 * property `undefined`. That gap is not cosmetic: `deletedAt` *is* the
 * soft-delete flag, and services legitimately compare it
 * (`row.deletedAt === null`, `row.deletedAt !== null`). With `undefined` those
 * comparisons invert — a row looks deleted when it is active — so a suite can
 * pass or fail for a reason that cannot occur against the real database.
 *
 * Declared for the product-specification models only, so the already-green
 * suites keep observing exactly the rows they observed before.
 */
const MODEL_DEFAULTS: Record<string, Record<string, unknown>> = {
  unitOfMeasure: { deletedAt: null },
  brand: { deletedAt: null },
  supplier: { deletedAt: null },
  productSpecification: { deletedAt: null },
  productPresentation: { deletedAt: null },
  productIdentifier: { deletedAt: null },
  productSupplier: { deletedAt: null }
};

/**
 * In-memory Prisma double. Implements the subset of the client used by the
 * repositories, services and seeds so unit tests stay fast and DB-free.
 */
export function createFakePrisma(initial: Record<string, Row[]> = {}): any {
  const store: Record<string, Row[]> = {};

  const ensure = (model: string): Row[] => {
    if (!store[model]) store[model] = [];
    return store[model];
  };

  for (const [model, rows] of Object.entries(initial)) {
    store[model] = rows.map((row) => ({ ...row }));
  }

  const clone = (row: Row): Row => ({ ...row });

  /**
   * Deep copy of a row, used by the transaction snapshot.
   *
   * A shallow `{ ...row }` would share any nested object with the live row, so a
   * service that mutated a nested value in place would keep that mutation after
   * a rollback. `structuredClone` preserves `Date` instances, which a JSON
   * round-trip would silently turn into strings.
   */
  const cloneRowDeep = (row: Row): Row =>
    typeof structuredClone === 'function'
      ? structuredClone(row)
      : (JSON.parse(JSON.stringify(row)) as Row);

  /** In-place snapshot of every model's rows. */
  const snapshotStore = (): Record<string, Row[]> => {
    const snapshot: Record<string, Row[]> = {};
    for (const [model, rows] of Object.entries(store)) {
      snapshot[model] = rows.map(cloneRowDeep);
    }
    return snapshot;
  };

  /**
   * Restores a snapshot in place.
   *
   * Arrays are emptied and refilled rather than replaced, so it does not matter
   * whether a delegate looked the array up once or on every call.
   */
  const restoreStore = (snapshot: Record<string, Row[]>): void => {
    for (const model of Object.keys(store)) {
      if (!snapshot[model]) store[model].length = 0;
    }
    for (const [model, rows] of Object.entries(snapshot)) {
      const target = ensure(model);
      target.length = 0;
      target.push(...rows.map(cloneRowDeep));
    }
  };

  /** False for models whose composite `@@id` leaves them without an `id` column. */
  const hasSurrogateId = (model: string): boolean => !NO_SURROGATE_ID_MODELS.has(model);

  /** Resolves a simple belongsTo relation using the mapping table. */
  const resolveRelated = (model: string, row: Row, relation: string): Row | null => {
    const mapping = BELONGS_TO[model]?.[relation];
    if (!mapping) return null;
    const [relatedModel, localKey, relatedKey] = mapping;
    const foreignKey = row[localKey];
    if (foreignKey === null || foreignKey === undefined) return null;
    return ensure(relatedModel).find((candidate) => candidate[relatedKey] === foreignKey) ?? null;
  };

  /** Resolves simple belongsTo relations declared through `include`. */
  const decorate = (model: string, row: Row | null, include?: any): any => {
    if (!row) return row;
    const result = clone(row);
    if (!include) return result;

    for (const relation of Object.keys(include)) {
      if (!BELONGS_TO[model]?.[relation]) continue;
      const related = resolveRelated(model, row, relation);
      result[relation] = related ? clone(related) : null;
    }

    return result;
  };

  function makeDelegate(model: string): any {
    const rows = (): Row[] => ensure(model);
    const delegate: any = {};

    // Relation filters such as `{ product: { is: { sku: { contains: 'x' } } } }`
    // need the sibling stores to resolve the related row.
    const context = (): MatchContext => ({ store, model, strict: true });

    delegate.findFirst = async ({ where, orderBy, include }: any = {}) => {
      let found = rows().filter((row) => matchWhere(row, where, context()));
      if (orderBy) found = sortRows(found, orderBy);
      return found.length > 0 ? decorate(model, found[0], include) : null;
    };

    delegate.findUnique = async ({ where, include }: any = {}) => delegate.findFirst({ where, include });

    delegate.findMany = async ({ where, orderBy, skip, take, include }: any = {}) => {
      let found = rows().filter((row) => matchWhere(row, where, context()));
      if (orderBy) found = sortRows(found, orderBy);
      if (typeof skip === 'number') found = found.slice(skip);
      if (typeof take === 'number') found = found.slice(0, take);
      return found.map((row) => decorate(model, row, include));
    };

    delegate.create = async ({ data, include }: any = {}) => {
      const row: Row = {
        ...(MODEL_DEFAULTS[model] ?? {}),
        ...(hasSurrogateId(model) ? { id: data?.id ?? randomUUID() } : {}),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data
      };
      rows().push(row);
      return decorate(model, row, include);
    };

    delegate.createMany = async ({ data }: any = {}) => {
      const list = Array.isArray(data) ? data : [data];
      for (const item of list) {
        rows().push({
          ...(MODEL_DEFAULTS[model] ?? {}),
          ...(hasSurrogateId(model) ? { id: item.id ?? randomUUID() } : {}),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...item
        });
      }
      return { count: list.length };
    };

    delegate.update = async ({ where, data, include }: any = {}) => {
      const row = rows().find((candidate) => matchWhere(candidate, where, context()));
      if (!row) throw new Error(`${model} not found`);
      Object.assign(row, data, { updatedAt: new Date() });
      return decorate(model, row, include);
    };

    delegate.updateMany = async ({ where, data }: any = {}) => {
      const found = rows().filter((row) => matchWhere(row, where, context()));
      found.forEach((row) => {
        for (const [field, value] of Object.entries(data ?? {})) {
          if (value && typeof value === 'object' && 'increment' in value) {
            row[field] = Number(row[field] ?? 0) + Number((value as any).increment);
          } else {
            row[field] = value;
          }
        }
      });
      return { count: found.length };
    };

    delegate.upsert = async ({ where, create, update }: any = {}) => {
      const row = rows().find((candidate) => matchWhere(candidate, where, context()));
      if (row) {
        Object.assign(row, update, { updatedAt: new Date() });
        return clone(row);
      }
      return delegate.create({ data: create });
    };

    delegate.deleteMany = async ({ where }: any = {}) => {
      const keep = rows().filter((row) => !matchWhere(row, where, context()));
      const removed = rows().length - keep.length;
      store[model] = keep;
      return { count: removed };
    };

    delegate.delete = async ({ where }: any = {}) => {
      const index = rows().findIndex((row) => matchWhere(row, where, context()));
      if (index < 0) throw new Error(`${model} not found`);
      const [removed] = store[model].splice(index, 1);
      return clone(removed);
    };

    delegate.count = async ({ where }: any = {}) =>
      rows().filter((row) => matchWhere(row, where, context())).length;

    delegate.groupBy = async ({ by, where, _count, _avg }: any = {}) => {
      const found = rows().filter((row) => matchWhere(row, where, context()));
      const groups = new Map<string, Row[]>();

      for (const row of found) {
        const key = by.map((field: string) => String(row[field])).join('|');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row);
      }

      return [...groups.values()].map((groupRows) => {
        const result: Row = {};
        for (const field of by) result[field] = groupRows[0][field];
        if (_count) result._count = { _all: groupRows.length };
        if (_avg) {
          result._avg = {};
          for (const field of Object.keys(_avg)) {
            const values = groupRows
              .map((row) => Number(row[field]))
              .filter((value) => !Number.isNaN(value));
            result._avg[field] = values.length
              ? values.reduce((total, value) => total + value, 0) / values.length
              : null;
          }
        }
        return result;
      });
    };

    return delegate;
  }

  const prisma: any = {};
  for (const model of FAKE_MODELS) prisma[model] = makeDelegate(model);

  /**
   * `$transaction` with a callback is genuinely transactional: the store is
   * snapshotted first and restored if the callback throws.
   *
   * This is not a nicety. The aggregate `PUT` writes a specification, several
   * presentations, their identifiers, and supplier links as one unit, and its
   * contract promises that an invalid request persists **no partial changes**.
   * Without rollback here, a test asserting that promise would fail against a
   * correct service, and — far worse — a test could pass against a service that
   * leaks partial writes in production.
   *
   * The array form (`$transaction([...])`) keeps its previous behaviour: the
   * operations are simply awaited together, matching how the codebase uses it.
   */
  prisma.$transaction = async (input: any) => {
    if (typeof input !== 'function') return Promise.all(input);

    const snapshot = snapshotStore();

    try {
      return await input(prisma);
    } catch (error) {
      restoreStore(snapshot);
      throw error;
    }
  };
  prisma.$queryRaw = async () => [{ '1': 1 }];
  prisma.$disconnect = async () => undefined;
  prisma.__store = store;

  return prisma;
}
