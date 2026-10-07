// Verifies that every catalog key referenced by source code actually exists in
// both catalogs. A missing key renders as a raw key in the UI, which the
// Spanish-copy scan cannot detect.
//
// Usage: node tools/i18n/check-keys.mjs
//
// Paths are derived from this script's own location, so the file works when the
// command is launched from the frontend package, the repository root, an IDE
// task or a CI runner.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = join(FRONTEND_ROOT, 'src', 'app');
const I18N = join(APP, 'core', 'i18n', 'catalogs');

const SKIP = [/\.spec\.ts$/, /[\\/]testing[\\/]/];

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|html)$/.test(entry) ? [full] : [];
  });
}

const catalogs = Object.fromEntries(
  ['es-419', 'en-US'].map((locale) => [
    locale,
    JSON.parse(readFileSync(join(I18N, `${locale}.json`), 'utf8'))
  ])
);

const has = (catalog, key) =>
  key
    .split('.')
    .reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), catalog) !== undefined;

/** Namespaces that belong to the catalogs; used to avoid matching other strings. */
const ROOTS = new Set(Object.keys(catalogs['es-419']));

const referenced = new Map();

for (const file of walk(APP)) {
  if (SKIP.some((pattern) => pattern.test(file))) continue;

  const relativeFile = relative(APP, file).split(sep).join('/');
  const source = readFileSync(file, 'utf8');

  // 'a.b.c' inside quotes or backticks
  for (const match of source.matchAll(/['"`]([a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_]+)+)['"`]/g)) {
    const key = match[1];
    if (ROOTS.has(key.split('.')[0])) {
      referenced.set(key, relativeFile);
    }
  }

  // Template-literal prefixes: `namespace.path.${code}`
  for (const match of source.matchAll(/`([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*\.)\$\{/g)) {
    const prefix = match[1];
    if (ROOTS.has(prefix.split('.')[0])) {
      // Dynamic: the suffix comes from an enum/status code. Verified per code below.
      referenced.set(`${prefix}*`, relativeFile);
    }
  }
}

const missing = [];
for (const [key, file] of referenced) {
  if (key.endsWith('*')) continue;
  for (const locale of Object.keys(catalogs)) {
    if (!has(catalogs[locale], key)) missing.push(`${locale}: ${key}  (${file})`);
  }
}

/** Dynamic prefixes must have at least one key, and are checked per known code. */
const DYNAMIC_CODES = {
  'status.': ['active', 'inactive', 'revoked', 'expired', 'vigente', 'system', 'user', 'api_key'],
  'discountType.': ['percentage', 'fixed'],
  'discountScope.': ['product', 'price_list', 'marketplace', 'base'],
  'historyReason.': ['create', 'update', 'delete'],
  'actorType.': ['user', 'api_key', 'system'],
  'marketplaceCode.': ['amazon', 'mercadolibre', 'own_store'],
  'exportStatus.': ['queued', 'processing', 'completed', 'failed', 'expired'],
  'exportFormat.': ['csv', 'json', 'txt']
};

/** True when the catalog has at least one string leaf under `prefix`. */
function hasAnyUnder(catalog, prefix) {
  const node = prefix
    .split('.')
    .filter(Boolean)
    .reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), catalog);

  if (node === undefined) return false;
  if (typeof node === 'string') return true;

  return Object.values(node).some((value) =>
    value !== null && typeof value === 'object' ? Object.keys(value).length > 0 : true
  );
}

for (const [prefix, source] of referenced) {
  if (!prefix.endsWith('*')) continue;

  const base = prefix.slice(0, -1);
  const codes = DYNAMIC_CODES[base];

  if (!codes) {
    // A dynamic prefix whose values come from the API (permission slugs, role
    // slugs): it cannot be enumerated from a fixed list, so the guarantee is
    // that the catalog covers the namespace at all. The generator that produces
    // those entries is the source of truth for the exact set.
    for (const locale of Object.keys(catalogs)) {
      if (!hasAnyUnder(catalogs[locale], base)) {
        missing.push(`${locale}: ${base}* is referenced but the catalog has no entries under it (${source})`);
      }
    }
    continue;
  }

  for (const locale of Object.keys(catalogs)) {
    for (const code of codes) {
      if (!has(catalogs[locale], `${base}${code}`)) {
        missing.push(`${locale}: ${base}${code}  (${source})`);
      }
    }
  }
}

console.log(`checked ${referenced.size} referenced key patterns`);

if (missing.length === 0) {
  console.log('OK: every referenced catalog key exists in both locales');
  process.exit(0);
}

console.log(`\n${missing.length} missing catalog key(s):\n`);
for (const entry of missing) console.log(`  ${entry}`);
process.exit(1);
