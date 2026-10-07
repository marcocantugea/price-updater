import { serializeCatalogExport } from '../../src/services/export.serializers';

const rows = [
  {
    product: { sku: '=SKU-1', name: 'Product, one' },
    basePrice: 100,
    appliedDiscount: { name: 'Summer', value: 10 },
    discountAmount: 10,
    finalPrice: 90,
    currencyCode: 'MXN',
    priceList: { name: 'Retail' },
    marketplace: { name: 'Amazon' },
    calculatedAt: '2026-09-19T00:00:00.000Z'
  }
];

describe('catalog export serializers', () => {
  it('serializes CSV with headers, quoting, and formula protection', () => {
    const result = serializeCatalogExport('csv', rows, {
      priceListId: 'list-1',
      marketplaceId: 'marketplace-1',
      generatedAt: '2026-09-19T00:00:00.000Z'
    });
    const output = result.content.toString('utf8');

    expect(result.contentType).toContain('text/csv');
    expect(output).toContain("'=SKU-1");
    expect(output).toContain('"Product, one"');
  });

  it('serializes JSON with metadata and data', () => {
    const result = serializeCatalogExport('json', rows, {
      priceListId: 'list-1',
      marketplaceId: 'marketplace-1',
      generatedAt: '2026-09-19T00:00:00.000Z'
    });
    const parsed = JSON.parse(result.content.toString('utf8'));

    expect(parsed.priceListId).toBe('list-1');
    expect(parsed.data).toHaveLength(1);
  });

  it('serializes TXT as UTF-8 tab-separated rows', () => {
    const result = serializeCatalogExport('txt', rows, {
      priceListId: 'list-1',
      marketplaceId: 'marketplace-1',
      generatedAt: '2026-09-19T00:00:00.000Z'
    });

    expect(result.contentType).toContain('text/plain');
    expect(result.content.toString('utf8')).toContain('\t');
  });
});
