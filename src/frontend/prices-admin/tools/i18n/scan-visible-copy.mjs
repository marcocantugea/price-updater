// Final visible-string scan for the i18n migration (Phase 4 of
// agent/USER_LANGUAGE_I18N_PLAN.md).
//
// Fails when user-visible Spanish copy is still embedded in production source.
// English is also reported when it appears in a place that should be a catalog
// key, but the primary target is Spanish, since that is what used to be
// hard-coded.
//
// Usage: node tools/i18n/scan-visible-copy.mjs [--verbose]
//
// Exit code 0 = clean, 1 = violations found.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Frontend package root, derived from this script's location so it runs from anywhere. */
const FRONTEND_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROOT = join(FRONTEND_ROOT, 'src', 'app');
const VERBOSE = process.argv.includes('--verbose');

/** Files that are allowed to contain copy by design. */
const SKIPPED_PATH_PATTERNS = [
  /\.spec\.ts$/,
  /[\\/]testing[\\/]/, // unit-test fixtures and catalogs
  /\.model\.ts$/
];

/**
 * Reviewed exceptions. Each entry needs a reason: everything here is either
 * technical (never user-visible) or a documented fallback.
 *
 * Empty on purpose as of the Phase 4 inventory: the scan is clean without
 * exemptions. Add an entry only with a written justification.
 */
const WHITELIST = [];

/** Spanish words that make a string user-visible copy. */
const SPANISH_WORDS = [
  'Aceptar', 'Acciones', 'Activo', 'Activos', 'Actualizar', 'Agregar', 'Alcance', 'Anterior',
  'Aplicar', 'Cancelar', 'Cargando', 'Cerrar', 'Confirmar', 'Configuración', 'Contraseña',
  'Correo', 'Creado', 'Crear', 'Código', 'Descripción', 'Descuento', 'Detalle', 'Eliminar',
  'Empresa', 'Estado', 'Expirado', 'Exportar', 'Fecha', 'Filtrar', 'Guardando', 'Guardar',
  'Historial', 'Idioma', 'Inactivo', 'Inicio', 'Limpiar', 'Lista', 'Marketplaces', 'Moneda',
  'Motivo', 'Nombre', 'Notas', 'Nuevo', 'Nueva', 'Opcional', 'Página', 'Precio', 'Prioridad',
  'Producto', 'Reintentar', 'Requerido', 'Resumen', 'Revocado', 'Rol', 'Selecciona', 'Sesión',
  'Siguiente', 'Sin', 'Sistema', 'Todos', 'Todas', 'Total', 'Usuario', 'Valor', 'Vigente',
  'Volver', 'ninguno', 'ninguna', 'sólo', 'solo', 'seguro', 'puede', 'debe', 'obligatorio'
];

const ACCENTS = /[áéíóúüñÁÉÍÓÚÜÑ¿¡]/;
const SPANISH_WORD = new RegExp(`\\b(${SPANISH_WORDS.join('|')})\\b`, 'i');

/** Strings that are technical and must not be flagged. */
function isTechnical(value) {
  const trimmed = value.trim();
  if (trimmed === '') return true;

  return (
    // Catalog keys and dotted identifiers
    /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9_]+)+$/.test(trimmed) ||
    // CSS / Tailwind class lists
    /^[a-z0-9[\]#().,%/:+\-_\s!*>=&'"]+$/.test(trimmed) ||
    // URLs, paths, MIME types, data test ids, icon names
    /^(https?:|\/|\.\/|\.\.\/|@|data:|application\/|image\/)/.test(trimmed) ||
    // Path-like or interpolated technical strings (route/URL fragments, e.g.
    // `${this.baseUrl}/marketplaces`), which contain no spaces.
    (!/\s/.test(trimmed) && /[/$]/.test(trimmed)) ||
    /^[a-z0-9-]+$/.test(trimmed) ||
    // Interpolation-only, numeric, boolean or punctuation-only
    /^[\s\d.,:;'"`()\[\]{}|/\\*+\-_=%<>!?&~^$#@]*$/.test(trimmed) ||
    // Date/time/number format patterns and locale or currency codes
    /^(yyyy|dd|MM|HH|mm|ss|en-US|es-419|es-MX|UTC|GMT|MXN|USD|[A-Z]{3})$/.test(trimmed) ||
    // HTML/SVG fragments, selectors and query fragments
    /^[<>]/.test(trimmed) ||
    /^(GET|POST|PATCH|PUT|DELETE)$/.test(trimmed)
  );
}

/** Extracts string literals from TypeScript, skipping comments. */
function typescriptLiterals(source) {
  const literals = [];
  let index = 0;
  let line = 1;
  let state = 'code';
  let buffer = '';
  let startLine = 1;

  const push = () => {
    if (buffer !== '') literals.push({ value: buffer, line: startLine });
    buffer = '';
  };

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '\n') line += 1;

    switch (state) {
      case 'code':
        if (char === '/' && next === '/') { state = 'lineComment'; index += 2; continue; }
        if (char === '/' && next === '*') { state = 'blockComment'; index += 2; continue; }
        if (char === "'" ) { state = 'single'; startLine = line; index += 1; continue; }
        if (char === '"') { state = 'double'; startLine = line; index += 1; continue; }
        if (char === '`') { state = 'template'; startLine = line; index += 1; continue; }
        break;
      case 'lineComment':
        if (char === '\n') state = 'code';
        break;
      case 'blockComment':
        if (char === '*' && next === '/') { state = 'code'; index += 2; continue; }
        break;
      case 'single':
        if (char === '\\') { buffer += source[index + 1] ?? ''; index += 2; continue; }
        if (char === "'") { push(); state = 'code'; index += 1; continue; }
        buffer += char;
        break;
      case 'double':
        if (char === '\\') { buffer += source[index + 1] ?? ''; index += 2; continue; }
        if (char === '"') { push(); state = 'code'; index += 1; continue; }
        buffer += char;
        break;
      case 'template':
        if (char === '\\') { buffer += source[index + 1] ?? ''; index += 2; continue; }
        if (char === '`') { push(); state = 'code'; index += 1; continue; }
        buffer += char;
        break;
      default:
        break;
    }

    index += 1;
  }

  return literals;
}

/** Extracts text nodes and static attribute values from a template. */
function templateFragments(source) {
  const withoutComments = source.replace(/<!--[\s\S]*?-->/g, '');
  const fragments = [];
  let line = 1;

  for (const rawLine of withoutComments.split('\n')) {
    // Skip compiler directives and structural lines that carry no copy.
    if (!/^\s*$/.test(rawLine)) {
      // Text nodes between tags
      for (const match of rawLine.matchAll(/>([^<>{}]+)</g)) {
        fragments.push({ value: match[1], line });
      }
      // Static attributes with a literal value (not a binding)
      for (const match of rawLine.matchAll(/(?<![\[\]()*])\s([a-zA-Z-]+)="([^"{}]+)"/g)) {
        const [, name, value] = match;
        if (['class', 'viewBox', 'fill', 'stroke', 'stroke-width', 'd', 'xmlns', 'href', 'id', 'for', 'type', 'name', 'rel', 'target', 'autocomplete'].includes(name)) {
          continue;
        }
        fragments.push({ value, line });
      }
    }
    line += 1;
  }

  return fragments;
}

function isWhitelisted(file, value) {
  return WHITELIST.some(
    (entry) => file === entry.file && value.includes(entry.match)
  );
}

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (/\.(ts|html)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

const violations = [];
let scanned = 0;

for (const file of walk(ROOT)) {
  const relativeFile = relative(ROOT, file).split(sep).join('/');
  if (SKIPPED_PATH_PATTERNS.some((pattern) => pattern.test(file))) continue;

  scanned += 1;
  const source = readFileSync(file, 'utf8');
  const fragments = file.endsWith('.html')
    ? templateFragments(source)
    : typescriptLiterals(source);

  for (const fragment of fragments) {
    const value = fragment.value;
    if (isTechnical(value)) continue;
    if (!ACCENTS.test(value) && !SPANISH_WORD.test(value)) continue;
    if (isWhitelisted(relativeFile, value)) continue;

    violations.push({ file: relativeFile, line: fragment.line, value: value.trim().slice(0, 120) });
  }
}

console.log(`scanned ${scanned} production files`);

if (violations.length === 0) {
  console.log('OK: no embedded user-visible Spanish copy found');
  process.exit(0);
}

console.log(`\n${violations.length} possible visible-copy violation(s):\n`);
for (const violation of violations) {
  console.log(`  ${violation.file}:${violation.line}  ${JSON.stringify(violation.value)}`);
}

if (VERBOSE) {
  console.log('\nMove the copy into src/app/core/i18n/catalogs/*.json and reference it with { key } / | transloco.');
}

process.exit(1);
