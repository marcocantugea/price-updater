import { expect, test, type Page } from '@playwright/test';
import { apiUrl, tenantAdmin } from './env';

/**
 * Builds a valid EAN-13 that is unique to this run.
 *
 * A constant barcode cannot work here. Barcodes are never released, the test
 * database deliberately accumulates products (it is prepared, not wiped), and the
 * two viewport projects run in separate workers — so a fixed value would collide
 * with the product an earlier run or the other project created, and the suite
 * would only pass the first time.
 */
function uniqueEan13(): string {
  const data = `750${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 10)}`
    .padEnd(12, '0')
    .slice(0, 12);

  let weighted = 0;
  for (let index = 0; index < data.length; index += 1) {
    weighted += Number(data[index]) * ((data.length - index) % 2 === 1 ? 3 : 1);
  }

  return `${data}${(10 - (weighted % 10)) % 10}`;
}

/** Free barcodes for this run, plus one the seeds already gave to another product. */
const EAN_13_NEW = uniqueEan13();
const EAN_13_NEW_2 = uniqueEan13();
const EAN_13_TAKEN = '7501234567893';

/**
 * The tenant-admin journey, driven through the browser.
 *
 * Fixtures are created through the API and the journey is driven through the UI.
 * That split is deliberate: creating a product through the UI would only add a
 * second, unrelated CRUD journey in front of the one under test, and a timestamped
 * SKU keeps repeated runs and the two viewport projects from colliding.
 */
test.describe('product specifications', () => {
  let productId = '';
  let sku = '';
  /** A second, untouched product, so the conflict case shares no state with the journey. */
  let conflictProductId = '';
  let conflictSku = '';
  let authorization = '';

  test.beforeAll(async ({ request }) => {
    const stamp = `${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`;
    sku = `E2E-${stamp}`;
    conflictSku = `E2E-CONFLICT-${stamp}`;

    const login = await request.post(`${apiUrl}/auth/login`, {
      data: { email: tenantAdmin.email, password: tenantAdmin.password }
    });
    expect(login.ok(), 'the seeded tenant admin can sign in through the API').toBeTruthy();
    authorization = `Bearer ${(await login.json()).accessToken}`;

    for (const [target, targetSku] of [
      ['primary', sku],
      ['conflict', conflictSku]
    ] as const) {
      const created = await request.post(`${apiUrl}/products`, {
        headers: { authorization, 'content-type': 'application/json' },
        data: {
          sku: targetSku,
          name: `Producto E2E ${targetSku}`,
          basePrice: 25,
          currencyCode: 'MXN',
          status: 'active'
        }
      });
      expect(created.ok(), `the ${target} fixture product is created`).toBeTruthy();

      const id = (await created.json()).id;
      if (target === 'primary') productId = id;
      else conflictProductId = id;
    }
  });

  async function signIn(page: Page): Promise<void> {
    await page.goto('/login');
    await page.locator('#email').fill(tenantAdmin.email);
    await page.locator('#password').fill(tenantAdmin.password);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/dashboard/);
  }

  /** Reaches the page the way a user does: through the Products row action. */
  async function openSpecification(page: Page, targetId: string, targetSku: string): Promise<void> {
    await page.goto('/products');

    const row = page.getByRole('row').filter({ hasText: targetSku });
    await row.getByTestId('row-action').first().click();

    await expect(page).toHaveURL(new RegExp(`/products/${targetId}/specification`));
  }

  test('captures the aggregate, survives a reload, and edits a second presentation', async ({ page }) => {
    await signIn(page);
    await openSpecification(page, productId, sku);

    // A product nobody has captured yet shows the empty state — not a 404, and
    // not a blank page.
    await expect(page.getByText(/nada capturado/i)).toBeVisible();

    await page.getByTestId('specification-edit').click();

    // Identity. The brand control queries the API per typed term.
    await page.getByTestId('specification-brand').fill('Acme');
    await page.getByTestId('specification-brand-option').first().click();
    await page.locator('input[formcontrolname="model"]').fill('E2E-2026');

    // Measurements. Only the dimension's units are offered, so a length unit is
    // not even selectable for weight.
    await page.getByTestId('measurement-weight-value').fill('1.25');
    await page.getByTestId('measurement-weight-unit').selectOption('KG');
    await page.getByTestId('measurement-length-value').fill('30');
    await page.getByTestId('measurement-length-unit').selectOption('CM');

    // One presentation with one barcode. The fixture product starts with none, so
    // the editor only exists after adding one — which is also the behaviour a
    // first-time user meets.
    await page.getByTestId('add-presentation').click();
    await page.getByTestId('presentation-name').first().fill('Caja de 12');
    await page.getByTestId('presentation-quantity').first().fill('12');
    await page.getByTestId('presentation-unit').first().selectOption('EA');
    await page.getByTestId('add-identifier').first().click();
    await page.getByTestId('identifier-value').first().fill(EAN_13_NEW);

    // A supplier chip.
    await page.getByRole('button', { name: 'Distribuidora Norte' }).click();

    await page.getByTestId('specification-save').click();

    // Back to the summary, showing exactly what was captured.
    await expect(page.getByTestId('specification-edit')).toBeVisible();
    await expect(page.locator('article')).toHaveCount(1);
    await expect(page.getByText('Caja de 12')).toBeVisible();
    await expect(page.getByText('1.25 kg')).toBeVisible();
    await expect(page.getByText(EAN_13_NEW)).toBeVisible();
    await expect(page.getByText('Distribuidora Norte')).toBeVisible();

    // The page is bookmarkable, so a plain reload must show the same thing.
    await page.reload();
    await expect(page.getByText('Caja de 12')).toBeVisible();
    await expect(page.getByText('1.25 kg')).toBeVisible();

    // Edit again and add a second presentation with its own barcode.
    await page.getByTestId('specification-edit').click();
    await page.getByTestId('add-presentation').click();

    await page.getByTestId('presentation-name').nth(1).fill('Unidad');
    await page.getByTestId('presentation-quantity').nth(1).fill('1');
    await page.getByTestId('presentation-unit').nth(1).selectOption('EA');
    await page.getByTestId('add-identifier').nth(1).click();
    await page.getByTestId('identifier-value').nth(1).fill(EAN_13_NEW_2);

    await page.getByTestId('specification-save').click();

    // Both presentations survive, so the replacement kept the echoed child id.
    await expect(page.locator('article')).toHaveCount(2);
    await expect(page.getByText(EAN_13_NEW_2)).toBeVisible();
    await expect(page.getByText(EAN_13_NEW)).toBeVisible();
  });

  test('reports a barcode owned by another product and stays in the editor', async ({ page }) => {
    // `EAN_13_TAKEN` is owned by the seeded `SKU-DEMO-001`, so the conflict is
    // real and needs no fixture of its own. Barcodes are never released, so the
    // seeded owner is a stable, deterministic counterpart.
    await signIn(page);
    await openSpecification(page, conflictProductId, conflictSku);
    await page.getByTestId('specification-edit').click();

    // This product starts empty, so the only barcode in the form is the one that
    // already belongs to the seeded `SKU-DEMO-001`. Nothing here depends on the
    // order of rows in another product's aggregate.
    await page.getByTestId('add-presentation').click();
    await page.getByTestId('presentation-name').first().fill('Duplicada');
    await page.getByTestId('presentation-quantity').first().fill('1');
    await page.getByTestId('presentation-unit').first().selectOption('EA');
    await page.getByTestId('add-identifier').first().click();
    await page.getByTestId('identifier-value').first().fill(EAN_13_TAKEN);
    await page.getByTestId('specification-save').click();

    // The 409 is bound to the offending field, and the editor stays open so the
    // user does not lose the work they were doing. `.first()` because the same
    // copy also appears in the screen-level banner.
    await expect(page.getByTestId('specification-save')).toBeVisible();
    await expect(page.getByText(/ya está en uso en esta empresa/i).first()).toBeVisible();
  });

  test('keeps the aggregate usable at a phone viewport', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chrome', 'the responsive layout is what this checks');

    await signIn(page);
    await openSpecification(page, productId, sku);

    // The page loads and its actions are reachable without horizontal scrolling.
    await expect(page.getByTestId('specification-edit')).toBeVisible();

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(overflows, 'the page does not scroll sideways on a phone').toBe(false);
  });
});
