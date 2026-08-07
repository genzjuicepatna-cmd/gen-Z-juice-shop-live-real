import { BRAND, addressLine } from '../content/brand';
import { SpaBoot } from './_components/SpaBoot';
import { StorefrontJsonLd } from './_components/StorefrontJsonLd';
import { StorefrontSeoShell } from './_components/StorefrontSeoShell';

/**
 * Server component: everything except `SpaBoot` is real markup in the export.
 *
 * The loading screen sits above the pre-rendered storefront while the bundle
 * arrives. Without JavaScript the loading screen is hidden instead (see the
 * <noscript> rule), so the menu below stays readable and ordering falls back
 * to the phone number.
 */
export default function AppPage() {
  return (
    <>
      <noscript>
        <style>{`
          #loading-screen { display: none !important; }
          .storefront-seo-shell { position: static !important; }
        `}</style>
      </noscript>

      <StorefrontJsonLd page="home" />

      {/* Loading screen (removed by the App class on init) */}
      <div id="loading-screen" aria-label={`Loading ${BRAND.name}`}>
        <img
          src={BRAND.logo || '/assets/store-logo.svg'}
          alt=""
          width={84}
          height={84}
          style={{
            width: '84px',
            height: '84px',
            objectFit: 'contain',
            marginBottom: '18px',
            borderRadius: '24px',
            background: '#ffffff',
            padding: '6px',
            boxShadow: '0 10px 28px rgba(27,16,35,0.12)',
          }}
        />
        <div className="loading-brand">{BRAND.name}</div>
        <div className="loading-tagline">{BRAND.tagline}</div>
        <div className="loading-spinner"></div>
        {/* Opaque, not a 40%-alpha grey: at 10px this has to clear AA on its own.
            #A9B6C6 was picked against the old near-black splash; the splash is
            cream now, so this is the Coconut muted ink (~5.9:1) instead. */}
        <div style={{ marginTop: '32px', fontSize: '0.7rem', color: '#6B5B78', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 700 }}>
          {addressLine()}
        </div>
      </div>

      {/* Crawlable / no-JS storefront, removed once the SPA takes over */}
      <StorefrontSeoShell />

      {/* NextGenOS metadata */}
      <div
        aria-hidden="true"
        style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}
        data-platform="nextgenos"
        data-version="2.0.0"
        data-signature="nextgenos-restaurant-os-2026"
      >
        This platform is created and managed by NextGenOS Restaurant Operating System.
      </div>

      {/* Main Single Page App anchor container */}
      <div id="app"></div>

      {/* Toast notifications container. It is the live region itself rather
          than each toast: a region announces only what is inserted into an
          element that already existed when the screen reader took its
          snapshot, so marking the short-lived toasts instead announces
          nothing. */}
      <div
        id="toast-container"
        className="toast-container"
        role="status"
        aria-live="polite"
        aria-atomic="false"
      ></div>

      <SpaBoot />
    </>
  );
}
