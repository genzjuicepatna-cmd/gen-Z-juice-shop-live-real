/**
 * Category artwork, in one place.
 *
 * The same category-name-to-image map had been copy-pasted into five files —
 * MenuItem, ItemDetailDrawer, MenuGrid, ExpressView and MenuManager — each
 * with its own fallback. Adding a category meant finding all five.
 *
 * The art is generated SVG, not photography: shipping the previous
 * Indo-Chinese dish photos against juice categories would be actively
 * misleading. Each file is well under a kilobyte, so the whole set costs less
 * than one of the JPEGs it replaces.
 *
 * Replace these with real photography when it exists — drop files in
 * public/assets and repoint the map. Per-item images set from Admin -> Menu
 * always win over the category default; see `menuItemImageSource`.
 */

import ART_MANIFEST from './art-manifest.json';

/**
 * Category art points at the same drawn cups the per-item art uses, keyed by
 * the fruit most representative of the section.
 *
 * The previous set was seven `category-*.svg` files, each a gradient with a
 * single emoji glyph in an SVG <text> node. Two problems: an emoji in <text>
 * renders in whatever the host platform's emoji font is — or as tofu when
 * there isn't one — so the tile was never the same picture twice; and the
 * glyphs were wrong. Cold-pressed drew 🧃, a shelf-stable carton, which is
 * precisely what a cold-pressed juice bar is not selling. Shakes drew soft
 * serve, boosters drew a lightning bolt.
 */
const CATEGORY_FRUIT: Record<string, string> = {
  juices: 'orange',
  shakes: 'vanilla',
  special: 'lemon',
  combos: 'mixed',
  // Kept so a store still carrying the earlier placeholder catalogue, or one
  // that named its own sections this way, does not fall back to 'mixed'.
  'cold-pressed': 'orange',
  smoothies: 'berry',
  'detox shots': 'wheatgrass',
  'fruit bowls': 'mixed',
  refreshers: 'lemon',
  boosters: 'protein'
};

/** Shown for a category with no art of its own. */
export const FALLBACK_CATEGORY_FRUIT = 'mixed';

function artPath(fruit: string) {
  return (ART_MANIFEST as Record<string, string>)[fruit] ?? `/assets/art/${fruit}.svg`;
}

/**
 * Last-resort image URL, for callers sanitising an item's own stored image and
 * needing something to fall back to when it fails validation.
 */
export const FALLBACK_CATEGORY_ART = artPath(FALLBACK_CATEGORY_FRUIT);

/**
 * Art for a category name, matched case-insensitively.
 * Returns the fallback rather than an empty string so callers never render a
 * broken image.
 */
export function categoryArt(categoryName?: string | null) {
  const key = String(categoryName ?? '').trim().toLowerCase();
  return artPath(CATEGORY_FRUIT[key] || FALLBACK_CATEGORY_FRUIT);
}

export { CATEGORY_FRUIT };

/* ── Per-item art and card tint ───────────────────────────────────────────
 * A category-wide image meant every drink in a section rendered the identical
 * tile, so eight cold-pressed juices were eight identical orange blobs. That
 * sameness is most of what made the grid look like a template.
 *
 * Items are matched on fruit keywords, longest first so "sweet lime" wins over
 * "lime" and "green apple" over "apple". Each fruit also carries a pastel card
 * tint, which is what gives the grid its colour rhythm.
 */

type Fruit = { art: string; tint: string };

const FRUIT: Array<[string, Fruit]> = [
  // From the shop's menu board. Listed first because several of these would
  // otherwise be swallowed by a shorter keyword further down — 'butterscotch'
  // by 'butter', 'khajoor banana' by 'banana', 'fruit chaat' by 'fruit'.
  ['butterscotch', { art: 'vanilla', tint: '#FBF3E2' }],
  ['khajoor', { art: 'dry-fruit', tint: '#FBEEDC' }],
  ['fruit chaat', { art: 'mixed', tint: '#FDECE2' }],
  ['dry fruit', { art: 'dry-fruit', tint: '#FBEEDC' }],
  ['virgin mojito', { art: 'lemon', tint: '#EAF8DD' }],
  ['lemon water', { art: 'lemon', tint: '#FBF6D8' }],
  ['mix juice', { art: 'mixed', tint: '#FDECE2' }],
  ['kitkat', { art: 'chocolate', tint: '#EFE4DC' }],
  ['butter shake', { art: 'vanilla', tint: '#FBF3E2' }],
  ['banana peanut', { art: 'peanut', tint: '#FBEEDC' }],
  ['anar', { art: 'pomegranate', tint: '#FDE2EC' }],
  ['mosambi', { art: 'sweet-lime', tint: '#F2FBD8' }],
  ['beetroot', { art: 'beet', tint: '#FDE4EF' }],
  ['lassi', { art: 'curd', tint: '#FBF4E4' }],
  ['power boost', { art: 'mixed', tint: '#FDECE2' }],
  ['fruit fusion', { art: 'mixed', tint: '#FDECE2' }],
  ['cool duo', { art: 'coffee', tint: '#F1E6DC' }],

  ['sweet lime', { art: 'sweet-lime', tint: '#F2FBD8' }],
  ['green apple', { art: 'apple', tint: '#EEFBDD' }],
  ['apple beet', { art: 'beet', tint: '#FDE4EF' }],
  ['dry fruit', { art: 'dry-fruit', tint: '#FBEEDC' }],
  ['peanut butter', { art: 'peanut', tint: '#FBEEDC' }],
  ['cold coffee', { art: 'coffee', tint: '#F1E6DC' }],
  ['iced lemon tea', { art: 'tea', tint: '#FBF3DC' }],
  ['blue lagoon', { art: 'blue', tint: '#E2EEFD' }],
  ['wheatgrass', { art: 'wheatgrass', tint: '#E4F8E5' }],
  ['pomegranate', { art: 'pomegranate', tint: '#FDE2EC' }],
  ['watermelon', { art: 'watermelon', tint: '#FDE6E7' }],
  ['sugarcane', { art: 'sugarcane', tint: '#EFFADD' }],
  ['strawberry', { art: 'strawberry', tint: '#FDE4EE' }],
  ['pineapple', { art: 'pineapple', tint: '#FDF4D9' }],
  ['chocolate', { art: 'chocolate', tint: '#EFE4DC' }],
  ['turmeric', { art: 'turmeric', tint: '#FDF0D5' }],
  ['shikanji', { art: 'lemon', tint: '#FBF6D8' }],
  ['nimbu', { art: 'lemon', tint: '#FBF6D8' }],
  ['falooda', { art: 'rose', tint: '#FDE7EF' }],
  ['vanilla', { art: 'vanilla', tint: '#FBF3E2' }],
  ['protein', { art: 'protein', tint: '#EDE9FD' }],
  ['banana', { art: 'banana', tint: '#FCF6D5' }],
  ['papaya', { art: 'papaya', tint: '#FDEEDC' }],
  ['carrot', { art: 'carrot', tint: '#FDEBD8' }],
  ['chikoo', { art: 'chikoo', tint: '#F3E7DA' }],
  ['orange', { art: 'orange', tint: '#FDEEDA' }],
  ['detox', { art: 'green', tint: '#E4F7E2' }],
  ['green', { art: 'green', tint: '#E4F7E2' }],
  ['ginger', { art: 'ginger', tint: '#FBF0D9' }],
  ['mango', { art: 'mango', tint: '#FDF1D6' }],
  ['berry', { art: 'berry', tint: '#FBE4F2' }],
  ['lemon', { art: 'lemon', tint: '#FBF6D8' }],
  ['oreo', { art: 'oreo', tint: '#E9E6EE' }],
  ['amla', { art: 'amla', tint: '#EAF8DD' }],
  ['beet', { art: 'beet', tint: '#FDE4EF' }],
  ['rose', { art: 'rose', tint: '#FDE7EF' }],
  ['chia', { art: 'seeds', tint: '#F3EFE3' }],
  ['flax', { art: 'seeds', tint: '#F3EFE3' }],
  ['curd', { art: 'curd', tint: '#FBF4E4' }],
  ['apple', { art: 'apple', tint: '#EEFBDD' }],
  ['shot', { art: 'wheatgrass', tint: '#E4F8E5' }],
  ['bowl', { art: 'mixed', tint: '#FDECE2' }],
];

const DEFAULT_TINT = '#FDEEDA';

function matchFruit(itemName?: string | null): Fruit | null {
  const name = String(itemName ?? '').toLowerCase();
  if (!name) return null;
  for (const [keyword, fruit] of FRUIT) {
    if (name.includes(keyword)) return fruit;
  }
  return null;
}

/**
 * Artwork for a single item, falling back to its category tile.
 *
 * The path comes from art-manifest.json, which scripts/build-art-manifest.js
 * regenerates from the contents of public/assets/art on every build. That is
 * what lets a real render replace an SVG stand-in by being dropped in the
 * directory, with no code change and no list to keep in sync.
 */
export function itemArt(itemName?: string | null, categoryName?: string | null) {
  const fruit = matchFruit(itemName);
  if (!fruit) return categoryArt(categoryName);
  return (ART_MANIFEST as Record<string, string>)[fruit.art] ?? `/assets/art/${fruit.art}.svg`;
}

/** Pastel card tint for an item. Backgrounds only — never behind body text. */
export function itemTint(itemName?: string | null) {
  return matchFruit(itemName)?.tint ?? DEFAULT_TINT;
}
