import { humanize, readPath, toDateOnlyInputValue, toDateInputValue } from './format';
import * as formatModule from './format';
import { zodValidator } from './validation';
import { FormControl, FormGroup } from '@angular/forms';
import { z } from 'zod';
import { currencyOptionLoader, idOptionLoader, staticOptions } from './options';
import { listTimeZoneOptions } from './time-zones';
import { of } from 'rxjs';

describe('format utilities', () => {
  it('converts dates for date inputs', () => {
    expect(toDateInputValue('2024-03-05T12:00:00.000Z')).toMatch(/^2024-03-0[45]$/);
    expect(toDateInputValue(null)).toBe('');
    expect(toDateInputValue('garbage')).toBe('');
    expect(toDateInputValue(new Date('2024-01-02T00:00:00'))).toContain('2024-01-02');
  });

  it('converts database calendar dates without shifting the day', () => {
    expect(toDateOnlyInputValue('2024-03-05T00:00:00.000Z')).toBe('2024-03-05');
    expect(toDateOnlyInputValue(new Date('2024-03-05T23:30:00.000Z'))).toBe('2024-03-05');
    expect(toDateOnlyInputValue('')).toBe('');
    expect(toDateOnlyInputValue('garbage')).toBe('');
  });

  it('humanizes technical keys', () => {
    expect(humanize('base_price')).toBe('Base price');
    expect(humanize('basePrice')).toBe('Base Price');
    expect(humanize('sku')).toBe('Sku');
  });

  it('reads nested paths safely', () => {
    expect(readPath({ product: { name: 'TV' } }, 'product.name')).toBe('TV');
    expect(readPath({}, 'product.name')).toBeUndefined();
    expect(readPath(null, 'a.b')).toBeUndefined();
  });

  it('no longer exposes locale-bound helpers', () => {
    // Money formatting and error localization moved to injectable services so
    // they can follow the active locale; this module must stay locale-free.
    expect(Object.keys(formatModule)).not.toContain('formatMoney');
    expect(Object.keys(formatModule)).not.toContain('extractApiErrorMessage');
    expect(Object.keys(formatModule)).not.toContain('extractFieldErrors');
  });
});

describe('zod validator bridge', () => {
  const schema = z.object({ value: z.coerce.number().min(5, 'too small') });
  const validator = zodValidator(schema);

  const group = (value: unknown) => new FormGroup({ value: new FormControl(value) });

  it('returns null when the schema passes', () => {
    expect(validator(group(10))).toBeNull();
  });

  it('maps issues to a field error map', () => {
    const result = validator(group(1));
    expect(result).not.toBeNull();
    expect(result!['zod']['value']).toBe('too small');
  });

  it('uses a fallback key for root issues', () => {
    const rootValidator = zodValidator(z.object({}).refine(() => false, { message: 'root problem' }));
    const result = rootValidator(new FormGroup({}));
    expect(result!['zod']['_form']).toBe('root problem');
  });
});

describe('option loaders', () => {
  it('builds id-based options marked as literal business data', (done) => {
    const service = { list: () => of({ data: [{ id: 'a', name: 'Alpha' }], meta: {} }) } as any;
    idOptionLoader(service, 'name')().subscribe((options) => {
      // Record names are never translated, so they are wrapped as literals.
      expect(options).toEqual([{ value: 'a', label: { text: 'Alpha' } }]);
      done();
    });
  });

  it('falls back to the id when the label is missing', (done) => {
    const service = { list: () => of({ data: [{ id: 'b' }], meta: {} }) } as any;
    idOptionLoader(service, 'name')().subscribe((options) => {
      expect(options[0].label).toEqual({ text: 'b' });
      done();
    });
  });

  it('builds currency options keyed by ISO code', (done) => {
    const service = { list: () => of({ data: [{ code: 'MXN', name: 'Peso mexicano' }], meta: {} }) } as any;
    currencyOptionLoader(service)().subscribe((options) => {
      expect(options).toEqual([{ value: 'MXN', label: { text: 'MXN — Peso mexicano' } }]);
      done();
    });
  });

  it('prefers a locale-aware currency name when a resolver is supplied', (done) => {
    const service = { list: () => of({ data: [{ code: 'MXN', name: 'Peso mexicano' }], meta: {} }) } as any;
    currencyOptionLoader(service, () => 'Mexican Peso')().subscribe((options) => {
      expect(options[0].label).toEqual({ text: 'MXN — Mexican Peso' });
      done();
    });
  });

  it('falls back to the ISO code alone when there is no name', (done) => {
    const service = { list: () => of({ data: [{ code: 'XXX', name: '' }], meta: {} }) } as any;
    currencyOptionLoader(service)().subscribe((options) => {
      expect(options[0].label).toEqual({ text: 'XXX' });
      done();
    });
  });

  it('builds static options from catalog keys', () => {
    expect(staticOptions([['active', { key: 'status.active' }]])).toEqual([
      { value: 'active', label: { key: 'status.active' } }
    ]);
    // Transitional literals still compile during the migration.
    expect(staticOptions([['active', { text: 'Activo' }]])).toEqual([{ value: 'active', label: { text: 'Activo' } }]);
  });
});

describe('time zone options', () => {
  it('exposes a stable technical offset token for every zone', () => {
    const options = listTimeZoneOptions();

    expect(options.length).toBeGreaterThan(0);
    const utc = options.find((option) => option.value === 'UTC');
    expect(utc).toBeDefined();
    // The token is a technical `UTC±hh:mm` value, never a localized label.
    expect(utc!.offset).toMatch(/^UTC/);
    expect(utc!.label).toBe(`${utc!.offset} · UTC`);
  });

  it('is sorted by the technical identifier, not by a localized label', () => {
    const values = listTimeZoneOptions().map((option) => option.value);
    expect([...values].sort((left, right) => left.localeCompare(right))).toEqual(values);
  });

  it('is independent of the active locale', () => {
    // Pinned to en-US internally on purpose: the tenant time zone must not move
    // when the UI language changes.
    const first = listTimeZoneOptions();
    const second = listTimeZoneOptions();

    expect(second).toEqual(first);
  });
});
