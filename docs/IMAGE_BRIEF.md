# Image brief for Trending Juice

What to generate, where it goes, and what it replaces. Everything currently in
the app is a hand-drawn SVG stand-in; these are the real assets.

**Confirmed working:** the first `orange` render was correct as delivered —
transparent alpha, right subject, right framing, right lighting. Keep
generating exactly like that. (An earlier note in this file claimed the
background was opaque; that was a bad reading on my side, not a problem with
the image.)

**General rules for every image**

- **PNG, transparent background** unless stated otherwise. The app paints its
  own pastel tint behind each product, so a baked-in background fights it.
- Keep the multicolour striped straw consistent across all 33 — a set with
  varying straws reads scattered.
- Square product shots, subject centred, **~10% empty padding** on all sides.
- One consistent light source across the whole set (soft, top-left) — a mixed
  set reads worse than a plainer consistent one.
- No text, no logos, no watermarks inside the image.
- Don't worry about file size; I'll compress and convert to WebP.

Drop files anywhere and tell me where. I resize to 640x640 and convert to
WebP (the 1.52 MB `orange` PNG became 69 KB with no visible loss), then
`scripts/build-art-manifest.js` picks the file up on the next build — a real
render replaces its SVG stand-in automatically, with no code change.

---

## 1. Product shots — highest impact, do these first

**This is the single biggest gap.** The reference's whole look is carried by
these. 33 drinks, `1024×1024`, transparent PNG.

**Prompt skeleton** (swap the flavour in):

> 3D product render of a clear takeaway cup filled with **{FLAVOUR}**, domed
> lid, colourful straw, glossy highlights, a few floating fruit pieces and
> juice droplets around the cup, playful Gen-Z juice-bar style, soft studio
> lighting from the top left, transparent background, centred, square

Save each as `public/assets/art/{slug}.png`, replacing the `.svg` of the same
name:

| slug | flavour | used by |
|---|---|---|
| `orange` | fresh orange juice | Classic Orange |
| `sweet-lime` | mosambi / sweet lime juice | Sweet Lime |
| `watermelon` | watermelon juice | Watermelon, Watermelon Cooler |
| `pineapple` | pineapple juice | Pineapple |
| `pomegranate` | pomegranate juice | Pomegranate |
| `sugarcane` | sugarcane juice with ginger | Sugarcane Ginger |
| `carrot` | carrot orange juice | Carrot Orange |
| `beet` | beetroot apple carrot juice | Apple Beet Carrot |
| `mango` | thick mango smoothie | Mango Tango, Mango Shake, Mango Sticky Bowl |
| `berry` | mixed berry smoothie | Berry Blast, Mixed Berry Bowl |
| `peanut` | banana peanut butter smoothie | Banana Peanut Butter |
| `strawberry` | strawberry yoghurt smoothie | Strawberry Yoghurt |
| `green` | green detox smoothie | Green Detox |
| `chikoo` | chikoo date shake | Chikoo Date |
| `papaya` | papaya lime smoothie | Papaya Lime |
| `coffee` | iced cold coffee shake | Cold Coffee Shake |
| `chocolate` | chocolate milkshake | Chocolate Shake |
| `oreo` | cookies-and-cream shake | Oreo Shake |
| `vanilla` | vanilla milkshake | Vanilla Shake |
| `rose` | rose falooda shake | Rose Falooda Shake |
| `ginger` | ginger wellness shot, small glass | Ginger Shot |
| `turmeric` | turmeric ginger shot, small glass | Turmeric Ginger Shot |
| `amla` | amla wellness shot, small glass | Amla Shot |
| `wheatgrass` | wheatgrass shot, small glass | Wheatgrass Shot |
| `lemon` | lemon drink | Lemon Cayenne Shot, Nimbu Pani, Masala Shikanji |
| `mixed` | mixed cut-fruit bowl | Seasonal Fruit Bowl |
| `curd` | curd and fruit bowl | Curd Fruit Bowl |
| `blue` | blue lagoon soda | Blue Lagoon Soda |
| `apple` | green apple fizz | Green Apple Fizz |
| `tea` | iced lemon tea | Iced Lemon Tea |
| `protein` | protein shake | Whey Protein Scoop |
| `seeds` | chia seed drink | Chia Seeds, Flax Seeds |
| `dry-fruit` | dry-fruit topped shake | Dry Fruit Topping |

The four **shots** (`ginger`, `turmeric`, `amla`, `wheatgrass`) should be a
small shot glass, not a cup — that visual difference is the category's whole
identity.

## 2. Hero

`public/assets/hero.png` — **1600×1200**, background *not* transparent.

> Wide hero image for a juice bar: a splash of orange, mango and berry juice
> mid-air with fresh fruit slices — orange, watermelon, lime, mango —
> suspended in the splash, deep sunset-orange to magenta gradient background,
> vibrant, glossy, high energy, editorial product photography

Text sits on the left third, so keep that side relatively clear.

## 3. Logo

- `public/assets/store-logo.png` — **512×512**, transparent.
- `public/assets/store-wordmark.png` — **1200×400**, transparent.

The shop's menu board already has a lockup: **TRENDING** in white above
**JUICE** in lime, both in a brushed/painted display face, on black, with
"FRESH. FUN. YOU." underneath. Reproducing that is better than inventing a
new mark — the signage is what customers will have already seen.

> The words "TRENDING JUICE" as a two-line logotype, TRENDING in white above
> JUICE in bright lime green, energetic hand-painted brush lettering with
> slightly uneven baselines, small paint-splatter accents in lime and magenta,
> transparent background

If the render mangles the letters, send a version with no text and I'll set
the words in the app's display face over it.

Also worth capturing while you are at it: the board's **palette** is black,
lime green and magenta. The app's tokens currently lead with mango orange.
Aligning them is a deliberate piece of work (it re-runs the contrast gate over
all 84 token pairs), not something to change by dropping in a logo.

## 4. Category tiles — optional

`public/assets/category-{slug}.png`, **640×420**, background allowed.
Slugs: `juices`, `shakes`, `special`, `combos`,
`refreshers`, `boosters`. Only used where an item has no art of its own, so
these matter far less than §1.

## 5. Icons and social — do last

- `public/icons/icon-192.png` (192×192) and `icon-512.png` (512×512) — the
  installed-app icon. Solid background, logo centred with ~20% padding so
  Android's maskable crop cannot clip it.
- `public/assets/og.png` — **1200×630**, background required. Product plus
  space for a headline; this is the WhatsApp/Instagram link preview.

---

## Priority

1. §1 product shots — everything else is cosmetic next to these
2. §2 hero
3. §3 logo
4. §5 icons and OG
5. §4 category tiles

Sending §1 alone changes how the whole storefront reads.
