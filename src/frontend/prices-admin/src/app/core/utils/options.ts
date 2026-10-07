import { map } from 'rxjs/operators';
import type { CrudResource } from '../services/crud-resource';
import type { DisplayText, FieldOption, OptionLoader } from '../../shared/crud-page.types';
import type { Currency } from '../models';
import { listTimeZoneOptions } from './time-zones';

/** Wraps API-provided text that must never be translated. */
function literal(text: string): DisplayText {
  return { text };
}

/** Builds a `<select>` option loader returning record ids as values. */
export function idOptionLoader(service: CrudResource<any>, labelKey = 'name'): OptionLoader {
  return () =>
    service.list({ limit: 100 }).pipe(
      map((response) =>
        response.data.map((item: any) => ({
          value: String(item.id),
          // Record names are business data: shown exactly as entered.
          label: literal(String(item[labelKey] ?? item.id))
        }))
      )
    );
}

/**
 * Currency options are keyed by ISO code (what the API expects).
 *
 * `nameOf` lets the caller supply a locale-aware name (the formatting service
 * resolves it through `Intl.DisplayNames`); without it the API-provided name is
 * used verbatim. The ISO code itself is never translated.
 */
export function currencyOptionLoader(
  service: CrudResource<Currency>,
  nameOf?: (currency: Currency) => string | null
): OptionLoader {
  return () =>
    service.list({ limit: 100 }).pipe(
      map((response) =>
        response.data.map((currency) => ({
          value: currency.code,
          label: literal(formatCurrencyLabel(currency, nameOf))
        }))
      )
    );
}

function formatCurrencyLabel(
  currency: Currency,
  nameOf?: (currency: Currency) => string | null
): string {
  const localized = nameOf?.(currency) ?? null;
  const name = localized ?? currency.name;
  return name ? `${currency.code} — ${name}` : currency.code;
}

/**
 * Static option list helper.
 *
 * Labels accept `DisplayText`, so a caller can pass a catalog key
 * (`{ key: 'x.y' }`) instead of freezing a literal, and dynamic values can be
 * marked as literal with `literal()`.
 */
export function staticOptions(entries: Array<[string, DisplayText]>): FieldOption[] {
  return entries.map(([value, label]) => ({ value, label }));
}

/**
 * Record status options shared by every CRUD form.
 *
 * Defined once so the two values cannot drift between modules, and expressed as
 * catalog keys so they follow a runtime language switch.
 */
export function recordStatusOptions(): FieldOption[] {
  return staticOptions([
    ['active', { key: 'status.active' }],
    ['inactive', { key: 'status.inactive' }]
  ]);
}

/**
 * Marketplace codes. The code is the stable identifier the API stores; the label
 * is translated by code, except for the brand names, which stay as-is in every
 * language.
 */
export function marketplaceCodeOptions(): FieldOption[] {
  return staticOptions([
    ['amazon', { key: 'marketplaceCode.amazon' }],
    ['mercadolibre', { key: 'marketplaceCode.mercadolibre' }],
    ['own_store', { key: 'marketplaceCode.own_store' }]
  ]);
}

/**
 * Unit dimensions. The code is the value the API stores; the label is
 * translated so the same list serves the filter and the form.
 */
export function unitDimensionOptions(): FieldOption[] {
  return staticOptions([
    ['count', { key: 'unitDimension.count' }],
    ['mass', { key: 'unitDimension.mass' }],
    ['length', { key: 'unitDimension.length' }]
  ]);
}

/**
 * Time zones for a select.
 *
 * The list itself is deliberately locale-independent (see `time-zones.ts`): the
 * `offset · IANA id` label is technical, so it is wrapped as literal text rather
 * than translated.
 */
export function timeZoneOptions(): FieldOption[] {
  return listTimeZoneOptions().map((option) => ({
    value: option.value,
    label: literal(option.label)
  }));
}
