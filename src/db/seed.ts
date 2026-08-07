// @ts-nocheck
import { db, generateLocalUuid, getDisplayToken } from './database';
import { BRAND, CONTACT, addressLine } from '../content/brand';

/**
 * Seeds the database with initial data if empty.
 * Cloud-first: If Supabase has data, pull from cloud instead of seeding locally.
 * This ensures new devices always get the real production data.
 */
export async function seedDatabase(options = {}) {
  const { publicOnly = false } = options;

  // Staff startup remains cloud-first for cross-device consistency. Public
  // startup must never block first paint on network retries; CustomerApp
  // refreshes its catalog from Supabase after rendering the local cache.
  const MAX_HYDRATION_RETRIES = 3;
  const HYDRATION_RETRY_DELAY_MS = 1500;
  let cloudHydrated = false;

  for (let attempt = 1; !publicOnly && attempt <= MAX_HYDRATION_RETRIES; attempt++) {
    try {
      // Wait for network readiness on retry attempts
      if (attempt > 1) {
        console.log(`[Seed] Cloud hydration retry ${attempt}/${MAX_HYDRATION_RETRIES} in ${HYDRATION_RETRY_DELAY_MS}ms...`);
        await new Promise(r => setTimeout(r, HYDRATION_RETRY_DELAY_MS));
        if (!navigator.onLine) {
          console.warn(`[Seed] Still offline on attempt ${attempt}. Skipping.`);
          continue;
        }
      }

      const { cloudHasData, fullPull } = await import('../services/cloudDb');
      const hasCloudData = await cloudHasData();
      if (hasCloudData) {
        console.log(`[Seed] Cloud data detected on attempt ${attempt} — hydrating from Supabase instead of local seeds.`);
        await fullPull({ publicOnly });
        cloudHydrated = true;
        // Still run migrations below, but skip seed data
        await runMigrations();
        if (!publicOnly) {
          await ensureDefaultTables();
        }
        return;
      } else {
        // Cloud is reachable and genuinely empty (no error thrown) — proceed to local seed immediately without retry
        console.log(`[Seed] Cloud is reachable but empty. Proceeding to local seed.`);
        break;
      }
    } catch (err) {
      console.warn(`[Seed] Cloud hydration attempt ${attempt} failed:`, err.message);
      if (attempt >= MAX_HYDRATION_RETRIES) {
        console.warn('[Seed] All cloud hydration attempts exhausted. Proceeding with local data.');
      }
    }
  }

  // Run local compatibility cleanup on the normal seed path too.
  await runMigrations();

  if (!publicOnly) {
    await ensureDefaultTables();
  }

  const existingCategories = await db.menuCategories.count();
  const existingItems = await db.menuItems.count();
  if (existingCategories > 0 && existingItems > 0) {
    return; // Data already exists
  }
  if (existingCategories > 0 && existingItems === 0) {
    console.warn('[Seed] Local categories exist without menu items. Rebuilding public menu cache.');
    await db.menuCategories.clear();
  }

  const seedStores = publicOnly
    ? [db.menuCategories, db.menuItems, db.settings]
    : [db.menuCategories, db.menuItems, db.settings, db.inventory, db.suppliers, db.customers, db.orders];

  await db.transaction('rw', ...seedStores, async () => {
    // ── Categories ──────────────────────────────────────────────
    // The four columns on the shop's own menu board, in board order. Staff
    // read the board; the POS should not make them translate.
    const categories = [
      { name: 'Juices', icon: '🍊', sortOrder: 1, isActive: 1, isSynced: 0 },
      { name: 'Shakes', icon: '🥤', sortOrder: 2, isActive: 1, isSynced: 0 },
      { name: 'Special', icon: '✨', sortOrder: 3, isActive: 1, isSynced: 0 },
      { name: 'Combos', icon: '🎁', sortOrder: 4, isActive: 1, isSynced: 0 },
    ];

    const categoryIds = await db.menuCategories.bulkAdd(categories, { allKeys: true });

    // Map category names to their IDs for easy reference
    const catMap = {};
    categories.forEach((cat, idx) => {
      catMap[cat.name] = categoryIds[idx];
    });

    // ── Menu Items ──────────────────────────────────────────────
    let sortOrder = 0;
    const menuItems = [];

    const addItem = (categoryName, name, price, isVeg) => {
      sortOrder++;
      menuItems.push({
        categoryId: catMap[categoryName],
        name,
        price,
        isVeg: isVeg ? 1 : 0,
        isAvailable: 1,
        sortOrder,
        isSynced: 0
      });
    };

    /* ── The shop's menu board, transcribed ───────────────────────────────
     *
     * Every drink is sold in two sizes, Large and X Large, at different
     * prices. `menuItems` has a single `price` column and the cart carries
     * only a note — there is no variant model — so each size is its own row.
     * That is what the current schema supports without a migration.
     *
     * The cost is a longer grid: 25 drinks become 50 tiles. If that gets in
     * the way at the counter, the fix is real size variants on the item, not
     * hiding rows here.
     *
     * Category placement follows the board exactly, including the shakes that
     * the board lists in its JUICES column. Staff read the board.
     */
    const addSized = (categoryName, name, large, xLarge, isVeg = true) => {
      addItem(categoryName, `${name} (Large)`, large, isVeg);
      addItem(categoryName, `${name} (XL)`, xLarge, isVeg);
    };

    // JUICES column
    addSized('Juices', 'Mosambi', 40, 70);
    addSized('Juices', 'Orange Juice', 30, 50);
    addSized('Juices', 'Anar Juice', 80, 150);
    addSized('Juices', 'Beetroot Juice', 30, 50);
    addSized('Juices', 'Apple', 60, 100);
    addSized('Juices', 'Pineapple', 50, 80);
    addSized('Juices', 'Mix Juice', 50, 90);
    addSized('Juices', 'Fruit Chaat', 30, 50);
    addSized('Juices', 'Banana Shake', 30, 50);
    addSized('Juices', 'Mango Shake', 40, 70);
    addSized('Juices', 'Khajoor Shake', 40, 70);
    addSized('Juices', 'Cold Coffee', 50, 90);
    addSized('Juices', 'Papaya', 15, 25);
    addSized('Juices', 'Banana Peanut', 40, 70);

    // SHAKES column
    addSized('Shakes', 'Butter Shake', 40, 70);
    addSized('Shakes', 'Khajoor Banana Shake', 40, 70);
    addSized('Shakes', 'Vanilla Shake', 60, 100);
    addSized('Shakes', 'Oreo Shake', 60, 100);
    addSized('Shakes', 'KitKat Shake', 60, 100);
    addSized('Shakes', 'Strawberry Shake', 60, 100);
    addSized('Shakes', 'Butterscotch Shake', 60, 100);
    addSized('Shakes', 'Dry Fruits Shake', 60, 110);

    // SPECIAL column
    addSized('Special', 'Lemon Water', 20, 30);
    addSized('Special', 'Virgin Mojito', 50, 90);
    addSized('Special', 'Lassi', 30, 50);

    // COMBOS — one price each, no size split on the board.
    addItem('Combos', 'Power Boost — Any Juice + Any Shake', 120, true);
    addItem('Combos', 'Fruit Fusion — Any Juice + Fruit Chaat', 100, true);
    addItem('Combos', 'Cool Duo — Any Shake + Cold Coffee', 110, true);

    await db.menuItems.bulkAdd(menuItems);

    // ── Default Settings ────────────────────────────────────────
    const defaultSettings = [
      { key: 'restaurantName', value: BRAND.name },
      { key: 'restaurantTagline', value: BRAND.tagline },
      { key: 'restaurantPhone', value: CONTACT.phone },
      { key: 'restaurantAddress', value: addressLine() },
      { key: 'upiId', value: '' },
      { key: 'upiName', value: BRAND.name },
      { key: 'gstPercent', value: '5' },
      { key: 'printerWidth', value: '58' },
      { key: 'orderNumberPrefix', value: BRAND.orderPrefix },
    ];

    await db.settings.bulkPut(defaultSettings);

    if (publicOnly) {
      return;
    }

    // ── Inventory Seeding ───────────────────────────────────────
    const inventoryItems = [
      { name: 'Oranges', unit: 'kg', quantity: 60, minThreshold: 15, maxCapacity: 120, categoryTag: 'Produce', isSynced: 0, _platform: 'nextgenos' },
      { name: 'Sweet Lime', unit: 'kg', quantity: 40, minThreshold: 12, maxCapacity: 90, categoryTag: 'Produce', isSynced: 0, _platform: 'nextgenos' },
      { name: 'Watermelon', unit: 'kg', quantity: 55, minThreshold: 15, maxCapacity: 120, categoryTag: 'Produce', isSynced: 0, _platform: 'nextgenos' },
      { name: 'Pineapple', unit: 'kg', quantity: 8, minThreshold: 10, maxCapacity: 40, categoryTag: 'Produce', isSynced: 0, _platform: 'nextgenos' }, // below threshold!
      { name: 'Bananas', unit: 'kg', quantity: 30, minThreshold: 10, maxCapacity: 60, categoryTag: 'Produce', isSynced: 0, _platform: 'nextgenos' },
      { name: 'Apples', unit: 'kg', quantity: 25, minThreshold: 8, maxCapacity: 50, categoryTag: 'Produce', isSynced: 0, _platform: 'nextgenos' },
      { name: 'Carrots', unit: 'kg', quantity: 20, minThreshold: 8, maxCapacity: 45, categoryTag: 'Produce', isSynced: 0, _platform: 'nextgenos' },
      { name: 'Beetroot', unit: 'kg', quantity: 12, minThreshold: 5, maxCapacity: 30, categoryTag: 'Produce', isSynced: 0, _platform: 'nextgenos' },
      { name: 'Ginger', unit: 'kg', quantity: 6, minThreshold: 2, maxCapacity: 15, categoryTag: 'Produce', isSynced: 0, _platform: 'nextgenos' },
      { name: 'Lemons', unit: 'kg', quantity: 10, minThreshold: 4, maxCapacity: 25, categoryTag: 'Produce', isSynced: 0, _platform: 'nextgenos' },
      { name: 'Mixed Berries (frozen)', unit: 'kg', quantity: 2, minThreshold: 5, maxCapacity: 20, categoryTag: 'Frozen', isSynced: 0, _platform: 'nextgenos' }, // below threshold!
      { name: 'Milk', unit: 'liters', quantity: 40, minThreshold: 10, maxCapacity: 80, categoryTag: 'Dairy', isSynced: 0, _platform: 'nextgenos' },
      { name: 'Curd', unit: 'kg', quantity: 15, minThreshold: 5, maxCapacity: 30, categoryTag: 'Dairy', isSynced: 0, _platform: 'nextgenos' },
      { name: 'Vanilla Ice Cream', unit: 'liters', quantity: 18, minThreshold: 6, maxCapacity: 40, categoryTag: 'Frozen', isSynced: 0, _platform: 'nextgenos' },
      { name: 'Sugar', unit: 'kg', quantity: 14, minThreshold: 5, maxCapacity: 30, categoryTag: 'Dry Goods', isSynced: 0, _platform: 'nextgenos' },
      { name: 'Whey Protein', unit: 'kg', quantity: 4, minThreshold: 2, maxCapacity: 10, categoryTag: 'Supplements', isSynced: 0, _platform: 'nextgenos' },
      { name: 'Chia Seeds', unit: 'kg', quantity: 3, minThreshold: 1, maxCapacity: 8, categoryTag: 'Dry Goods', isSynced: 0, _platform: 'nextgenos' },
      { name: 'Paper Cups (400ml)', unit: 'packs', quantity: 22, minThreshold: 10, maxCapacity: 60, categoryTag: 'Packaging', isSynced: 0, _platform: 'nextgenos' }
    ];
    await db.inventory.bulkAdd(inventoryItems);
    console.log('[Seed] High-fidelity inventory seeded.');

    // ── Suppliers Seeding ────────────────────────────────────────
    const detailedSuppliers = [
      { name: 'Dairy Farm', phone: '9876543210', email: 'dairy@farm.com', category: 'Dairy', isSynced: 0, _platform: 'nextgenos', createdAt: new Date().toISOString() },
      { name: 'Meat Kings', phone: '9876543211', email: 'info@meatkings.com', category: 'Meat', isSynced: 0, _platform: 'nextgenos', createdAt: new Date().toISOString() },
      { name: 'Green Grocery', phone: '9876543212', email: 'order@greengrocery.com', category: 'Produce', isSynced: 0, _platform: 'nextgenos', createdAt: new Date().toISOString() },
      { name: 'Dry Bulk Co', phone: '9876543213', email: 'sales@drybulk.com', category: 'Dry Goods', isSynced: 0, _platform: 'nextgenos', createdAt: new Date().toISOString() }
    ];
    await db.suppliers.bulkAdd(detailedSuppliers);
    console.log('[Seed] High-fidelity suppliers seeded.');

    // ── CRM Customers Seeding ──────────────────────────────────
    const distinctCustomers = [
      { name: 'Aarav Sharma', phone: '9999911111', totalSpent: 6200, visitCount: 15, loyaltyPoints: 620, tier: 'platinum', lastVisit: new Date().toISOString(), createdAt: new Date().toISOString(), isSynced: 0, _platform: 'nextgenos' },
      { name: 'Priya Patel', phone: '9999922222', totalSpent: 3500, visitCount: 8, loyaltyPoints: 350, tier: 'gold', lastVisit: new Date().toISOString(), createdAt: new Date().toISOString(), isSynced: 0, _platform: 'nextgenos' },
      { name: 'Vikram Singh', phone: '9999933333', totalSpent: 1200, visitCount: 4, loyaltyPoints: 120, tier: 'silver', lastVisit: new Date().toISOString(), createdAt: new Date().toISOString(), isSynced: 0, _platform: 'nextgenos' },
      { name: 'Ananya Iyer', phone: '9999944444', totalSpent: 450, visitCount: 2, loyaltyPoints: 45, tier: 'bronze', lastVisit: new Date().toISOString(), createdAt: new Date().toISOString(), isSynced: 0, _platform: 'nextgenos' },
      { name: 'Kabir Mehta', phone: '9999955555', totalSpent: 7500, visitCount: 18, loyaltyPoints: 750, tier: 'platinum', lastVisit: new Date().toISOString(), createdAt: new Date().toISOString(), isSynced: 0, _platform: 'nextgenos' },
      { name: 'Neha Gupta', phone: '9999966666', totalSpent: 2800, visitCount: 7, loyaltyPoints: 280, tier: 'gold', lastVisit: new Date().toISOString(), createdAt: new Date().toISOString(), isSynced: 0, _platform: 'nextgenos' },
      { name: 'Rahul Verma', phone: '9999977777', totalSpent: 850, visitCount: 3, loyaltyPoints: 85, tier: 'silver', lastVisit: new Date().toISOString(), createdAt: new Date().toISOString(), isSynced: 0, _platform: 'nextgenos' },
      { name: 'Riya Sen', phone: '9999988888', totalSpent: 150, visitCount: 1, loyaltyPoints: 15, tier: 'bronze', lastVisit: new Date().toISOString(), createdAt: new Date().toISOString(), isSynced: 0, _platform: 'nextgenos' }
    ];
    await db.customers.bulkAdd(distinctCustomers);
    console.log('[Seed] High-fidelity customers seeded.');

    // ── Historical Orders Seeding ────────────────────────────────
    const historicalOrders = [];
    // Demo history, so it has to look like this shop's sales. These were
    // still momos and Hakka noodles, which made Analytics and the dashboard's
    // "selling fastest" panel report a menu the store does not serve.
    const orderItemsPool = [
      { name: 'Orange Juice (Large)', price: 30, isVeg: 1 },
      { name: 'Mosambi (XL)', price: 70, isVeg: 1 },
      { name: 'Anar Juice (Large)', price: 80, isVeg: 1 },
      { name: 'Mix Juice (XL)', price: 90, isVeg: 1 },
      { name: 'Banana Shake (Large)', price: 30, isVeg: 1 },
      { name: 'Cold Coffee (XL)', price: 90, isVeg: 1 },
      { name: 'Oreo Shake (Large)', price: 60, isVeg: 1 },
      { name: 'Butterscotch Shake (XL)', price: 100, isVeg: 1 },
      { name: 'Virgin Mojito (Large)', price: 50, isVeg: 1 },
      { name: 'Power Boost — Any Juice + Any Shake', price: 120, isVeg: 1 }
    ];

    const customersPool = [
      { name: 'Aarav Sharma', phone: '9999911111' },
      { name: 'Priya Patel', phone: '9999922222' },
      { name: 'Vikram Singh', phone: '9999933333' },
      { name: 'Ananya Iyer', phone: '9999944444' },
      { name: 'Kabir Mehta', phone: '9999955555' },
      { name: 'Neha Gupta', phone: '9999966666' },
      { name: 'Rahul Verma', phone: '9999977777' },
      { name: 'Riya Sen', phone: '9999988888' },
      { name: 'Walk-in Customer', phone: '' },
      { name: 'Walk-in Customer', phone: '' }
    ];

    const typesPool = ['takeaway', 'dinein', 'delivery'];
    const paymentsPool = ['upi', 'cash'];

    for (let i = 1; i <= 25; i++) {
      const dayDiff = Math.floor((i - 1) / 3.5);
      const orderDate = new Date();
      orderDate.setDate(orderDate.getDate() - dayDiff);
      const hour = 11 + (i % 11);
      const minute = (i * 17) % 60;
      orderDate.setHours(hour, minute, 0, 0);

      const createdAt = orderDate.toISOString();
      const completedAt = new Date(orderDate.getTime() + (10 * 60 * 1000) + ((i * 3) % 20) * 60 * 1000).toISOString();

      const cartItems = [];
      const numItems = 1 + (i % 3);
      let subtotal = 0;

      for (let j = 0; j < numItems; j++) {
        const poolIndex = (i + j * 3) % orderItemsPool.length;
        const item = orderItemsPool[poolIndex];
        const quantity = 1 + ((i + j) % 2);
        cartItems.push({
          itemId: poolIndex + 1,
          itemName: item.name,
          price: item.price,
          quantity,
          isVeg: item.isVeg,
          notes: ''
        });
        subtotal += item.price * quantity;
      }

      const gstPercent = 5;
      const tax = subtotal * (gstPercent / 100);
      const total = subtotal + tax;

      const customer = customersPool[i % customersPool.length];
      const type = typesPool[i % typesPool.length];
      const paymentMethod = paymentsPool[i % paymentsPool.length];

      const orderNumber = `${BRAND.orderPrefix}-${orderDate.getFullYear()}${String(orderDate.getMonth() + 1).padStart(2, '0')}${String(orderDate.getDate()).padStart(2, '0')}-${String(i).padStart(3, '0')}`;
      const clientOrderId = generateLocalUuid();

      historicalOrders.push({
        clientOrderId,
        idempotencyKey: clientOrderId,
        orderNumber,
        displayToken: getDisplayToken(orderNumber, clientOrderId),
        type,
        channel: 'pos',
        source: 'pos',
        status: 'completed',
        items: JSON.stringify(cartItems),
        subtotal,
        tax,
        taxPercent: gstPercent,
        total,
        paymentMethod,
        paymentStatus: 'paid',
        customerName: customer.name,
        customerPhone: customer.phone,
        validationStatus: 'trusted_staff',
        requiresServerValidation: false,
        syncStatus: 'pending',
        syncAttempts: 0,
        staffId: 1,
        staffName: 'Owner',
        tableId: type === 'dinein' ? (1 + (i % 8)) : null,
        createdAt,
        completedAt,
        isSynced: 0
      });
    }

    await db.orders.bulkAdd(historicalOrders);
    console.log('[Seed] High-fidelity historical orders seeded.');
  });
}

/**
 * Run local compatibility cleanup and dynamic setting migrations.
 * Extracted so it can be called from both cloud-first and normal seed paths.
 */
async function runMigrations() {
  try {
    await db.settings.bulkDelete(['adminPin', 'adminPinHash', 'requirePinForOrder']);
    const staffMembers = await db.staff.toArray();
    for (const staff of staffMembers) {
      if (staff.pin || staff.pinHash) {
        await db.staff.update(staff.id, { pin: undefined, pinHash: undefined });
      }
    }

    // Dynamic UPI ID Migration
    //
    // Clears handles belonging to a PREVIOUS brand so a re-tenanted install does
    // not keep collecting into the old shop's account. Only ever list handles the
    // store can no longer own.
    //
    // The current brand's own handle must never appear here. runMigrations() runs
    // on every launch, so listing it would blank the setting on the next start
    // every time the owner saved it in Admin -> Branding, and UPI QR payments
    // could never be switched on. `upiId` seeds as '' (see line 177), so the
    // current handle is never a placeholder — it is only ever a real value.
    const currentUpiIdSetting = await db.settings.get('upiId');
    if (!currentUpiIdSetting || currentUpiIdSetting.value === 'thetaste@upi' || currentUpiIdSetting.value === '') {
      await db.settings.put({ key: 'upiId', value: '' });
    }

    // Dynamic Store Details Migration
    const phoneSetting = await db.settings.get('restaurantPhone');
    if (!phoneSetting || phoneSetting.value === '') {
      await db.settings.put({ key: 'restaurantPhone', value: '' });
    }
    const addressSetting = await db.settings.get('restaurantAddress');
    if (!addressSetting || addressSetting.value === '' || addressSetting.value.includes('Kolkata')) {
      await db.settings.put({ key: 'restaurantAddress', value: 'Sandalpur Road, Kumhrar, Patna, Bihar' });
      console.log('[Seed] Restaurant address successfully updated.');
    }
    // This migration used to overwrite the tagline with a hardcoded
    // "Chinese Food — Fresh & Reasonable", so a fresh juice-shop install
    // printed that on every receipt. Carry the brand's own tagline, and
    // recognise both previous values as the ones to replace.
    const STALE_TAGLINES = ['Fast Food & Chinese', 'Chinese Food — Fresh & Reasonable'];
    const taglineSetting = await db.settings.get('restaurantTagline');
    if (!taglineSetting || STALE_TAGLINES.includes(taglineSetting.value)) {
      await db.settings.put({ key: 'restaurantTagline', value: BRAND.tagline });
      console.log('[Seed] Restaurant tagline successfully updated.');
    }
  } catch (err) {
    console.error('[Seed] Failed to run migrations:', err);
  }
}

async function ensureDefaultTables() {
  try {
    const tableStore = db.table('tables');
    const tableCount = await tableStore.count();
    if (tableCount === 0) {
      const defaultTables = [
        { number: 1, status: 'available', floorSection: 'Main Hall' },
        { number: 2, status: 'available', floorSection: 'Main Hall' },
        { number: 3, status: 'available', floorSection: 'Main Hall' },
        { number: 4, status: 'available', floorSection: 'Main Hall' },
        { number: 5, status: 'available', floorSection: 'Window Side' },
        { number: 6, status: 'available', floorSection: 'Window Side' },
        { number: 7, status: 'available', floorSection: 'Balcony' },
        { number: 8, status: 'available', floorSection: 'Balcony' }
      ];
      await tableStore.bulkAdd(defaultTables);
      console.log('[Seed] Default tables seeded.');
    }
  } catch (err) {
    console.error('[Seed] Failed to seed default tables:', err);
  }
}
