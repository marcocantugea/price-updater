/**
 * Temporary analysis: compare the supplied reference's composition with the
 * sidebar asset the application renders.
 *
 * The reference is measured from its pixels. The sidebar asset is measured from
 * its own markup plus the browser's text metrics, which avoids the canvas
 * restrictions that block reading a `file://` SVG back out.
 *
 *   cd src/frontend/prices-admin
 *   node tools/branding-review/measure-proportions.mjs
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../../..');
const referenceBase64 = readFileSync(
  resolve(repoRoot, 'docs/branding/reference/preciogo-logo-white-source.jfif')
).toString('base64');

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 3400, height: 1600 } });
await page.goto('about:blank');

const reference = await page.evaluate(async (base64) => {
  const image = new Image();
  image.src = `data:image/jpeg;base64,${base64}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);

  const isBackground = (i) => data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235;
  const columns = new Array(width).fill(false);
  let minY = height;
  let maxY = -1;

  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      if (!isBackground((y * width + x) * 4)) {
        columns[x] = true;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const minX = columns.indexOf(true);
  const maxX = columns.lastIndexOf(true);
  let runStart = -1;
  let gap = { start: minX, length: 0 };
  for (let x = minX; x <= maxX; x += 1) {
    if (!columns[x]) {
      if (runStart < 0) runStart = x;
    } else if (runStart >= 0) {
      if (x - runStart > gap.length) gap = { start: runStart, length: x - runStart };
      runStart = -1;
    }
  }

  const band = (x0, x1) => {
    let top = height;
    let bottom = -1;
    for (let x = x0; x <= x1; x += 1) {
      for (let y = 0; y < height; y += 1) {
        if (!isBackground((y * width + x) * 4)) {
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
    }
    return { height: bottom - top + 1 };
  };

  const wordX0 = gap.start + gap.length;
  return {
    ink: { width: maxX - minX + 1, height: maxY - minY + 1 },
    markWidth: gap.start - minX,
    wordmarkWidth: maxX - wordX0 + 1,
    wordmarkHeight: band(wordX0, maxX).height,
    markHeight: band(minX, gap.start - 1).height,
    gap: gap.length
  };
}, referenceBase64);

// Sidebar asset text metrics, measured in the browser at its declared font size.
const sidebarText = await page.evaluate(() => {
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', '0 0 172 44');
  svg.setAttribute('width', '172');
  svg.setAttribute('height', '44');
  const make = (x, text) => {
    const node = document.createElementNS(svgNs, 'text');
    node.setAttribute('x', String(x));
    node.setAttribute('y', '31');
    node.setAttribute('font-family', 'Arial, Helvetica, sans-serif');
    node.setAttribute('font-size', '23');
    node.setAttribute('font-weight', '700');
    node.setAttribute('letter-spacing', '-.7');
    node.textContent = text;
    svg.appendChild(node);
    return node;
  };
  const precio = make(47, 'Precio');
  const go = make(119, 'Go');
  document.body.appendChild(svg);
  const precioBox = precio.getBoundingClientRect();
  const goBox = go.getBoundingClientRect();
  return {
    priceStart: 47,
    precioEnd: precioBox.right,
    goStart: goBox.left,
    goEnd: goBox.right,
    glyphHeight: 23
  };
});

const sidebar = {
  inkWidth: 172,
  inkHeight: 44,
  // The symbol is scaled to a 40-unit tall box and the artwork spans x=2..~44.
  markWidth: 42,
  wordmarkWidth: sidebarText.goEnd - sidebarText.priceStart,
  wordmarkHeight: sidebarText.glyphHeight,
  gap: sidebarText.priceStart - 42
};

const pct = (value) => `${(value * 100).toFixed(1)}%`;
const toUnits = (value) => value * (44 / reference.ink.height);

console.log('--- supplied reference ---');
console.log('ink size               :', `${reference.ink.width} x ${reference.ink.height} px`);
console.log('mark width             :', reference.markWidth, 'px =', toUnits(reference.markWidth).toFixed(1), 'units at 44 tall');
console.log('wordmark width         :', reference.wordmarkWidth, 'px =', toUnits(reference.wordmarkWidth).toFixed(1), 'units');
console.log('wordmark height        :', reference.wordmarkHeight, 'px =', toUnits(reference.wordmarkHeight).toFixed(1), 'units');
console.log('gap mark -> wordmark   :', reference.gap, 'px =', toUnits(reference.gap).toFixed(1), 'units');

console.log('\n--- sidebar asset (units of its own 172 x 44 viewBox) ---');
console.log('mark width             :', sidebar.markWidth);
console.log('wordmark width         :', sidebar.wordmarkWidth.toFixed(1), `(x=${sidebarText.priceStart} .. ${sidebarText.goEnd.toFixed(1)})`);
console.log('wordmark height        :', sidebar.wordmarkHeight, '(font-size)');
console.log('gap mark -> wordmark   :', sidebar.gap);
console.log('space between words    :', (sidebarText.goStart - sidebarText.precioEnd).toFixed(2));

console.log('\n--- scale-independent shares of ink width ---');
console.log('metric                  reference    sidebar');
console.log('mark width share      ', pct(reference.markWidth / reference.ink.width).padStart(10), pct(sidebar.markWidth / sidebar.inkWidth).padStart(10));
console.log('wordmark width share  ', pct(reference.wordmarkWidth / reference.ink.width).padStart(10), pct(sidebar.wordmarkWidth / sidebar.inkWidth).padStart(10));
console.log('gap share             ', pct(reference.gap / reference.ink.width).padStart(10), pct(sidebar.gap / sidebar.inkWidth).padStart(10));

console.log('\n--- wordmark height as a share of ink height ---');
console.log('reference             :', pct(reference.wordmarkHeight / reference.ink.height));
console.log('sidebar               :', pct(sidebar.wordmarkHeight / sidebar.inkHeight));

await browser.close();
