import type { MetadataRoute } from 'next';
import { BRAND } from '../content/brand';

/**
 * Web app manifest, served at /manifest.webmanifest.
 *
 * A route rather than a file in public/ so the name and colours come from BRAND
 * and cannot drift from the rest of the site on the next rebrand — the same
 * reason robots.txt and sitemap.xml are generated instead of committed.
 * `output: 'export'` renders this to a static file at build time.
 *
 * There was no manifest at all before this: the layout advertised
 * `appleWebApp.capable`, the CSP allowed `manifest-src 'self'`, and the request
 * 404'd, so the site could not be installed to a home screen.
 *
 * This does NOT make the app work offline — that needs a service worker, and
 * none is registered. `display: standalone` only removes browser chrome.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    // Home-screen labels truncate around 12 characters; BRAND.shortName is the
    // board's own one-word form, kept for exactly this kind of narrow slot.
    short_name: BRAND.shortName,
    description: BRAND.blurb,
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    // Matches the themeColor in layout.tsx. A mismatch shows as a colour jump
    // between the splash screen and the first paint.
    theme_color: '#100B16',
    background_color: '#100B16',
    categories: ['food', 'shopping'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Android masks any icon it is given; without a maskable entry it applies
      // the mask to a square icon and clips the artwork's edges.
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
