// @ts-nocheck
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signInAsStaff } from './support/stubSupabase';

/**
 * Accessibility gate for the operator side.
 *
 * `accessibility.spec.ts` only ever reached the storefront and the sign-in
 * screen, because everything past login needs Supabase. So the half of the app
 * staff use all day — POS, Kitchen, Express, Analytics, Settings — had never
 * been audited. The first run of this found white labels on vivid fills at
 * 1.6:1 on the two most-pressed buttons in the kitchen.
 *
 * Runs against the stubbed backend, so it needs the stub build:
 *   npm run test:a11y:admin
 */

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Gate on `serious` as well as `critical`, matching the storefront suite.
 */
function blocking(violations) {
  return violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
}

function describeViolations(violations) {
  return violations
    .map(
      (v) =>
        `[${v.impact}] ${v.id}: ${v.help}\n` +
        v.nodes
          .slice(0, 4)
          .map((n) => {
            const data = n.any?.[0]?.data;
            const ratio = data?.contrastRatio ? ` (${data.contrastRatio}:1 — ${data.fgColor} on ${data.bgColor})` : '';
            return `    ${n.html.slice(0, 140)}${ratio}`;
          })
          .join('\n')
    )
    .join('\n');
}

/**
 * `#/admin` is seven screens behind one route. Walking the routes alone only
 * ever audited whichever tab mounts by default, so Menu, Branding, Staff and
 * the 1,500-line Settings view were invisible to this sweep.
 */
const ADMIN_TABS = ['Analytics', 'Menu', 'Past orders', 'Branding', 'Staff', 'Settings'];

/**
 * Views that load data fire a toast, and a toast spends its first 400ms
 * animating up from opacity 0. Auditing during that window measures the
 * half-faded frame — the Express Panel reported its "New Order Received!"
 * toast at 1.03:1 when the settled element is 16:1. Wait for every running
 * animation to finish before analyzing.
 */
async function settleAnimations(page) {
  // Scoped to toasts on purpose: getAnimations() also returns the dashboard
  // heartbeat and the skeleton sweep, which loop forever and would never
  // report settled.
  await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll('.toast')).every(
          (t) => Number(getComputedStyle(t).opacity) === 1
        ),
      null,
      { timeout: 5_000 }
    )
    .catch(() => {});
}

const ADMIN_ROUTES: Array<[string, string]> = [
  ['POS', '#/pos'],
  ['Kitchen', '#/kitchen'],
  ['Express Panel', '#/pos-kitchen'],
  ['Tables', '#/tables'],
  ['Channels', '#/channels'],
  ['Analytics', '#/analytics'],
  ['Inventory', '#/inventory'],
  ['Customers', '#/customers'],
  ['Staff', '#/staff'],
  ['AI Center', '#/ai'],
  ['Orders', '#/orders'],
  ['Admin', '#/admin'],
  ['Help Center', '#/help'],
];

test.describe('operator views', () => {
  // One sign-in, then walk the routes: logging in per route costs a full
  // cloud hydration each time.
  test('have no critical or serious accessibility violations', async ({ page }) => {
    await signInAsStaff(page, expect);

    const failures: string[] = [];

    for (const [name, route] of ADMIN_ROUTES) {
      await page.goto(`/${route}`);
      await expect(page.locator('.app-sidebar, .sidebar')).toBeVisible();
      // Views hydrate from Dexie after mount; auditing immediately audits a
      // skeleton and misses the real controls.
      await page.waitForTimeout(1200);
      await settleAnimations(page);

      const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      const found = blocking(results.violations);
      if (found.length) {
        failures.push(`\n── ${name} (${route}) ──\n${describeViolations(found)}`);
      }
    }

    // Then the tabs inside #/admin.
    await page.goto('/#/admin');
    await expect(page.locator('.app-sidebar, .sidebar')).toBeVisible();
    for (const tab of ADMIN_TABS) {
      const button = page.getByRole('button', { name: tab, exact: true }).first();
      await expect(button, `Admin tab "${tab}" is missing — rename it here too`).toBeVisible();
      await button.click();
      await page.waitForTimeout(1200);
      await settleAnimations(page);

      const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      const found = blocking(results.violations);
      if (found.length) {
        failures.push(`\n── Admin › ${tab} ──\n${describeViolations(found)}`);
      }
    }

    expect(failures.join('\n'), failures.join('\n')).toEqual('');
  });
});
