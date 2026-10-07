/**
 * Renders the side-by-side asset comparison page to a PNG for review.
 *
 *   cd src/frontend/prices-admin
 *   node tools/branding-review/capture-comparison.mjs
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../../..');
const outputDir = resolve(repoRoot, 'agent/branding-review/captures');
const pagePath = resolve(here, 'asset-comparison.html');
const assetsBase = pathToFileURL(resolve(repoRoot, 'docs/branding/assets/') + '/').href;

mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({
  viewport: { width: 900, height: 1200 },
  deviceScaleFactor: 2
});
// The page is opened from file://, where relative asset paths are resolved
// against the document location. Pass absolute URLs instead.
page.on('requestfailed', (request) => {
  console.warn('request failed:', request.url(), request.failure()?.errorText);
});
await page.goto(pathToFileURL(pagePath).href, { waitUntil: 'domcontentloaded' });
// The page declares asset *names* in data attributes; resolving them here keeps
// `file://` path issues out of the HTML.
await page.evaluate(
  ({ base, referenceBase }) => {
    for (const img of document.querySelectorAll('img')) {
      const asset = img.getAttribute('data-asset');
      const reference = img.getAttribute('data-reference');
      if (asset) img.setAttribute('src', base + asset);
      else if (reference) img.setAttribute('src', referenceBase + reference);
    }
  },
  {
    base: assetsBase,
    referenceBase: pathToFileURL(resolve(repoRoot, 'docs/branding/reference/') + '/').href
  }
);
await page.waitForFunction(() =>
  Array.from(document.querySelectorAll('img')).every((img) => img.complete && img.naturalWidth > 0)
);
await page.screenshot({
  path: resolve(outputDir, '07-asset-comparison.png'),
  fullPage: true
});
await browser.close();
console.log('Wrote', resolve(outputDir, '07-asset-comparison.png'));
