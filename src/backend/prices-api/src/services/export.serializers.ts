export type ExportFormat = 'csv' | 'json' | 'txt';

export interface SerializedExport {
  content: Buffer;
  contentType: string;
  extension: string;
}

function safeCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value: unknown): string {
  const text = safeCell(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rowValues(row: any): unknown[] {
  return [
    row.product?.sku,
    row.product?.name,
    row.basePrice,
    row.appliedDiscount?.name ?? '',
    row.discountAmount,
    row.finalPrice,
    row.currencyCode,
    row.priceList?.name,
    row.marketplace?.name,
    row.calculatedAt
  ];
}

export function serializeCatalogExport(
  format: ExportFormat,
  rows: any[],
  metadata: { priceListId: string; marketplaceId: string; generatedAt: string }
): SerializedExport {
  const headers = [
    'sku',
    'product_name',
    'base_price',
    'discount_name',
    'discount_amount',
    'final_price',
    'currency_code',
    'price_list',
    'marketplace',
    'calculated_at'
  ];

  if (format === 'json') {
    return {
      content: Buffer.from(JSON.stringify({ ...metadata, generatedAt: metadata.generatedAt, data: rows }, null, 2), 'utf8'),
      contentType: 'application/json; charset=utf-8',
      extension: 'json'
    };
  }

  const lines = [headers.join(format === 'csv' ? ',' : '\t')];
  for (const row of rows) {
    const cells = rowValues(row).map((value) => (format === 'csv' ? csvCell(value) : safeCell(value)));
    lines.push(cells.join(format === 'csv' ? ',' : '\t'));
  }

  return {
    content: Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8'),
    contentType: format === 'csv' ? 'text/csv; charset=utf-8' : 'text/plain; charset=utf-8',
    extension: format
  };
}
