/**
 * Single source of truth for who this store is.
 *
 * Before this file the name "The Taste" was typed into 25 separate files —
 * views, receipt and invoice templates, WhatsApp and UPI helpers, SEO
 * metadata, structured data and the seed. Renaming the store meant finding
 * all 25 and getting every one right.
 *
 * Everything here is presentation and content. Nothing in this file changes
 * how an order is priced, stored, synced or printed — the service modules
 * import the strings and keep their own logic.
 *
 * ── Renaming the store ────────────────────────────────────────────────
 * Change BRAND below and rerun `npm run build`. Two caveats:
 *
 *  1. Deployed stores keep their own name. `restaurantName` is a row in the
 *     settings table, seeded from here but owned by the store after first
 *     run. Existing installs change it in Admin -> Branding; this constant is
 *     only the default for a fresh database.
 *  2. Tests assert the storefront <h1> and the JSON-LD name. Update
 *     tests/e2e/accessibility.spec.ts and tests/storefront_seo.test.ts in the
 *     same commit — see docs/UI_CONTRACTS.md.
 */

export const BRAND = {
  /** Display name, taken from the shop's own menu board. */
  name: 'Trending Juice',
  /**
   * Where the name has to hold at 5.5rem or on a 58mm receipt, and the full
   * two words would wrap. The board sets TRENDING over JUICE for the same
   * reason.
   */
  shortName: 'TRENDING',
  legalName: 'Trending Juice',
  /** Used where the name needs to stand alone, e.g. an invoice header. */
  fullName: 'Trending Juice — Kumhrar',
  tagline: 'Fresh. Fun. You.',
  /** One line, second person, used under the name on receipts and the footer. */
  blurb: 'Fresh juices, shakes and mojitos, blended to order in Kumhrar.',
  /** Prefix on order numbers. Kept short for 58mm receipt paper. */
  orderPrefix: 'TRJ',
  handle: '@trendingjuice.patna',
  /** The board's sign-off, used as a footer line. */
  signoff: 'Stay fresh. Stay trending.',
  /**
   * The loyalty programme's name. It was "TasteRewards" — the previous brand
   * baked into a feature name across four files and a toast message, which no
   * amount of renaming the store would have caught.
   */
  rewardsName: 'Sip Club',
} as const;

export const CONTACT = {
  streetAddress: 'Sandalpur Road, Kumhrar',
  locality: 'Patna',
  region: 'Bihar',
  postalCode: '800026',
  country: 'IN',
  latitude: 25.5999,
  longitude: 85.1818,
  /** Filled in per store from Admin -> Branding. */
  phone: '',
} as const;

/**
 * Public origin, used for canonical URLs, OpenGraph and the sitemap.
 *
 * PLACEHOLDER — this is not a registered domain. Point it at the real one
 * before launch or every canonical URL and OG tag will reference a host that
 * does not resolve.
 */
export const STORE_ORIGIN = 'https://trendingjuice.in';

/**
 * Tenant key, NOT a display name. Never rendered anywhere in the UI.
 *
 * This is the `store_id` value in Supabase. It is the column default on ~12
 * tables in the initial schema migration and the partition key for staff
 * memberships, orders, customers and telemetry.
 *
 * Changing it is a data migration, not a rename: every existing row has to be
 * updated in the same transaction as the new default, or the app comes up
 * pointing at an empty tenant and no one can sign in. The three steps are:
 *   1. set the value here,
 *   2. add a NEW timestamped migration that alters the column defaults and
 *      UPDATEs existing rows — never edit an applied migration in place, which
 *      is a no-op against a database that already ran it,
 *   3. add the old value to RETIRED_STORE_IDS below so installed devices purge
 *      it from localStorage.
 *
 * The move from 'the-taste' is 20260808000000_retenant_the_taste_to_trending_juice.sql.
 */
export const STORE_ID = 'trending-juice';

/**
 * Tenant keys this store used to answer to.
 *
 * Only the `?store_id=` switch in the storefront writes the `store_id`
 * localStorage key, so a device that visited the storefront under a previous
 * brand keeps that value forever. Left in place it takes the foreign-store
 * branch in CustomerApp and renders the retired brand's name over this one's.
 *
 * Add the old key here whenever STORE_ID changes; entries can be dropped once
 * no installed device could still be carrying them.
 */
export const RETIRED_STORE_IDS: readonly string[] = ['the-taste'];

/** Address as a single line, for receipts and compact footers. */
export function addressLine() {
  return `${CONTACT.streetAddress}, ${CONTACT.locality}, ${CONTACT.region}`;
}

/** Address with postcode, for structured data and the full footer. */
export function addressFull() {
  return `${CONTACT.streetAddress}, ${CONTACT.locality} ${CONTACT.postalCode}`;
}
