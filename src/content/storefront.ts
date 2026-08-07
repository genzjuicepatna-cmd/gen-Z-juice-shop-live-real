/**
 * Single source of truth for storefront marketing copy.
 *
 * The same text has to appear in three places that cannot import each other's
 * runtime: the statically exported HTML a crawler sees, the client SPA, and
 * the admin panel that edits it. Keeping the defaults here is what stops those
 * three from drifting apart.
 *
 * Everything in `STOREFRONT_SETTING_KEYS` is overridable per store from the
 * admin panel; the values below are what ships in the pre-rendered HTML.
 */

import { BRAND, CONTACT, STORE_ORIGIN } from './brand';

export { STORE_ORIGIN };

/** Derived from ./brand so the store is named in exactly one place. */
export const STORE_PROFILE = {
  name: BRAND.name,
  tagline: BRAND.tagline,
  streetAddress: CONTACT.streetAddress,
  locality: CONTACT.locality,
  region: CONTACT.region,
  postalCode: CONTACT.postalCode,
  country: CONTACT.country,
  latitude: CONTACT.latitude,
  longitude: CONTACT.longitude,
  cuisines: ['Juice', 'Milkshakes', 'Beverages'],
  priceRange: '₹₹'
};

export interface ProofPoint {
  value: string;
  label: string;
}

export const STOREFRONT_DEFAULTS = {
  // Not BRAND.tagline: the boot splash already shows that, so using it here
  // printed the same line twice on one screen. A kicker should add something
  // the headline does not — and two sizes on every drink is the most useful
  // fact about this menu.
  heroKicker: 'Two sizes. Every drink.',
  heroHeadline: BRAND.name,
  heroCopy:
    'Fresh juice, thick shakes and virgin mojitos, made the second you order. Every drink in two sizes, nothing sitting around waiting for you.',
  heroCta: 'Start sipping',
  menuEyebrow: 'Order online',
  menuHeadline: 'What are you sipping today?',
  featuredEyebrow: 'Everyone is ordering',
  featuredHeadline: 'What Kumhrar keeps coming back for',
  proofPoints: [
    { value: '2', label: 'Sizes on every drink' },
    { value: '₹15', label: 'Cheapest cup on the board' },
    { value: '0', label: 'Concentrate or syrup' }
  ] as ProofPoint[],
  // Must match item names in the catalogue exactly, size suffix included —
  // CustomerApp resolves them by name. The previous six were from the
  // placeholder menu and matched nothing, so the section rendered empty.
  featuredItemNames: [
    'Orange Juice (Large)',
    'Anar Juice (Large)',
    'Mix Juice (Large)',
    'Oreo Shake (Large)',
    'Cold Coffee (Large)',
    'Virgin Mojito (Large)'
  ],
  footerCopy: 'Fresh juice, shakes and mojitos from Kumhrar, Patna.',
  footerNote: 'Stay fresh. Stay trending.'
};

/** Dexie `settings` keys the admin panel writes and the storefront reads. */
export const STOREFRONT_SETTING_KEYS = {
  heroKicker: 'storefrontHeroKicker',
  heroCopy: 'storefrontHeroCopy',
  heroCta: 'storefrontHeroCta',
  featuredEyebrow: 'storefrontFeaturedEyebrow',
  featuredHeadline: 'storefrontFeaturedHeadline',
  menuEyebrow: 'storefrontMenuEyebrow',
  menuHeadline: 'storefrontMenuHeadline',
  proofPoints: 'storefrontProofPoints',
  featuredItemIds: 'storefrontFeaturedItemIds',
  footerCopy: 'storefrontFooterCopy'
} as const;

function coerceText(value: unknown, fallback: string) {
  const text = String(value ?? '').trim();
  return text || fallback;
}

/**
 * Merge stored admin overrides over the shipped defaults.
 * Accepts the raw shape Dexie hands back, including legacy/blank values.
 */
export function resolveStorefrontCopy(stored: Record<string, any> = {}) {
  let proofPoints = STOREFRONT_DEFAULTS.proofPoints;
  const rawProof = stored[STOREFRONT_SETTING_KEYS.proofPoints];
  if (Array.isArray(rawProof)) {
    const cleaned = rawProof
      .map(point => ({
        value: String(point?.value ?? '').trim(),
        label: String(point?.label ?? '').trim()
      }))
      .filter(point => point.value && point.label);
    if (cleaned.length) proofPoints = cleaned.slice(0, 4);
  }

  // `Number(null)` and `Number('')` are 0, which is a valid-looking Dexie key,
  // so blanks are rejected before conversion rather than after.
  const rawFeatured = stored[STOREFRONT_SETTING_KEYS.featuredItemIds];
  const featuredItemIds = Array.isArray(rawFeatured)
    ? rawFeatured
        .filter(id => typeof id === 'number' || (typeof id === 'string' && id.trim() !== ''))
        .map(Number)
        .filter(id => Number.isInteger(id) && id > 0)
    : [];

  return {
    heroKicker: coerceText(stored[STOREFRONT_SETTING_KEYS.heroKicker], STOREFRONT_DEFAULTS.heroKicker),
    heroCopy: coerceText(stored[STOREFRONT_SETTING_KEYS.heroCopy], STOREFRONT_DEFAULTS.heroCopy),
    heroCta: coerceText(stored[STOREFRONT_SETTING_KEYS.heroCta], STOREFRONT_DEFAULTS.heroCta),
    featuredEyebrow: coerceText(stored[STOREFRONT_SETTING_KEYS.featuredEyebrow], STOREFRONT_DEFAULTS.featuredEyebrow),
    featuredHeadline: coerceText(stored[STOREFRONT_SETTING_KEYS.featuredHeadline], STOREFRONT_DEFAULTS.featuredHeadline),
    menuEyebrow: coerceText(stored[STOREFRONT_SETTING_KEYS.menuEyebrow], STOREFRONT_DEFAULTS.menuEyebrow),
    menuHeadline: coerceText(stored[STOREFRONT_SETTING_KEYS.menuHeadline], STOREFRONT_DEFAULTS.menuHeadline),
    footerCopy: coerceText(stored[STOREFRONT_SETTING_KEYS.footerCopy], STOREFRONT_DEFAULTS.footerCopy),
    proofPoints,
    featuredItemIds
  };
}

/* ── Category blurbs ──────────────────────────────────────────────────────
 * The one-liner under an item name when the item has no description of its
 * own. This map was copy-pasted into MenuItem and ItemDetailDrawer, and both
 * copies were keyed to the placeholder catalogue's sections — so with the real
 * menu every single card fell through to the same generic fallback.
 */
const CATEGORY_BLURBS: Record<string, string> = {
  juices: 'Pressed today, nothing added.',
  shakes: 'Cold, thick and unapologetic.',
  special: 'The ones people come in specifically for.',
  combos: 'Two drinks, one price.',
  // Retained for stores still on the earlier placeholder sections.
  'cold-pressed': 'Pressed today, nothing added.',
  smoothies: 'Blended thick, spoon optional.',
  'detox shots': 'Small, sharp, over in one go.',
  'fruit bowls': 'Cut fresh, piled high.',
  refreshers: 'Light, citrusy and very cold.',
  boosters: 'Add-ons for whatever you are already drinking.'
};

/** Falls back to a line that is true of everything on the board. */
export function categoryBlurb(categoryName?: string | null) {
  const key = String(categoryName ?? '').trim().toLowerCase();
  return CATEGORY_BLURBS[key] || 'Made fresh to order.';
}

/** Content for the statically rendered marketing pages and their SPA twins. */
export const STOREFRONT_PAGES = {
  offers: {
    slug: 'offers',
    eyebrow: 'Offers',
    title: 'Cheaper by the sip',
    copy: 'Live offers show up here. Final eligibility and the discount maths stay server validated at checkout, so what you see is what you pay.',
    metaTitle: `Offers & Deals — ${BRAND.legalName}, Kumhrar Patna`,
    metaDescription:
      `Current offers on fresh juice, shakes and mojitos from ${BRAND.name} in Kumhrar, Patna. Combo deals, first-order discounts and rewards, validated at checkout.`
  },
  about: {
    slug: 'about',
    eyebrow: 'Our story',
    title: 'Fruit in, nothing else',
    copy: `${BRAND.name} is a juice corner in Kumhrar built on one rule: if it did not come off a fruit this morning, it does not go in the cup.`,
    metaTitle: `Our Story — ${BRAND.name}, Juice & Shake Bar in Patna`,
    metaDescription:
      `How ${BRAND.name} makes fresh juice in Kumhrar, Patna: fruit pressed the same day, no concentrate, no added syrup, and every drink in two sizes.`,
    pillars: [
      {
        index: '01',
        title: 'Cut today',
        copy: 'Fruit is cut and pressed the same day it is served. Nothing sits overnight waiting for you.'
      },
      {
        index: '02',
        title: 'Nothing hidden',
        copy: 'No concentrate, no colour, no mystery syrup. What is on the board is what goes in the cup.'
      },
      {
        index: '03',
        title: 'Made in front of you',
        copy: 'The counter is the kitchen. You watch your drink get made, then you take it away cold.'
      }
    ]
  },
  catering: {
    slug: 'catering',
    eyebrow: 'Catering',
    title: 'Juice for the whole room',
    copy: 'Office mornings, birthdays, college fests, gym events — anything that needs more cups than two hands can carry.',
    metaTitle: `Bulk Juice & Catering — ${BRAND.name}, Patna`,
    metaDescription:
      `Bulk juice and shake catering in Patna for office mornings, birthdays and college events. Share your date, headcount and budget with ${BRAND.name}, Kumhrar.`,
    panelTitle: 'Tell us about your event',
    panelCopy:
      'Share your date, headcount, flavour preferences and budget. We will build a batch that travels cold and arrives on time.'
  },
  support: {
    slug: 'support',
    eyebrow: 'Help centre',
    title: 'Stuck? Ask us',
    copy: 'Straight answers and a direct line to the counter — no maze of support screens.',
    metaTitle: `Help & Support — ${BRAND.name}, Patna`,
    metaDescription:
      `Order changes, tracking, payment methods, allergens and cancellations — answers and a direct line to ${BRAND.name} in Kumhrar, Patna.`,
    faqs: [
      [
        'Can I change my order?',
        'Call the counter right after placing it. Once it is being made we cannot change it.'
      ],
      [
        'How do I track my order?',
        'Your confirmation screen updates live as the counter and delivery team move it along.'
      ],
      [
        'Which payments work?',
        'Available methods show up at checkout and can vary by pickup or delivery.'
      ],
      [
        'What is the difference between Large and X Large?',
        'Size and price only — same drink, bigger cup. Both are on the board and in the app.'
      ],
      [
        'Do you list allergens?',
        'Tell us before ordering if you have an allergy — dairy and nuts share equipment, and the shakes and dry fruit drinks especially. Per-item allergen labels are on the way.'
      ],
      [
        'What is your cancellation policy?',
        'Depends how far along it is. Anything already made cannot be cancelled.'
      ]
    ] as Array<[string, string]>
  }
} as const;

/** Routes emitted into the sitemap and linked from the static page chrome. */
export const STATIC_ROUTES = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/menu', priority: '0.9', changefreq: 'daily' },
  { path: '/offers', priority: '0.8', changefreq: 'weekly' },
  { path: '/about', priority: '0.6', changefreq: 'monthly' },
  { path: '/catering', priority: '0.6', changefreq: 'monthly' },
  { path: '/support', priority: '0.5', changefreq: 'monthly' }
];
