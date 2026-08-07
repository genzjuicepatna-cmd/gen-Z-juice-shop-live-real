// @ts-nocheck
/**
 * Stub the Supabase backend so the authenticated staff surfaces can be opened
 * in a test browser.
 *
 * Every admin view sits behind cloud auth: `services/auth.js` signs in through
 * Supabase, then requires an ACTIVE row in `staff_memberships` before the
 * router will mount anything. Without a project, the entire operator side of
 * the app — POS, Kitchen, Express, Analytics, Settings — cannot be rendered,
 * reviewed or screenshotted at all.
 *
 * This intercepts the network instead of touching application code. Nothing
 * here weakens the real guard: `test_logged_in.spec.ts` still asserts that
 * forged localStorage flags cannot bypass it, and that test does not use this
 * helper. What is stubbed is the *server's answers*, which is the one thing a
 * sandbox cannot provide.
 *
 * Requires the app to be built against the stub origin:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=https://stub.supabase.co \
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=stub-anon-key npm run build
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Read rather than `import ... from '*.json'`: Playwright's ESM loader rejects
// a bare JSON import without an import attribute, and the attribute syntax is
// not accepted by every runner this file is loaded from.
const snapshot = JSON.parse(
  readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../src/data/menu-snapshot.json'),
    'utf8'
  )
);

export const STUB_SUPABASE_URL = 'https://stub.supabase.co';
export const STUB_SUPABASE_KEY = 'stub-anon-key';

const USER_ID = '00000000-0000-4000-8000-000000000001';

/**
 * The catalogue, in the wire shape `cloudDb.mapCategoryToLocal` /
 * `mapItemToLocal` expect (snake_case columns).
 *
 * Staff startup is cloud-first: `cloudHasData()` decides whether to hydrate
 * from Supabase or fall back to the local seed. Answering with an empty
 * catalogue leaves POS, Kitchen and Express rendering their empty states,
 * which is not a useful thing to design against. Serving the committed
 * snapshot gives every operator view the same menu the storefront shows.
 */
function catalogueRows(storeId: string) {
  const categories = snapshot.categories.map((category, index) => ({
    id: category.id,
    store_id: storeId,
    name: category.name,
    icon: category.icon || '',
    sort_order: index + 1,
    is_active: true,
  }));

  const items = snapshot.categories.flatMap((category) =>
    category.items.map((item, index) => ({
      id: item.id,
      store_id: storeId,
      category_id: category.id,
      name: item.name,
      price: item.price,
      is_available: true,
      is_veg: item.isVeg,
      sort_order: index + 1,
      image_url: item.imageUrl || '',
    }))
  );

  return { categories, items };
}

/**
 * A few live tickets so the Kitchen board, Express panel and Orders view have
 * something to lay out. The Kitchen board only renders confirmed / preparing /
 * ready, so the statuses here span exactly those three columns, and the
 * timestamps are staggered so the age colour-coding has a range to show.
 */
function orderRows(storeId: string) {
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
  const line = (name: string, quantity: number, price: number) => ({
    itemName: name,
    name,
    quantity,
    price,
    total: price * quantity,
  });

  return [
    {
      id: 9001, store_id: storeId, order_number: 'PLP-1043',
      client_order_id: 'stub-9001', idempotency_key: 'idem-9001',
      updated_at: new Date().toISOString(), customer_id: null, display_token: '43',
      type: 'takeaway', status: 'confirmed', channel: 'pos', payment_status: 'paid',
      payment_method: 'upi', customer_name: 'Aarav', customer_phone: '9999911111',
      items: [line('Orange Juice (Large)', 2, 30), line('Lemon Water (Large)', 1, 20)],
      subtotal: 230, tax: 11.5, total: 241.5, created_at: minutesAgo(2),
    },
    {
      id: 9002, store_id: storeId, order_number: 'PLP-1044',
      client_order_id: 'stub-9002', idempotency_key: 'idem-9002',
      updated_at: new Date().toISOString(), customer_id: null, display_token: '44',
      type: 'delivery', status: 'confirmed', channel: 'online', payment_status: 'unpaid',
      payment_method: 'cod', customer_name: 'Priya', customer_phone: '9999922222',
      delivery_address: 'Sandalpur Road, Kumhrar',
      items: [line('Mango Shake (XL)', 1, 70), line('Anar Juice (Large)', 1, 80)],
      subtotal: 320, tax: 16, total: 336, created_at: minutesAgo(9),
    },
    {
      id: 9003, store_id: storeId, order_number: 'PLP-1045',
      client_order_id: 'stub-9003', idempotency_key: 'idem-9003',
      updated_at: new Date().toISOString(), customer_id: null, display_token: '45',
      type: 'dinein', status: 'preparing', channel: 'pos', payment_status: 'paid',
      payment_method: 'cash', customer_name: 'Vikram',
      items: [line('Cold Coffee (XL)', 2, 90), line('Lassi (Large)', 1, 30)],
      subtotal: 380, tax: 19, total: 399, created_at: minutesAgo(16),
    },
    {
      id: 9004, store_id: storeId, order_number: 'PLP-1046',
      client_order_id: 'stub-9004', idempotency_key: 'idem-9004',
      updated_at: new Date().toISOString(), customer_id: null, display_token: '46',
      type: 'takeaway', status: 'preparing', channel: 'pos', payment_status: 'paid',
      payment_method: 'upi', customer_name: 'Neha',
      items: [line('Virgin Mojito (Large)', 1, 50), line('Oreo Shake (XL)', 2, 100)],
      subtotal: 290, tax: 14.5, total: 304.5, created_at: minutesAgo(27),
    },
    {
      id: 9005, store_id: storeId, order_number: 'PLP-1047',
      client_order_id: 'stub-9005', idempotency_key: 'idem-9005',
      updated_at: new Date().toISOString(), customer_id: null, display_token: '47',
      type: 'takeaway', status: 'ready', channel: 'pos', payment_status: 'paid',
      payment_method: 'cash', customer_name: 'Kabir',
      items: [line('Mix Juice (XL)', 3, 90)],
      subtotal: 270, tax: 13.5, total: 283.5, created_at: minutesAgo(34),
    },
  ];
}

/** @param role one of STAFF_ROLES; drives which nav items and routes appear. */
export async function stubSupabase(page, { role = 'owner', storeId = 'trending-juice' } = {}) {
  const user = {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'owner@trendingjuice.test',
    app_metadata: { role, store_id: storeId, is_active: true, provider: 'email' },
    user_metadata: { name: 'Test Owner' },
    created_at: new Date().toISOString(),
  };

  const session = {
    access_token: 'stub-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'stub-refresh-token',
    user,
  };

  const membership = [
    { role, staff_id: 1, store_id: storeId, is_active: true },
  ];

  const staff = [
    {
      id: 1,
      auth_user_id: USER_ID,
      store_id: storeId,
      name: 'Test Owner',
      role,
      allow_express: true,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const { categories, items } = catalogueRows(storeId);
  const orders = orderRows(storeId);

  const json = (route, body, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(body),
    });

  await page.route(`${STUB_SUPABASE_URL}/**`, async (route) => {
    const url = route.request().url();

    if (url.includes('/auth/v1/token')) return json(route, session);
    if (url.includes('/auth/v1/user')) return json(route, user);
    if (url.includes('/auth/v1/logout')) return json(route, {});
    if (url.includes('/rest/v1/staff_memberships')) return json(route, membership);
    if (url.includes('/rest/v1/staff')) return json(route, staff);
    if (url.includes('/rest/v1/menu_categories')) return json(route, categories);
    if (url.includes('/rest/v1/menu_items')) return json(route, items);
    if (url.includes('/rest/v1/orders')) return json(route, orders);

    // Every other table answers empty. Orders, inventory and customers vary
    // per store, so the views must render their own empty states rather than
    // depending on canned rows.
    if (url.includes('/rest/v1/')) return json(route, []);

    return json(route, {});
  });

  // supabase-js opens a realtime socket; there is nothing to serve it.
  await page.route('ws://**', (route) => route.abort());
  await page.route('wss://**', (route) => route.abort());
}

/** Sign in through the real form so the app's own auth path is exercised. */
export async function signInAsStaff(page, expect, options = {}) {
  await stubSupabase(page, options);
  await page.goto('/#/pos');
  await page.getByLabel('Account email').fill('owner@trendingjuice.test');
  await page.getByLabel('Password').fill('stub-password');
  await page.getByRole('button', { name: /Authorize access/i }).click();
  await expect(page.locator('.app-sidebar, .sidebar')).toBeVisible({ timeout: 20_000 });
}
