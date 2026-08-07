/**
 * Readable text colour for an arbitrary fill.
 *
 * The design tokens ship a matched ink for every accent — `--color-primary`
 * pairs with `--color-primary-ink`, and `scripts/check-contrast.js` gates
 * those pairs at build time. That only covers colours we chose. Branding lets
 * the shop owner pick any hex for the storefront accent, and no build-time
 * check can cover a value that does not exist until someone types it.
 *
 * So anywhere owner-chosen colour becomes a fill behind text, the ink has to
 * be derived at render time. This is that derivation.
 */

/** The ink used across the design system, and the darkest text on offer. */
export const INK = '#1B1023';
export const PAPER = '#FFFFFF';

/** WCAG relative luminance for an sRGB hex colour. */
export function relativeLuminance(hex: string): number | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!match) return null;

  let digits = match[1];
  if (digits.length === 3) {
    digits = digits
      .split('')
      .map((d) => d + d)
      .join('');
  }

  const value = parseInt(digits, 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((c) => {
    const srgb = c / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG contrast ratio between two hex colours, or null if either is unparseable. */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Whichever of INK or PAPER reads better on `fill`.
 *
 * Falls back to INK for anything unparseable — an empty or half-typed hex from
 * a colour field mid-edit should not flash white text onto a white swatch.
 */
export function readableInk(fill?: string | null): string {
  const luminance = relativeLuminance(String(fill ?? ''));
  if (luminance === null) return INK;

  const againstPaper = 1.05 / (luminance + 0.05);
  const againstInk = (luminance + 0.05) / (relativeLuminance(INK)! + 0.05);
  return againstInk >= againstPaper ? INK : PAPER;
}
