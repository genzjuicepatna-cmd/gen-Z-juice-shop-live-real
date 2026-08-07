import type { Metadata, Viewport } from 'next';
import { BRAND, CONTACT, STORE_ORIGIN } from '../content/brand';
/*
 * Stylesheets imported here are render-blocking <link>s in the static export,
 * so this list is the critical path for every visitor.
 *
 * layout.css (35 KB) and sidebar.css (12 KB) are the operator chrome — POS,
 * kitchen, admin sidebar — and contain zero storefront selectors. They used to
 * be here as well as in main.ts, so a customer downloaded and parsed 47 KB of
 * CSS for screens they can never reach, before anything painted.
 *
 * main.ts still imports them, and SpaBoot loads main.ts through a dynamic
 * import, so operators get them as a non-blocking chunk after boot.
 *
 * storefront.css STAYS, despite the same argument appearing to apply — the
 * exported HTML really does use only .seo-shell-*, .loading-* and .static-*
 * classes. Moving it measured 92 -> 59. The SPA replaces the shell within a
 * second or two, and once it does LCP tracks the SPA's hero; making its CSS a
 * second round trip pushed that from 2.6s to 5.3s. Blocking on 71 KB up front
 * is cheaper than blocking the replacement later. Measured, not reasoned.
 */
import '../styles/fonts.css';
import '../styles/variables.css';
import '../styles/base.css';
import '../styles/components-v2.css';
import '../styles/storefront.css';
import '../styles/storefront-static.css';

export const metadata: Metadata = {
  metadataBase: new URL(STORE_ORIGIN),
  alternates: { canonical: '/' },
  // Without these the page declared no icon at all, so every browser fell back
  // to requesting /favicon.ico and got a 404 — the single console error that
  // was holding Best Practices at 96.
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/icon-192.png', sizes: '192x192' }],
  },
  robots: { index: true, follow: true },
  // Describes what the shop actually sells, off its own board — not the
  // placeholder catalogue this copy was first written against.
  title: `${BRAND.name} — Fresh Juice, Shakes & Mojitos in Patna`,
  description: `${BRAND.name} is a juice corner in Kumhrar, Patna. Fresh juices, thick shakes, virgin mojitos and lassi, made to order in two sizes. Order online or visit us on Sandalpur Road.`,
  keywords: `${BRAND.name} Patna, juice shop Patna, fresh juice Patna, shakes Kumhrar, milkshake Patna, virgin mojito Patna, lassi Patna, anar juice Patna, Sandalpur Road juice, juice near me`,
  applicationName: `${BRAND.name} Customer Platform`,
  category: 'food',
  openGraph: {
    title: `${BRAND.name} — Fresh Juice & Shakes in Patna`,
    description: `Order fresh juice, shakes and mojitos from ${BRAND.name}, Kumhrar. Live tracking, rewards, offers and bulk orders.`,
    type: 'website',
    locale: 'en_IN',
    siteName: BRAND.name,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${BRAND.name} — Fresh Juice & Shakes in Patna`,
    description: `Order online, track your order, earn rewards and get support from ${BRAND.name}.`,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: BRAND.name,
  },
  other: {
    'geo.region': 'IN-BR',
    'geo.placename': CONTACT.locality,
    'geo.position': `${CONTACT.latitude};${CONTACT.longitude}`,
    ICBM: `${CONTACT.latitude}, ${CONTACT.longitude}`,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Matches --store-soft: the browser chrome on Android and the PWA splash
  // take this colour, so a cream value framed the near-black page in white.
  themeColor: '#100B16',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Text faces are self-hosted (see scripts/fetch-fonts.js) so first
            paint never blocks on a third-party origin and the PWA renders
            correctly offline. Preload only the latin subsets used above the
            fold; latin-ext loads on demand via its unicode-range. */}
        <link rel="preload" as="font" type="font/woff2" href="/assets/fonts/plus-jakarta-sans-latin.woff2" crossOrigin="anonymous" />
        {/* The display face renders the hero headline — typically the LCP
            element — so it is preloaded alongside the UI face. 29 KB. */}
        <link rel="preload" as="font" type="font/woff2" href="/assets/fonts/fredoka-latin.woff2" crossOrigin="anonymous" />
        {/* Inter is not preloaded: it now serves only tabular figures, none of
            which are above the fold. */}
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
