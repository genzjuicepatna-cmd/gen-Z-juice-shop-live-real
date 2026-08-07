# UI Contracts & Redesign Baseline

Phase 0 output for the Juice Pop redesign (see `UI_REDESIGN_PLAN.md`).

This is the list of things the redesign is **not** free to change silently, plus the measured
state of the UI before any of it started. Every later phase is reviewed against this file.

It also records two things that are not UI but bit the redesign anyway: the tenant key that must
not follow a rebrand (§5) and how the data layer actually behaves when the network is gone (§6).

---

## 1. Structural selectors under test

Breaking any of these breaks `tests/e2e/`. Restyle them freely; do not rename or remove them
without updating the spec in the same commit.

| Selector | Used by | What it anchors |
|---|---|---|
| `#app` | `main.ts` | SPA mount point |
| `#loading-screen` | `public-launch`, `static-storefront` | pre-boot splash, removed by `hideLoadingScreen` |
| `#storefront-seo-shell` | `accessibility`, `static-storefront` | crawlable shell; **must still be removed once the SPA owns the page** |
| `.storefront-shell` | `accessibility` | live customer SPA root |
| `.store-menu-item-open` | `accessibility`, baseline | menu item opener |
| `.seo-shell-item-name` / `.seo-shell-item-price` | `storefront_seo` | pre-rendered menu rows |
| `.static-menu-price` / `.static-menu-section li` | `static-storefront` | static `/menu` page rows |
| `.aether-drawer-sheet` | `accessibility`, baseline | item detail dialog |
| `.store-checkout-shell` | baseline | cart/checkout page root |
| `.modal-overlay .modal` | `accessibility` | generic dialog; `initModalA11y` binds focus trap + Escape to `.modal-overlay` |
| `#btn-view-cart` | baseline | **desktop-only** floating cart (hidden < 800px) |
| `.login-screen` | `test_logged_in`, `accessibility` | staff sign-in root |
| `#login-email` | `accessibility` | must keep a **non-zero `border-radius`** — there is an explicit regression test asserting the field is styled, not a browser default |
| `#tab-pin`, `#login-numpad`, `#staff-pin` | `test_login_flow` | PIN step (not present in the default email state) |
| `.app-sidebar` | `test_logged_in`, baseline | admin chrome; asserted **absent** when unauthenticated |
| `#pos-view` | `test_logged_in` | POS root; asserted absent when unauthenticated |
| `#toast-container` | `main.ts` | toast host |
| `script[type="application/ld+json"]` | `storefront_seo` | structured data |

## 2. Accessible names under test

These are matched by role + name, so the **text and `aria-label` values** are the contract:

- `heading "Staff sign in"`
- `navigation "Mobile customer navigation"`
- `button /^Add .+ to cart$/`
- `button /^Cart \d+$/` — the mobile bottom-nav cart
- `button /Proceed to Checkout/`, `button /Place Order/`
- `button /Authorize access/`
- labels `Account email`, `Password`
- exactly one `<h1>` per page

### Admin tab labels (operator a11y sweep)

`tests/e2e/admin-accessibility.spec.ts` walks `#/admin` by clicking its tabs by
accessible name, because all seven screens live behind one route and the sweep
would otherwise only ever see whichever mounts by default. The list in
`ADMIN_TABS` must match the labels in `src/views/admin/AdminView.tsx`:

    Analytics · Menu · Past orders · Branding · Staff · Settings

Rename a tab and the sweep fails with "Admin tab X is missing — rename it here
too", which is the intended behaviour: a silently skipped tab is worse than a
red test.

Note the match is `exact: true`. That only works because the tab's icon carries
`aria-hidden="true"` — a Material Symbols glyph is a **ligature**, so an
unmarked icon span puts its codepoint name into the accessible name and the
button announces as "analytics Analytics".

### Two source-level guards

Both are plain unit tests, so they run in `npm test` with no browser:

- **`tests/icon_labelling.test.ts`** — every `.material-symbols-rounded` span
  must carry `aria-hidden="true"` (or an explicit `aria-label` / `role`). 238
  of 270 were unmarked. Marking them is only half the fix: a control whose only
  content was the ligature becomes *nameless*, which is worse. The axe suites
  gate on `button-name`, which is what caught the two that did — the AI Center
  send button and the Orders print button.
- **`tests/type_scale.test.ts`** — no inline `fontSize` below 12px
  (`--text-xs`) in an operator view. There were 53, at 8–11px, on screens staff
  read across a counter. Two files are exempted by name, each because the small
  size *is* what is being shown: Branding's third-scale storefront simulator
  and Settings' 58mm thermal receipt preview.

### Brand-derived assertions (Phase 1, done)

The specs no longer hardcode the store name. `accessibility.spec.ts`,
`public-launch.spec.ts` and `static-storefront.spec.ts` import `BRAND` from
`src/content/brand.ts`, and `storefront_seo.test.ts` imports `STORE_ORIGIN`,
so a future rename does not break them.

Two literals remain deliberately, because they have no single source:

- `'Everything we make'` — the `/menu` h1, written inline in
  `src/app/menu/page.tsx`. Change both together.
- the boot splash colours in `storefront_seo.test.ts`, which assert the splash
  ends on the storefront cream so the SSG -> SPA handoff cannot flash.

## 3. Viewport-dependent behaviour (do not "fix" in the redesign)

The cart control **intentionally differs by width**, and a redesign that unifies them must update
the tests deliberately rather than by accident:

- **≥ 800px** — `#btn-view-cart`, a floating bar, `aria-label="N item(s) in cart, total ₹X"`.
- **< 800px** — hidden by an explicit rule in `storefront.css`; the bottom navigation's
  `Cart N` button owns the cart, so the two never stack.

The catalogue is read from Dexie **after** `.storefront-shell` paints. Any test or capture that
needs menu content must wait on `.store-menu-item-open`, not on the shell.

---

## 4a. Lighthouse (measured, gated)

Lighthouse had **never run against this app**. The CI step used
`npx vite preview` — vite is not a dependency of this Next.js project, so no
server ever started — and it asserted no score, uploading whatever it produced
as an artifact. Both are fixed: the step uses `npm run preview`, and
`scripts/check-lighthouse.js` fails the build below threshold.

Measured on the built export, mobile emulation, three runs:

| Category | Score | Floor enforced |
|---|---|---|
| Performance | 90–94 | 85 |
| Accessibility | 100 | 100 |
| Best Practices | 100 | 100 |
| SEO | 100 | 100 |

FCP 1.1s · LCP 2.6s · TBT 190–300ms · CLS 0.

The performance floor is **70**, and CI takes the **median of three runs**.
That is not caution for its own sake: on a loaded runner this exact build
scored 94, 55, 90 and 64 on four consecutive runs of identical code. A gate
reading a single run would fail about a third of the time, and a gate that
fails randomly gets deleted — which is how the original step ended up
asserting nothing at all. The floor catches the catastrophic case (the 54 that
shipped unnoticed), not single-point movement. The other three categories are
rule checks rather than timings, so they are deterministic and held at 100.

### What moved it, and what did not

Performance was **54–64**. One line fixed it: `services/telemetry.ts` statically
imported `supabaseClient`, and `main.ts` imports telemetry eagerly because its
constructor installs the global error handlers. That put the entire Supabase
SDK in the customer's critical path for a call that only runs when there is
telemetry to upload. Deferring it to a dynamic import inside `sendToCloud`
took LCP from 5.2s to 2.5s and TBT from 1260ms to 200ms.

`layout.css` and `sidebar.css` were then removed from the root layout — 47 KB
of operator chrome, containing zero storefront selectors, that every customer
downloaded and parsed before anything painted.

**`storefront.css` was tried the same way and reverted.** The argument looked
identical — the exported HTML uses only `.seo-shell-*`, `.loading-*` and
`.static-*` classes. It measured **92 → 59**. The SPA replaces the shell within
a second or two, and once it does LCP tracks the SPA's hero; making its CSS a
second round trip pushed that to 5.3s. Blocking on 71 KB up front is cheaper
than blocking the replacement later. The comment in `layout.tsx` records this
so it is not "optimised" again.

---

## 4. Measured baseline (pre-redesign)

Captured on branch `claude/ui-redesign-gen-z-alpha-0bnzqd` at the commit tagged in §6.

### Visual capture

`npm run visual:baseline` → 80 screenshots, 16 surfaces × 5 devices (Desktop Chrome, iPhone SE,
iPhone 15, Pixel 5, iPad Pro 11), full-page, animations disabled.

Surfaces: 6 static routes with **JavaScript disabled** (the crawler/no-JS view), 6 SPA pages,
item-detail sheet, cart affordance, cart page, staff sign-in.

**Authenticated admin/POS views** are now capturable without a Supabase project.
`tests/e2e/support/stubSupabase.ts` intercepts the network and answers the auth and
`staff_memberships` calls, so all 13 operator routes render:

```
npm run visual:admin        # builds against the stub origin, then captures
```

The app must be built against the stub origin for this (the script does it), because
`getSupabaseClient()` returns null when no URL is configured and the login never reaches
the network. Real credentials still take precedence:

```
E2E_STAFF_EMAIL=... E2E_STAFF_PASSWORD=... npm run visual:baseline
```

This stubs the *server's answers* only. It does not weaken the guard — `test_logged_in.spec.ts`
still asserts that forged localStorage flags cannot bypass cloud authorization, and that test
does not use the helper.

> **Status after Phase 2.** Everything in the "before" column below has been
> cleared: 78/78 contrast pairs pass, all 14 undefined custom properties are
> defined, and the pre-existing staff sign-in axe failure is fixed. The numbers
> are kept as the record of what the redesign started from.

### Contrast (`npm run check:contrast`)

The gate resolves 31 token pairs per theme, compositing translucent layers over their real
backdrops. Pre-redesign state — **this is the floor Phase 2 must clear**:

| Result | Count | Detail |
|---|---|---|
| Below WCAG threshold | **2** | `--border-active` on `--bg-surface` = **1.34:1** (dark) / **1.40:1** (light), needs 3:1 as a state border |
| Referenced but undefined | **8 × 2 themes** | `--color-danger-on-surface`, `--color-warning-on-surface`, `--color-info-on-surface`, `--color-success-fill`, `--color-danger-fill`, `--color-warning-fill`, `--color-info-fill`, `--focus-ring` |
| light ↔ system-light drift | **0** | the duplicated blocks are currently in sync |

Text pairs all pass today and must stay passing: `--text-muted` is the tightest at **5.28:1**
(dark, on a card) and `#FFFFFF` on `--color-primary-fill` at **5.12:1**.

### What the token gate cannot cover: owner-chosen colour

Admin → Branding lets the shop owner type any hex for the storefront accent, and
that colour ends up as a fill behind a label. No build-time check reaches a value
that does not exist until someone types it, so the ink is derived at render time
by `readableInk()` in `src/utils/contrast.ts`.

It picks whichever of `#1B1023` or `#FFFFFF` reads better. **Two inks cannot
cover every hue.** Contrast against ink rises with the fill's luminance while
contrast against white falls, and the curves cross near luminance 0.195 — a mid
grey — where the better of the two is still only about **4.3:1**. `#8B5CF6`
(`--nextgenos-purple`) sits in that trough, which is why the system only ever
uses it as text on a surface via `--nextgenos-purple-on-surface`, never as a fill.

Branding shows the owner the measured ratio and warns below 4.5:1 rather than
silently shipping an unreadable button. `tests/contrast.test.ts` pins both the
behaviour and the trough, so the limit stays a known quantity.

### Undefined custom properties (latent bug, pre-existing)

Independently of the contrast manifest, **14 custom properties are used via `var()` across the
stylesheets but defined nowhere**. Only `--color-error` has a fallback, so the rest resolve to
invalid-at-computed-value-time and those declarations are dropped by the browser:

```
--bg-active          --bg-surface-glass   --border-subtle (10 uses)
--color-error        --duration-instant   --duration-fast (4 uses)
--duration-normal    --ease-out-expo      --ease-spring
--font-mono          --radius-xs          --shadow-glow-active (3 uses)
--shadow-occlusion   --text-md
```

Phase 2 defines all 14. Anything that visibly changes as a result is a **fix**, not a regression —
expect diffs in the baseline around borders, focus states and transition timing.

---

## 5. Data keys

`'trending-juice'` is the **store identifier**. It is the
`store_id` column in Supabase (`staff_memberships`, `staff`, orders, telemetry)
and the `store_id` localStorage key.

| Identifier | Where | Purpose |
|---|---|---|
| `TrendingJuicePOS` | `new Dexie('TrendingJuicePOS')` in `src/db/database.ts`, and the matching `indexedDB.deleteDatabase` call in `LoginScreen.tsx` | The IndexedDB database name. |
| `com.trendingjuice.pos` | `capacitor.config.json`, `android/app/src/main/res/values/strings.xml` | The Android application ID. |


## 6. The data layer is online-first, not local-first

### Where the menu lives with no Supabase configured

There are **three** copies, and knowing which one you are looking at saves a
lot of confusion:

1. **`src/db/seed.ts`** — the source. Plain code, committed. On first run it
   writes the catalogue into IndexedDB.
2. **IndexedDB (Dexie), in the browser** — what the POS and storefront read at
   runtime. Per-browser and per-device: clearing site data wipes it, another
   device has its own copy, and nothing is shared between them. Edits made in
   Admin → Menu land here and go no further while Supabase is unconfigured.
3. **`src/data/menu-snapshot.json`** — a build-time bake of the catalogue,
   committed, imported by the server components so the statically exported
   HTML contains real dish names and prices. Without it a crawler, or a
   visitor with JavaScript off, receives an empty page.

`scripts/build-menu-snapshot.js` refreshes (3) from Supabase at build time and
**falls back to the committed file** when credentials are absent, which is why
the build logs `Supabase credentials absent; keeping the committed snapshot`.
So with no backend, (3) only changes when someone regenerates it.

The consequence worth internalising: **with Supabase unconfigured there is no
shared store.** Two staff on two tablets are two unrelated databases. That is
the single biggest reason to connect the backend before the shop opens, not a
detail to tidy up afterwards.


Worth stating plainly, because getting it backwards changes what you think the
bugs are.

**Supabase is the source of truth. Dexie is a local mirror.** The seed says so
outright: *"Cloud-first: If Supabase has data, pull from cloud instead of
seeding locally"* and *"Staff startup remains cloud-first for cross-device
consistency."* This is the opposite of local-first, where the device copy is
authoritative and sync is opportunistic reconciliation.

How hard the server wins varies by table, and the difference is load-bearing:

| Data | Hydration | Effect |
|---|---|---|
| menu_categories, menu_items, staff, tables, inventory, suppliers, customers | `replaceLocalStore()` | Computes stale local primary keys, `bulkDelete`s them, then `bulkPut`s. **Cloud is wholesale authoritative** — a local row the server does not know about is destroyed. |
| **orders** | merge by `clientOrderId` | Matches the existing local row, preserves its auto-increment `id`, and `put`s. **Deliberately not `replaceLocalStore`.** |

**Do not "simplify" the orders pull into `replaceLocalStore`.** That exception is
the only reason an order taken during an outage survives the next hydration
instead of being deleted as stale. It is the single place local writes are
protected.

### What that means when the network is gone

Measured, not inferred (Playwright, `context.setOffline(true)`):

| | Result |
|---|---|
| Service workers registered | **0** |
| `<link rel="manifest">` | **0** |
| Reload while offline | **`ERR_INTERNET_DISCONNECTED`** — browser error page |
| Tab left open, network cut | Menu still renders from Dexie; in-app navigation works |

`main.ts` imports `virtual:pwa-register`, a **Vite** virtual module. This project
is Next.js; `vite-plugin-pwa` is not in `package.json` and no `sw.js` or
`.webmanifest` is emitted. The import always throws and is swallowed by a
`.catch()` logging *"registration skipped (expected during local dev/testing)"*,
so it reads as benign. The `onOfflineReady` handler logging *"Platform is
offline-ready and assets are fully cached"* is dead code that can never fire.

**Staff sessions do not survive an outage — they are cleared.**
`restoreSession()` → `_resolveCloudStaff()` queries `staff_memberships`. Offline,
supabase-js returns an error, the code wraps it in `CloudStaffAccessError`, and
because the persisted session's `app_metadata` still yields a staff hint it takes
the branch that calls `signOutCloudStaff()`. An outage does not merely block
login; it signs the operator out.

None of the above is an oversight in an offline-capable system. The architecture
assumes connectivity end to end — cloud-validated auth, cloud-authoritative
catalogue, server-validated checkout. The right description is **online-first
with a local mirror that buys continuity, not autonomy.**

Adding a service worker and a manifest would make a deliberately online-first app
*degrade gracefully*; it would not make it offline-first. Only an auth grace
window (keeping a cached session for a bounded period when the failure is a
network error rather than a rejected membership) would genuinely soften the
online-first stance, which is why that one needs an explicit product decision.

### Dexie index trap in the same path

`orders` indexes `clientOrderId`, `idempotencyKey` and `updatedAt`. Dexie rejects
the **whole write** with `Invalid key provided` if an indexed path is `undefined`
on the incoming rows, and `fullPull` logs it and moves on — so the board simply
comes up empty with no obvious cause. Any code producing order rows for
hydration must populate those three.

## 7. Environment notes

- **Chromium mismatch.** The sandbox ships build 1194; this Playwright expects 1223. Do not run
  `playwright install`. `playwright.config.js` honours `PLAYWRIGHT_CHROMIUM_EXECUTABLE`:

  ```
  PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e
  ```

- **Visual capture is excluded from CI** via `testIgnore` unless `VISUAL_CAPTURE=1`, which the
  `visual:baseline` / `visual:after` scripts set.

- Capture output (~62 MB/run) is gitignored.

## 8. Reproducing the baseline later

The container is ephemeral and the PNGs are not committed. To regenerate the "before" set after
the redesign has landed:

```bash
git checkout <pre-redesign-commit>     # the commit that added this file
npm run build
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run visual:baseline
git checkout claude/ui-redesign-gen-z-alpha-0bnzqd
npm run build && npm run visual:after
```

Then diff `tests/e2e/__baseline__/` against `tests/e2e/__after__/` surface by surface.
