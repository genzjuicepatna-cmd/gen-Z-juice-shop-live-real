// @ts-nocheck
/**
 * Visual baseline capture — Phase 0 of the UI redesign.
 *
 * This is not an assertion suite. The redesign is *supposed* to change every
 * pixel; what matters is that each change was intended. These shots are the
 * "before" half of that review, captured across the same device matrix the
 * app ships to.
 *
 * Excluded from `npm run test:e2e` (see playwright.config.js testIgnore) so a
 * capture run never gates CI.
 *
 *   npm run visual:baseline    # before the redesign  -> __baseline__/
 *   npm run visual:after       # after                -> __after__/
 *
 * Authenticated admin/POS surfaces are covered by ADMIN_SURFACES below, but
 * staff login is validated against Supabase (see services/auth.js), so they
 * are skipped unless a test project is configured:
 *
 *   E2E_STAFF_EMAIL=... E2E_STAFF_PASSWORD=... npm run visual:baseline
 */

import { test, expect } from '@playwright/test';
import path from 'node:path';
import { signInAsStaff } from './support/stubSupabase';

const OUT = process.env.VISUAL_OUT || '__baseline__';
const STAFF_EMAIL = process.env.E2E_STAFF_EMAIL;
const STAFF_PASSWORD = process.env.E2E_STAFF_PASSWORD;

function shotPath(testInfo, name: string) {
  return path.join(testInfo.project.name.replace(/\s+/g, '-'), `${name}.png`);
}

/**
 * @param scrollFirst Menu art is loading="lazy" and a fullPage screenshot does
 *   not scroll, so everything below the fold captured as an empty tint. Walking
 *   the page triggers it. Pass false for the JavaScript-disabled pass: there is
 *   no lazy loading to trigger there, and evaluate() cannot run.
 */
async function capture(page, testInfo, name: string, { scrollFirst = true } = {}) {
  if (scrollFirst) {
    await page.evaluate(async () => {
      const step = window.innerHeight;
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 40));
      }
      window.scrollTo(0, 0);
    });
  }
  await page.waitForTimeout(300); // let spring transitions settle
  await page.screenshot({
    path: path.join('tests', 'e2e', OUT, shotPath(testInfo, name)),
    fullPage: true,
    animations: 'disabled',
  });
}

/** Storefront routes that exist as real HTML in the static export. */
const STATIC_ROUTES = [
  ['static-home', '/'],
  ['static-menu', '/menu'],
  ['static-offers', '/offers'],
  ['static-about', '/about'],
  ['static-catering', '/catering'],
  ['static-support', '/support'],
];

/** Customer SPA pages, addressed by the hash router. */
const SPA_PAGES = [
  ['spa-home', '#/self-order'],
  ['spa-offers', '#/self-order?page=offers'],
  ['spa-about', '#/self-order?page=about'],
  ['spa-catering', '#/self-order?page=catering'],
  ['spa-support', '#/self-order?page=support'],
  ['spa-account', '#/self-order?page=account'],
];

/** Authenticated staff surfaces. Captured only when credentials are supplied. */
const ADMIN_SURFACES = [
  ['admin-pos', '#/pos'],
  ['admin-kitchen', '#/kitchen'],
  ['admin-express', '#/pos-kitchen'],
  ['admin-tables', '#/tables'],
  ['admin-channels', '#/channels'],
  ['admin-analytics', '#/analytics'],
  ['admin-inventory', '#/inventory'],
  ['admin-customers', '#/customers'],
  ['admin-staff', '#/staff'],
  ['admin-ai', '#/ai'],
  ['admin-orders', '#/orders'],
  ['admin-admin', '#/admin'],
  ['admin-help', '#/help'],
];

test.describe('visual baseline', () => {
  test('static export, JavaScript disabled', async ({ browser }, testInfo) => {
    // The pre-rendered shell is what crawlers and failed-JS visitors get. It
    // has to be captured with JS off or the SPA overwrites it on boot.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    for (const [name, route] of STATIC_ROUTES) {
      await page.goto(route, { waitUntil: 'load' });
      await capture(page, testInfo, name, { scrollFirst: false });
    }

    await context.close();
  });

  test('customer storefront SPA', async ({ page }, testInfo) => {
    for (const [name, route] of SPA_PAGES) {
      await page.goto(`/${route}`);
      await expect(page.locator('.storefront-shell')).toBeVisible();
      await capture(page, testInfo, name);
    }
  });

  test('customer storefront interactions', async ({ page }, testInfo) => {
    await page.goto('/#/self-order');

    // The shell paints before the catalogue is read out of Dexie. Waiting on
    // `.storefront-shell` alone races the menu and captures an empty page.
    await expect(page.locator('.store-menu-item-open').first()).toBeVisible({ timeout: 20_000 });

    await page.locator('.store-menu-item-open').first().click();
    const itemSheet = page.locator('.aether-drawer-sheet');
    await expect(itemSheet).toBeVisible();
    await capture(page, testInfo, 'spa-item-detail');

    // Assert the sheet actually closed — leaving it open would silently make
    // the next shot a picture of this drawer instead of the cart.
    await page.keyboard.press('Escape');
    await expect(itemSheet).toHaveCount(0);

    // The cart affordance only exists once the cart has a line in it, and it
    // differs by viewport by design: `#btn-view-cart` is the desktop floating
    // control (labelled "N items in cart, total …"), hidden under 800px where
    // the bottom navigation's "Cart N" button owns the cart instead. Both are
    // in the DOM at every width, so match either and take the visible one.
    await page.getByRole('button', { name: /^Add .+ to cart$/ }).first().click();
    const viewCart = page
      .locator('#btn-view-cart')
      .or(page.getByRole('button', { name: /^Cart \d+$/ }))
      .filter({ visible: true })
      .first();
    await expect(viewCart).toBeVisible();
    await capture(page, testInfo, 'spa-cart-affordance');

    // Despite the component name, the cart renders as a full checkout page,
    // not a drawer.
    await viewCart.click();
    await expect(page.locator('.store-checkout-shell')).toBeVisible();
    await capture(page, testInfo, 'spa-cart');
  });

  test('sign-in screens', async ({ page }, testInfo) => {
    await page.goto('/#/pos');
    await expect(page.locator('.login-screen')).toBeVisible();
    await capture(page, testInfo, 'login-staff');
  });

  test('authenticated admin surfaces', async ({ page }, testInfo) => {
    // Real credentials if supplied, otherwise the stubbed backend. Without one
    // of the two, every operator view is unreachable and unreviewable.
    if (STAFF_EMAIL && STAFF_PASSWORD) {
      await page.goto('/#/pos');
      await page.getByLabel('Account email').fill(STAFF_EMAIL);
      await page.getByLabel('Password').fill(STAFF_PASSWORD);
      await page.getByRole('button', { name: /Authorize access/i }).click();
      await expect(page.locator('.app-sidebar, .sidebar')).toBeVisible({ timeout: 20_000 });
    } else {
      await signInAsStaff(page, expect);
    }

    for (const [name, route] of ADMIN_SURFACES) {
      await page.goto(`/${route}`);
      // Views differ wildly in what they render; the sidebar is the one
      // constant, and a missing view surfaces as an obviously empty shot.
      await expect(page.locator('.app-sidebar, .sidebar')).toBeVisible();
      await capture(page, testInfo, name);
    }
  });
});
