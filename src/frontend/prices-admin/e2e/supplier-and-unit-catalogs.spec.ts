import { expect, test, type Page } from '@playwright/test';
import { globalAdmin } from './env';

/**
 * The two catalog administrations, driven through the browser.
 *
 * Fixtures and names carry a per-run suffix because a unit code is immutable and
 * a soft-deleted row keeps it: the test database accumulates records instead of
 * being wiped, so a constant value would only pass the first time.
 */
const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 100)}`.toUpperCase();
const UNIT_CODE = `E2E${stamp.slice(-4)}`;
const SUPPLIER_NAME = `Proveedor E2E ${stamp}`;

function uniqueSupplierName(): string {
  return `${SUPPLIER_NAME}-${Math.floor(Math.random() * 1000)}`;
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByTestId('login-submit').click();

  // `not.toHaveURL(/login/)` rather than a positive match: the guard redirects to
  // `/login?returnUrl=/dashboard`, which a loose `dashboard` pattern would accept.
  await expect(page).not.toHaveURL(/\/login/);
  // A global administrator with no company is sent on to the company picker, so
  // the sign-in flow is two navigations; letting it settle stops this helper from
  // racing the second one.
  await page.waitForLoadState('networkidle');
}

/**
 * Reaches Settings the way a user does: through its sidebar entry.
 *
 * Below Tailwind's `md` breakpoint the sidebar is off-canvas — still "visible" to
 * a locator, but not clickable — so the phone viewport goes straight to the URL.
 * A hard load is safe here because the sign-in navigation has already settled.
 */
async function openSettings(page: Page): Promise<void> {
  const wideEnoughForSidebar = (page.viewportSize()?.width ?? 0) >= 768;

  if (wideEnoughForSidebar) {
    await page.getByTestId('sidebar-nav').getByRole('link', { name: /configuraci/i }).click();
  } else {
    await page.goto('/settings');
  }

  await expect(page).toHaveURL(/\/settings/);
}

test.describe('supplier catalog (TEC-42)', () => {
  test('reaches the page from Settings and runs the CRUD journey', async ({ page }) => {
    const name = uniqueSupplierName();

    // The catalog is global, so its page belongs to the global administrator and
    // needs no company selected.
    await signIn(page, globalAdmin.email, globalAdmin.password);
    await openSettings(page);

    // The section is a navigation entry: one button, no table. The unit section
    // sits next to it, because both catalogs are global.
    const section = page.getByTestId('settings-suppliers');
    await expect(section).toBeVisible();
    await expect(section.locator('button')).toHaveCount(1);
    await expect(section.locator('table')).toHaveCount(0);
    await expect(page.getByTestId('settings-units')).toBeVisible();

    await page.getByTestId('manage-suppliers').click();
    await expect(page).toHaveURL(/\/suppliers/);

    // The page is bookmarkable on its own URL.
    await page.reload();
    await expect(page.getByTestId('create-button')).toBeVisible();

    await page.getByTestId('create-button').click();
    // The name limit is visible while typing, and the API stays the authority.
    await expect(page.locator('#field-name')).toHaveAttribute('maxlength', '150');
    await page.locator('#field-name').fill(name);
    await page.getByTestId('submit-button').click();

    const row = page.getByTestId('data-table').getByRole('row').filter({ hasText: name });
    await expect(row).toBeVisible();

    // A duplicate name is refused and the message lands on the name control.
    await page.getByTestId('create-button').click();
    await page.locator('#field-name').fill(name);
    await page.getByTestId('submit-button').click();
    await expect(page.getByTestId('field-error')).toContainText(/ya usa ese nombre/i);
    await page.getByTestId('modal-close').click();

    // Deactivating keeps the record (soft delete), so it leaves the listing.
    await row.getByTestId('delete-button').click();
    await page.getByTestId('confirm-delete-button').click();
    await expect(page.getByTestId('data-table').getByRole('row').filter({ hasText: name })).toHaveCount(0);
  });
});

test.describe('unit catalog (TEC-43)', () => {
  test('a global administrator creates and edits a unit from Settings', async ({ page }) => {
    await signIn(page, globalAdmin.email, globalAdmin.password);
    await openSettings(page);

    const section = page.getByTestId('settings-units');
    await expect(section).toBeVisible();
    await expect(section.locator('button')).toHaveCount(1);
    await expect(page.getByTestId('settings-suppliers')).toBeVisible();

    await page.getByTestId('manage-units-of-measure').click();
    await expect(page).toHaveURL(/\/units-of-measure/);

    await page.getByTestId('create-button').click();
    await expect(page.locator('#field-code')).toHaveAttribute('maxlength', '8');

    await page.locator('#field-code').fill(UNIT_CODE.toLowerCase());
    await page.locator('#field-name').fill('Unidad E2E');
    await page.locator('#field-symbol').fill('e2e');
    await page.locator('#field-dimension').selectOption('count');
    await page.locator('#field-decimals').fill('1');
    await page.getByTestId('submit-button').click();

    // The catalog is already longer than one page and the generic list orders by
    // code descending, so the new unit is found the way a user finds it: by
    // searching for its code.
    await expect(page.getByTestId('crud-form')).toHaveCount(0);
    await page.getByTestId('search-input').fill(UNIT_CODE);

    // The code is normalized to uppercase by the API, not by the client.
    const row = page.getByTestId('data-table').getByRole('row').filter({ hasText: UNIT_CODE });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Conteo');

    // The code is immutable: the control is locked and the API refuses a change.
    await row.getByTestId('edit-button').click();
    await expect(page.locator('#field-code')).toBeDisabled();
    await page.locator('#field-decimals').fill('2');
    await page.getByTestId('submit-button').click();

    // Only the decimals moved; the immutable code is still the same one.
    const editedRow = page.getByTestId('data-table').getByRole('row').filter({ hasText: UNIT_CODE });
    await expect(editedRow.locator('td').nth(4)).toHaveText('2');
    await expect(editedRow.locator('td').nth(0)).toHaveText(UNIT_CODE);
  });

  test('both global catalogs open with no company selected', async ({ page }) => {
    // The company selector lives in the desktop header; on a phone viewport it is
    // behind the collapsed menu, and this state is covered by the unit suite.
    test.skip(
      (page.viewportSize()?.width ?? 0) < 768,
      'the company selector is not reachable at a phone viewport'
    );

    await signIn(page, globalAdmin.email, globalAdmin.password);
    await openSettings(page);
    await expect(page.getByTestId('settings-units')).toBeVisible();

    // Clearing the header selector is the documented "no company" state, and the
    // page reacts to it without a reload.
    await page.getByTestId('company-selector').selectOption('');

    // Both global sections keep working, and the company-bound panel is gone
    // instead of showing a failed load.
    await expect(page.getByTestId('settings-units')).toBeVisible();
    await expect(page.getByTestId('settings-suppliers')).toBeVisible();
    await expect(page.getByTestId('currencies-table')).toHaveCount(0);

    await page.getByTestId('manage-suppliers').click();
    await expect(page).toHaveURL(/\/suppliers/);
    await expect(page.getByTestId('create-button')).toBeVisible();

    await openSettings(page);
    await page.getByTestId('manage-units-of-measure').click();
    await expect(page).toHaveURL(/\/units-of-measure/);
    await expect(page.getByTestId('create-button')).toBeVisible();
  });
});
