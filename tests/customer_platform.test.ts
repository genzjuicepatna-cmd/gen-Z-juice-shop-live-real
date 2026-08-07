// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCustomerFavoritesFromOrders, FALLBACK_OFFERS, getOrderTrackingState, RETENTION_PREFERENCES } from '../src/services/customerPlatform';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');

/**
 * The `customer_offers` rows the migrations leave behind, in filename order so
 * later migrations win — which is how Postgres will see them.
 *
 * Reads the SQL rather than the database so the guard runs in plain `node
 * --test` with no Supabase. It only understands the literal-tuple form the
 * seeds actually use; a seed written some other way is skipped rather than
 * mis-parsed, so this catches regressions in the existing style without
 * claiming to be a SQL parser.
 */
function readSeededOffers() {
  const offers = new Map();
  const unquote = value => value.trim().replace(/^'|'$/g, '').replace(/''/g, "'");

  // Inserts and deletes are matched by one alternation so they are replayed in
  // the order they appear. A migration that retires a code and reseeds it in the
  // same file only lands correctly if the delete is applied when it is read.
  const statements =
    /insert\s+into\s+public\.customer_offers\s*\(([^)]*)\)\s*values([\s\S]*?);|delete\s+from\s+public\.customer_offers\b([\s\S]*?);/gi;

  for (const file of fs.readdirSync(MIGRATIONS_DIR).filter(name => name.endsWith('.sql')).sort()) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

    for (const [, columnList, valueList, deleteClause] of sql.matchAll(statements)) {
      if (deleteClause !== undefined) {
        // Only the `code in (...)` list identifies rows; other literals in the
        // WHERE clause (store_id, say) are not codes and must not evict one.
        const codeList = deleteClause.match(/\bcode\s+in\s*\(([^)]*)\)/i);
        if (codeList) {
          for (const [, code] of codeList[1].matchAll(/'([^']*)'/g)) offers.delete(code);
          continue;
        }
        const single = deleteClause.match(/\bcode\s*=\s*'([^']*)'/i);
        if (single) offers.delete(single[1]);
        continue;
      }

      const columns = columnList.split(',').map(name => name.trim().toLowerCase());
      const codeAt = columns.indexOf('code');
      const displayAt = columns.indexOf('display_value');
      if (codeAt === -1 || displayAt === -1) continue;

      for (const [, row] of valueList.matchAll(/\(([^()]*)\)/g)) {
        const values = row.match(/'(?:[^']|'')*'|[^,]+/g);
        if (!values || values.length !== columns.length) continue;
        const code = unquote(values[codeAt]);
        offers.set(code, { code, displayValue: unquote(values[displayAt]) });
      }
    }
  }

  return [...offers.values()];
}

test('order tracking maps kitchen and delivery states to a customer timeline', () => {
  assert.equal(getOrderTrackingState({ status: 'confirmed' }).activeKey, 'accepted');
  assert.equal(getOrderTrackingState({ status: 'preparing' }).activeKey, 'cooking');
  assert.equal(getOrderTrackingState({ status: 'ready' }).activeKey, 'ready');
  assert.equal(getOrderTrackingState({ type: 'delivery', deliveryStatus: 'out_for_delivery' }).activeKey, 'delivery');
  assert.equal(getOrderTrackingState({ status: 'completed' }).canReview, true);
});

test('customer favourites are derived safely from historical order item shapes', () => {
  const favorites = buildCustomerFavoritesFromOrders([
    { items: JSON.stringify([{ itemId: 1, itemName: 'Orange Juice (Large)', quantity: 2 }]) },
    { items: [{ itemId: 1, itemName: 'Orange Juice (Large)', quantity: 1 }, { itemName: 'Oreo Shake (XL)', quantity: 1 }] },
  ]);
  assert.equal(favorites[0].itemName, 'Orange Juice (Large)');
  assert.equal(favorites[0].count, 3);
  assert.equal(favorites[1].itemName, 'Oreo Shake (XL)');
});

test('fallback offers are display-only and preserve server-authority language', () => {
  assert.ok(FALLBACK_OFFERS.length >= 3);
  assert.ok(FALLBACK_OFFERS.every(offer => offer.code && offer.source === 'local'));
  assert.ok(FALLBACK_OFFERS.some(offer => /server/i.test(offer.displayValue)));
});

// The assertion above only sees the local array. fetchCustomerOffers prefers
// server rows whenever it has them, so a seeded row can put a hard price on the
// card — and advertise a code the fallback does not know — without tripping it.
// These two cover the seed itself.
test('seeded offers keep the board price out of display_value', () => {
  const seeds = readSeededOffers();
  assert.ok(seeds.length > 0, 'expected the migrations to seed customer_offers');
  for (const { code, displayValue } of seeds) {
    assert.ok(
      !/[₹$€£]|\d+\s*(rs|inr)\b/i.test(displayValue),
      `offer ${code} puts a price in display_value ("${displayValue}") — the server owns final price at checkout, so the board price belongs in the description`
    );
  }
});

test('seeded offer codes match the codes the client falls back to', () => {
  const seeded = new Set(readSeededOffers().map(offer => offer.code));
  for (const offer of FALLBACK_OFFERS) {
    assert.ok(
      seeded.has(offer.code),
      `FALLBACK_OFFERS advertises ${offer.code} but no migration seeds it — a customer quoting it offline would hit staff who cannot find it`
    );
  }
});

test('retention preferences define consent surfaces without sending automation', () => {
  const keys = RETENTION_PREFERENCES.map(pref => pref.key);
  assert.ok(keys.includes('whatsapp_updates'));
  assert.ok(keys.includes('abandoned_cart'));
  assert.ok(RETENTION_PREFERENCES.every(pref => pref.channel));
});
