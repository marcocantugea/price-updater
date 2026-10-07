import {
  MAX_IDENTIFIERS_PER_PRESENTATION,
  MAX_PRESENTATIONS_PER_PRODUCT,
  MAX_SUPPLIERS_PER_PRODUCT,
  productSpecificationParamsSchema,
  replaceProductSpecificationSchema
} from '../../src/validators/product-specification.validators';

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const PRESENTATION_ID = '22222222-2222-4222-8222-222222222222';
const IDENTIFIER_ID = '33333333-3333-4333-8333-333333333333';
const SUPPLIER_ID = '44444444-4444-4444-8444-444444444444';

/** A minimal valid full-replacement body. Each test perturbs exactly one thing. */
function validPayload(): Record<string, unknown> {
  return {
    brandId: null,
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
      }
    ],
    supplierIds: []
  };
}

function issuePaths(payload: unknown): string[] {
  const result = replaceProductSpecificationSchema.safeParse(payload);
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join('.'));
}

describe('replaceProductSpecificationSchema — strictness', () => {
  it('accepts the documented payload', () => {
    expect(replaceProductSpecificationSchema.safeParse(validPayload()).success).toBe(true);
  });

  it('rejects unknown top-level keys instead of ignoring them', () => {
    const payload = { ...validPayload(), unexpected: true };

    expect(replaceProductSpecificationSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects the fields the client must never control', () => {
    // §8: clients cannot set tenantId, audit fields, normalizedValue, technical
    // status, or deletedAt. Strict bodies make each attempt a 422.
    for (const forbidden of [
      { tenantId: PRODUCT_ID },
      { status: 'inactive' },
      { deletedAt: new Date().toISOString() },
      { createdAt: new Date().toISOString() },
      { createdBy: PRODUCT_ID },
      { normalizedValue: '07501234567893' }
    ]) {
      expect(replaceProductSpecificationSchema.safeParse({ ...validPayload(), ...forbidden }).success).toBe(
        false
      );
    }
  });

  it('rejects unknown keys inside measurements, presentations, and identifiers', () => {
    const withMeasurementKey = validPayload();
    (withMeasurementKey.measurements as any).width = { value: 1, unitCode: 'CM' };
    expect(replaceProductSpecificationSchema.safeParse(withMeasurementKey).success).toBe(false);

    const withPresentationKey = validPayload();
    (withPresentationKey.presentations as any)[0].specificationId = PRODUCT_ID;
    expect(replaceProductSpecificationSchema.safeParse(withPresentationKey).success).toBe(false);

    const withIdentifierKey = validPayload();
    (withIdentifierKey.presentations as any)[0].identifiers[0].normalizedValue = '07501234567893';
    expect(replaceProductSpecificationSchema.safeParse(withIdentifierKey).success).toBe(false);
  });

  it('rejects unknown identifier types', () => {
    const payload = validPayload();
    (payload.presentations as any)[0].identifiers[0].type = 'code_128';

    expect(replaceProductSpecificationSchema.safeParse(payload).success).toBe(false);
  });
});

describe('replaceProductSpecificationSchema — full replacement', () => {
  it('requires every top-level key', () => {
    for (const key of ['brandId', 'model', 'measurements', 'presentations', 'supplierIds']) {
      const payload = validPayload();
      delete payload[key];

      expect(replaceProductSpecificationSchema.safeParse(payload).success).toBe(false);
    }
  });

  it('accepts an empty aggregate: no brand, no model, no suppliers, no presentations', () => {
    const payload = {
      brandId: null,
      model: null,
      measurements: {},
      presentations: [],
      supplierIds: []
    };

    expect(replaceProductSpecificationSchema.safeParse(payload).success).toBe(true);
  });

  it('treats an omitted identifiers array as "no identifiers", not as an error', () => {
    const payload = validPayload();
    delete (payload.presentations as any)[0].identifiers;

    const result = replaceProductSpecificationSchema.safeParse(payload);

    expect(result.success).toBe(true);
    expect(result.success && result.data.presentations[0].identifiers).toEqual([]);
  });

  it('keeps parenthetical UUIDs optional so new children can be created', () => {
    expect(replaceProductSpecificationSchema.safeParse(validPayload()).success).toBe(true);

    const payload = validPayload();
    (payload.presentations as any)[0].id = PRESENTATION_ID;
    (payload.presentations as any)[0].identifiers[0].id = IDENTIFIER_ID;
    expect(replaceProductSpecificationSchema.safeParse(payload).success).toBe(true);
  });
});

describe('replaceProductSpecificationSchema — measurements', () => {
  it('requires value and unit together when a measurement is present', () => {
    const payload = validPayload();
    (payload.measurements as any).weight = { value: 1.25 };
    expect(replaceProductSpecificationSchema.safeParse(payload).success).toBe(false);

    const other = validPayload();
    (other.measurements as any).weight = { unitCode: 'KG' };
    expect(replaceProductSpecificationSchema.safeParse(other).success).toBe(false);
  });

  it('rejects zero and negative values, because null means "not captured"', () => {
    for (const value of [0, -0.001, -5]) {
      const payload = validPayload();
      (payload.measurements as any).weight = { value, unitCode: 'KG' };

      expect(replaceProductSpecificationSchema.safeParse(payload).success).toBe(false);
    }
  });

  it('rejects more than three decimals and values beyond DECIMAL(12,3)', () => {
    const tooPrecise = validPayload();
    (tooPrecise.measurements as any).weight = { value: 1.2345, unitCode: 'KG' };
    expect(replaceProductSpecificationSchema.safeParse(tooPrecise).success).toBe(false);

    const tooLarge = validPayload();
    (tooLarge.measurements as any).weight = { value: 1000000000, unitCode: 'KG' };
    expect(replaceProductSpecificationSchema.safeParse(tooLarge).success).toBe(false);
  });

  it('accepts exactly three decimals and the maximum value', () => {
    const payload = validPayload();
    (payload.measurements as any).weight = { value: 1.005, unitCode: 'KG' };
    (payload.measurements as any).length = { value: 999999999.999, unitCode: 'CM' };

    expect(replaceProductSpecificationSchema.safeParse(payload).success).toBe(true);
  });

  it('rejects a numeric string rather than coercing it', () => {
    // Coercion is what made '' indistinguishable from 0 in an earlier feature.
    const payload = validPayload();
    (payload.measurements as any).weight = { value: '1.25', unitCode: 'KG' };

    expect(replaceProductSpecificationSchema.safeParse(payload).success).toBe(false);
  });

  it('requires a non-empty unit code', () => {
    const payload = validPayload();
    (payload.measurements as any).weight = { value: 1, unitCode: '   ' };

    expect(replaceProductSpecificationSchema.safeParse(payload).success).toBe(false);
  });
});

describe('replaceProductSpecificationSchema — limits', () => {
  const presentation = (index: number) => ({
    name: `Presentation ${index}`,
    quantity: 1,
    unitCode: 'EA',
    identifiers: []
  });

  it(`accepts exactly ${MAX_PRESENTATIONS_PER_PRODUCT} presentations and rejects one more`, () => {
    const atLimit = validPayload();
    atLimit.presentations = Array.from({ length: MAX_PRESENTATIONS_PER_PRODUCT }, (_, i) => presentation(i));
    expect(replaceProductSpecificationSchema.safeParse(atLimit).success).toBe(true);

    const overLimit = validPayload();
    overLimit.presentations = Array.from(
      { length: MAX_PRESENTATIONS_PER_PRODUCT + 1 },
      (_, i) => presentation(i)
    );
    expect(replaceProductSpecificationSchema.safeParse(overLimit).success).toBe(false);
  });

  it(`accepts exactly ${MAX_IDENTIFIERS_PER_PRESENTATION} identifiers and rejects one more`, () => {
    const identifiers = (count: number) =>
      Array.from({ length: count }, (_, i) => ({ type: 'ean_13' as const, value: `75012345678${i}` }));

    const atLimit = validPayload();
    (atLimit.presentations as any)[0].identifiers = identifiers(MAX_IDENTIFIERS_PER_PRESENTATION);
    expect(replaceProductSpecificationSchema.safeParse(atLimit).success).toBe(true);

    const overLimit = validPayload();
    (overLimit.presentations as any)[0].identifiers = identifiers(MAX_IDENTIFIERS_PER_PRESENTATION + 1);
    expect(replaceProductSpecificationSchema.safeParse(overLimit).success).toBe(false);
  });

  it(`accepts exactly ${MAX_SUPPLIERS_PER_PRODUCT} suppliers and rejects one more`, () => {
    const suppliers = (count: number) =>
      Array.from({ length: count }, (_, i) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`);

    const atLimit = validPayload();
    atLimit.supplierIds = suppliers(MAX_SUPPLIERS_PER_PRODUCT);
    expect(replaceProductSpecificationSchema.safeParse(atLimit).success).toBe(true);

    const overLimit = validPayload();
    overLimit.supplierIds = suppliers(MAX_SUPPLIERS_PER_PRODUCT + 1);
    expect(replaceProductSpecificationSchema.safeParse(overLimit).success).toBe(false);
  });
});

describe('replaceProductSpecificationSchema — duplicate child ids', () => {
  it('rejects the same presentation id twice, at the offending index', () => {
    const payload = validPayload();
    payload.presentations = [
      { id: PRESENTATION_ID, name: 'A', quantity: 1, unitCode: 'EA', identifiers: [] },
      { id: PRESENTATION_ID, name: 'B', quantity: 1, unitCode: 'EA', identifiers: [] }
    ];

    expect(issuePaths(payload)).toContain('presentations.1.id');
  });

  it('rejects the same identifier id twice, at the offending nested index', () => {
    const payload = validPayload();
    (payload.presentations as any)[0].identifiers = [
      { id: IDENTIFIER_ID, type: 'ean_13', value: '7501234567893' },
      { id: IDENTIFIER_ID, type: 'ean_8', value: '12345670' }
    ];

    expect(issuePaths(payload)).toContain('presentations.0.identifiers.1.id');
  });

  it('rejects the same supplier twice', () => {
    const payload = validPayload();
    payload.supplierIds = [SUPPLIER_ID, SUPPLIER_ID];

    expect(issuePaths(payload)).toContain('supplierIds.1');
  });

  it('allows the same supplier id in different products (structural check only)', () => {
    const payload = validPayload();
    payload.supplierIds = [SUPPLIER_ID];

    expect(replaceProductSpecificationSchema.safeParse(payload).success).toBe(true);
  });
});

describe('productSpecificationParamsSchema', () => {
  it('accepts a UUID product id', () => {
    expect(productSpecificationParamsSchema.safeParse({ productId: PRODUCT_ID }).success).toBe(true);
  });

  it('rejects a non-UUID product id', () => {
    expect(productSpecificationParamsSchema.safeParse({ productId: 'SKU-DEMO-001' }).success).toBe(false);
  });

  it('rejects extra route params', () => {
    expect(
      productSpecificationParamsSchema.safeParse({ productId: PRODUCT_ID, extra: 'x' }).success
    ).toBe(false);
  });
});
