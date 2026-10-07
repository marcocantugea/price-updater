export interface TimeZoneOption {
  value: string;
  /** Stable technical offset token (`UTC±hh:mm`), independent of the UI language. */
  offset: string;
  /** Display label: `offset · IANA id`. Both parts are technical, not translated. */
  label: string;
}

/**
 * Fallback list used when `Intl.supportedValuesOf('timeZone')` is unavailable.
 * Kept small and stable so the settings screen still works on older runtimes.
 */
const FALLBACK_TIME_ZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Chicago',
  'America/New_York',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Africa/Johannesburg',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland'
];

/**
 * Enumerates IANA time zones with their current UTC offset.
 *
 * DOCUMENTED TECHNICAL EXCEPTION: `Intl.DateTimeFormat` is pinned to `en-US`
 * here on purpose. The locale only shapes the offset token, and `en-US`
 * guarantees a stable `GMT±hh:mm` string that is then rendered as `UTC±hh:mm`.
 * Using the active locale would yield locale-specific tokens (`GMT+2`,
 * `GMT+02:00`, ...) and make the list order, and the persisted token, depend on
 * the UI language. The tenant time zone is an independent setting, so it must
 * not move when the user switches language.
 *
 * Everything surrounding this list (field label, help text) does come from the
 * catalogs; only the offset token and the IANA id are technical.
 */
export function listTimeZoneOptions(): TimeZoneOption[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  const values = new Set(['UTC', ...(intl.supportedValuesOf?.('timeZone') ?? FALLBACK_TIME_ZONES)]);

  return [...values]
    .map((value) => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: value,
        timeZoneName: 'longOffset'
      }).formatToParts(new Date());
      const offset = parts.find((part) => part.type === 'timeZoneName')?.value.replace('GMT', 'UTC') ?? 'UTC';
      return { value, offset, label: `${offset} · ${value}` };
    })
    // Sorted by the stable technical identifier, never by a localized label.
    .sort((left, right) => left.value.localeCompare(right.value));
}
