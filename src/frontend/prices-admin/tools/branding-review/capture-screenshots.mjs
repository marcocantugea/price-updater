/**
 * One-off capture for the PrecioGo branding review.
 *
 * Not part of the test gate: it drives the running dev server and API, saves the
 * evidence a human has to look at, and logs what it found in the DOM.
 *
 *   cd src/frontend/prices-admin
 *   node tools/branding-review/capture-screenshots.mjs
 *
 * Preconditions: the Angular dev server on http://localhost:4200 and the API on
 * http://localhost:3000, with the development database seeded.
 */
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
// tools/branding-review -> tools -> prices-admin -> frontend -> src -> repo root
const repoRoot = resolve(here, '../../../../..');
const outputDir = resolve(repoRoot, 'agent/branding-review/captures');
const backendEnvPath = resolve(repoRoot, 'src/backend/prices-api/.env');

const WEB_URL = process.env.REVIEW_WEB_URL ?? 'http://localhost:4200';

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const values = {};
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 0) continue;
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[line.slice(0, separator).trim()] = value;
  }
  return values;
}

const env = readEnvFile(backendEnvPath);

async function describeLogo(page, label) {
  const report = await page.evaluate(() => {
    const svg = document.querySelector('app-preciogo-logo svg');
    const wrapper = svg?.parentElement;
    const host = svg?.closest('app-preciogo-logo');
    const box = svg?.getBoundingClientRect();
    const title = svg?.querySelector('title');
    return {
      found: Boolean(svg),
      viewBox: svg?.getAttribute('viewBox') ?? null,
      wrapperHeight: wrapper?.style.height ?? null,
      hostClasses: host?.getAttribute('class') ?? null,
      renderedWidth: box ? Math.round(box.width) : null,
      renderedHeight: box ? Math.round(box.height) : null,
      decorative: svg?.getAttribute('aria-hidden') ?? null,
      role: svg?.getAttribute('role') ?? null,
      labelledBy: svg?.getAttribute('aria-labelledby') ?? null,
      titleId: title?.getAttribute('id') ?? null,
      titleText: title?.textContent?.trim() ?? null,
      documentTitle: document.title,
      headerBackground: (() => {
        const header = host?.closest('header, .bg-header');
        return header ? getComputedStyle(header).backgroundColor : null;
      })(),
      hostBackground: (() => {
        const surface = host?.parentElement;
        return surface ? getComputedStyle(surface).backgroundColor : null;
      })()
    };
  });
  console.log(`--- ${label} ---`);
  console.log(JSON.stringify(report, null, 2));
  return report;
}

async function main() {
  if (!existsSync(backendEnvPath)) {
    console.warn(`No backend .env at ${backendEnvPath}; the authenticated capture will be skipped.`);
  }
  mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ channel: 'chrome' });
  const findings = {};

  // --- Login, desktop ------------------------------------------------------
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2
  });
  const page = await desktop.newPage();
  await page.goto(WEB_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('app-preciogo-logo svg');
  findings.loginDesktop = await describeLogo(page, 'login, 1440x900 @2x');
  await page.screenshot({
    path: resolve(outputDir, '01-login-desktop.png'),
    clip: { x: 0, y: 0, width: 1440, height: 620 }
  });
  // The brand block only, at its real size.
  const brandBox = await page.locator('.bg-header').first().boundingBox();
  if (brandBox) {
    await page.screenshot({
      path: resolve(outputDir, '02-login-brandblock.png'),
      clip: { x: brandBox.x, y: brandBox.y, width: brandBox.width, height: brandBox.height }
    });
  }

  // --- Login, mobile ------------------------------------------------------
  const mobile = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(WEB_URL, { waitUntil: 'networkidle' });
  await mobilePage.waitForSelector('app-preciogo-logo svg');
  await mobilePage.screenshot({
    path: resolve(outputDir, '03-login-mobile.png'),
    clip: { x: 0, y: 0, width: 412, height: 600 }
  });

  // --- Authenticated shell + sidebar --------------------------------------
  const email = env.SEED_GLOBAL_ADMIN_EMAIL;
  const password = env.SEED_GLOBAL_ADMIN_PASSWORD;
  if (email && password) {
    await page.goto(WEB_URL, { waitUntil: 'networkidle' });
    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.click('[data-testid="login-submit"]');
    try {
      await page.waitForSelector('app-preciogo-logo svg', { timeout: 20000 });
      await page.waitForSelector('[data-testid="sidebar"]', { timeout: 20000 });
      // Wait for the dashboard to settle so the capture is not a loading state.
      await page.waitForTimeout(2500);
      if (page.url().includes('dashboard') || (await page.locator('[data-testid="sidebar"]').count())) {
        findings.sidebar = await describeLogo(page, 'authenticated sidebar, 1440x900 @2x');
        const sidebar = await page.locator('[data-testid="sidebar"]').boundingBox();
        if (sidebar) {
          await page.screenshot({
            path: resolve(outputDir, '04-sidebar.png'),
            clip: {
              x: sidebar.x,
              y: sidebar.y,
              width: sidebar.width,
              height: Math.min(sidebar.height, 420)
            }
          });
        }
        await page.screenshot({ path: resolve(outputDir, '05-dashboard-full.png') });

        // Narrow viewport: the sidebar collapses behind the hamburger.
        await page.setViewportSize({ width: 420, height: 900 });
        await page.waitForTimeout(800);
        await page.screenshot({ path: resolve(outputDir, '06-narrow-topbar.png'), clip: { x: 0, y: 0, width: 420, height: 260 } });
      } else {
        findings.sidebar = { error: 'login did not reach the shell', url: page.url() };
        await page.screenshot({ path: resolve(outputDir, '04-login-failed.png') });
      }
    } catch (error) {
      findings.sidebar = { error: String(error), url: page.url() };
      await page.screenshot({ path: resolve(outputDir, '04-login-failed.png') });
    }
  } else {
    findings.sidebar = { error: 'seed credentials missing from backend .env' };
  }

  await browser.close();
  console.log('\n=== findings ===');
  console.log(JSON.stringify(findings, null, 2));
}

await main();
