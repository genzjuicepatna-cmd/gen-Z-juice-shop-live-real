#!/usr/bin/env node
/**
 * Contrast gate for the design token layer.
 *
 * The palette in src/styles/variables.css carries deliberate `-on-surface`
 * (legible as text) and `-fill` (legible behind white text) variants, and the
 * ratios behind those choices used to live only in code comments. Comments do
 * not fail a build, so the ratios drifted every time a colour was "just
 * slightly" adjusted. This script re-derives them from the stylesheet itself.
 *
 * It resolves every pair below in both themes, composites translucent layers
 * over their real backdrops, and fails if any pair drops under its WCAG 2.1
 * threshold. Run standalone or as part of `npm run build`:
 *
 *   node scripts/check-contrast.js
 *   node scripts/check-contrast.js --verbose
 */

import fs from 'node:fs';
import path from 'node:path';

const TOKENS_FILE = path.resolve(process.cwd(), 'src', 'styles', 'variables.css');

/**
 * The storefront carries its own `--store-*` palette, declared in
 * storefront.css rather than in variables.css. It predates the token system
 * and was never brought under this gate, which is how `--store-accent` — the
 * deep-amber value meant to be read as TEXT on cream — ended up as the fill
 * behind white button labels in four places. Nothing checked it, so a comment
 * saying the ratios had been verified was the only safeguard.
 *
 * Parsed alongside variables.css so those tokens resolve here too. Its :root
 * block is merged into the base scope; the storefront is light-only, so there
 * is no dark override to read.
 */
const STOREFRONT_TOKENS_FILE = path.resolve(process.cwd(), 'src', 'styles', 'storefront.css');
const VERBOSE = process.argv.includes('--verbose');

/* ── WCAG thresholds ──────────────────────────────────────────────────────
 * 4.5:1  body text
 * 3.0:1  large text (>=18.66px bold / >=24px) and non-text UI that carries
 *        meaning: focus rings, state borders, chart strokes
 */
const AA_TEXT = 4.5;
const AA_LARGE = 3.0;

/**
 * Every pair the palette promises to hold.
 *
 * `on` is a backdrop stack, nearest layer first: a translucent card token is
 * composited over the surface beneath it before the ratio is taken, because
 * that is what the eye actually receives.
 */
const PAIRS = [
  // ── Body copy ──
  { fg: '--text-primary', on: ['--bg-primary'], min: AA_TEXT },
  { fg: '--text-primary', on: ['--bg-surface'], min: AA_TEXT },
  { fg: '--text-primary', on: ['--bg-secondary'], min: AA_TEXT },
  { fg: '--text-primary', on: ['--bg-card', '--bg-surface'], min: AA_TEXT },
  { fg: '--text-secondary', on: ['--bg-primary'], min: AA_TEXT },
  { fg: '--text-secondary', on: ['--bg-surface'], min: AA_TEXT },
  { fg: '--text-secondary', on: ['--bg-card', '--bg-surface'], min: AA_TEXT },
  { fg: '--text-muted', on: ['--bg-primary'], min: AA_TEXT },
  { fg: '--text-muted', on: ['--bg-surface'], min: AA_TEXT },
  { fg: '--text-muted', on: ['--bg-card', '--bg-surface'], min: AA_TEXT },

  // ── Hero panel ──
  // The storefront hero is a gradient, and a gradient cannot be audited by axe
  // or by a browser. Gating both stops is the closest thing to gating the ramp:
  // white has to clear AA at either end, so it clears everywhere between.
  { fg: '#FFFFFF', on: ['--hero-start'], min: AA_TEXT, note: 'hero gradient, dark end' },
  { fg: '#FFFFFF', on: ['--hero-end'], min: AA_TEXT, note: 'hero gradient, light end' },

  // ── Storefront palette ──
  // --store-pop is the vivid fill and carries DARK ink, never white; white on
  // mango is 2.1:1. --store-accent is the opposite: a text colour on cream,
  // too dark to be a fill under white.
  { fg: '--store-pop-ink', on: ['--store-pop'], min: AA_TEXT, note: 'storefront CTA fill' },
  { fg: '--store-accent', on: ['--store-soft'], min: AA_TEXT, note: 'accent as text on cream' },
  { fg: '--store-ink', on: ['--store-panel'], min: AA_TEXT, note: 'storefront card copy' },
  { fg: '--store-body', on: ['--store-panel'], min: AA_TEXT },
  { fg: '--store-muted', on: ['--store-panel'], min: AA_TEXT },
  { fg: '--store-ink', on: ['--store-soft'], min: AA_TEXT },
  { fg: '--store-body', on: ['--store-soft'], min: AA_TEXT },

  // ── Accent used AS TEXT: this is what `-on-surface` exists for ──
  { fg: '--color-primary-on-surface', on: ['--bg-primary'], min: AA_TEXT },
  { fg: '--color-primary-on-surface', on: ['--bg-surface'], min: AA_TEXT },
  { fg: '--color-primary-on-surface', on: ['--bg-card', '--bg-surface'], min: AA_TEXT },
  { fg: '--color-success-on-surface', on: ['--bg-primary'], min: AA_TEXT },
  { fg: '--color-success-on-surface', on: ['--bg-surface'], min: AA_TEXT },
  { fg: '--color-danger-on-surface', on: ['--bg-primary'], min: AA_TEXT },
  { fg: '--color-danger-on-surface', on: ['--bg-surface'], min: AA_TEXT },
  { fg: '--color-warning-on-surface', on: ['--bg-primary'], min: AA_TEXT },
  { fg: '--color-warning-on-surface', on: ['--bg-surface'], min: AA_TEXT },
  { fg: '--color-info-on-surface', on: ['--bg-primary'], min: AA_TEXT },
  { fg: '--color-info-on-surface', on: ['--bg-surface'], min: AA_TEXT },
  { fg: '--color-secondary-on-surface', on: ['--bg-primary'], min: AA_TEXT },
  { fg: '--color-secondary-on-surface', on: ['--bg-surface'], min: AA_TEXT },
  { fg: '--nextgenos-purple-on-surface', on: ['--bg-primary'], min: AA_TEXT },
  { fg: '--nextgenos-purple-on-surface', on: ['--bg-surface'], min: AA_TEXT },

  // ── Ink label on a vivid fill: what keeps buttons saturated AND legible ──
  { fg: '--color-primary-ink', on: ['--color-primary'], min: AA_TEXT },
  { fg: '--color-cta-ink', on: ['--color-cta'], min: AA_TEXT },
  { fg: '--color-cta-ink', on: ['--color-cta-hover'], min: AA_TEXT },
  { fg: '#FFFFFF', on: ['--color-punch-fill'], min: AA_TEXT },
  { fg: '--color-secondary-ink', on: ['--color-secondary'], min: AA_TEXT },
  { fg: '--color-success-ink', on: ['--color-success'], min: AA_TEXT },
  { fg: '--color-danger-ink', on: ['--color-danger'], min: AA_TEXT },
  { fg: '--color-warning-ink', on: ['--color-warning'], min: AA_TEXT },
  { fg: '--color-info-ink', on: ['--color-info'], min: AA_TEXT },

  // ── Accent used AS A FILL behind white label text ──
  { fg: '#FFFFFF', on: ['--color-primary-fill'], min: AA_TEXT },
  { fg: '#FFFFFF', on: ['--color-success-fill'], min: AA_TEXT },
  { fg: '#FFFFFF', on: ['--color-danger-fill'], min: AA_TEXT },
  { fg: '#FFFFFF', on: ['--color-warning-fill'], min: AA_TEXT },
  { fg: '#FFFFFF', on: ['--color-info-fill'], min: AA_TEXT },

  // ── Non-text UI that carries meaning ──
  { fg: '--border-active', on: ['--bg-surface'], min: AA_LARGE, note: 'state border' },
  { fg: '--focus-ring', on: ['--bg-primary'], min: AA_LARGE, note: 'focus indicator' },
  { fg: '--focus-ring', on: ['--bg-surface'], min: AA_LARGE, note: 'focus indicator' },
];

/* ── CSS parsing ─────────────────────────────────────────────────────────── */

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Collect custom properties per selector.
 *
 * Custom property values never contain a closing brace, so matching innermost
 * `{...}` blocks is sufficient here and avoids pulling in a CSS parser. The
 * @media wrapper is handled by keying on the selector text alone.
 */
/**
 * `accept` decides which selectors count as token scopes. It defaults to
 * :root, which is where variables.css declares everything; the storefront
 * palette lives on .storefront-shell instead and passes its own predicate.
 */
function parseScopes(css, accept = (selector) => selector.startsWith(':root')) {
  const scopes = new Map();
  const blockRe = /([^{}]+)\{([^{}]*)\}/g;
  let match;

  while ((match = blockRe.exec(css)) !== null) {
    const selector = match[1].trim().split('\n').pop().trim();
    const body = match[2];
    if (!accept(selector)) continue;

    const decls = scopes.get(selector) ?? new Map();
    const declRe = /(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g;
    let decl;
    while ((decl = declRe.exec(body)) !== null) {
      // Multi-line values (shadow stacks) are indented differently in the
      // light and system-light blocks. Collapse whitespace so the drift check
      // compares meaning rather than formatting.
      decls.set(decl[1], decl[2].replace(/\s+/g, ' ').trim());
    }
    scopes.set(selector, decls);
  }
  return scopes;
}

/* ── Colour maths ────────────────────────────────────────────────────────── */

function parseColor(value, tokens, seen = new Set()) {
  if (!value) return null;
  const raw = String(value).trim();

  const varMatch = raw.match(/^var\(\s*(--[a-zA-Z0-9-]+)\s*(?:,\s*([\s\S]+))?\)$/);
  if (varMatch) {
    const [, name, fallback] = varMatch;
    if (seen.has(name)) return null; // cyclic reference
    seen.add(name);
    if (tokens.has(name)) return parseColor(tokens.get(name), tokens, seen);
    return fallback ? parseColor(fallback, tokens, seen) : null;
  }

  let m = raw.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let hex = m[1];
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join('');
    if (hex.length !== 6 && hex.length !== 8) return null;
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
    };
  }

  m = raw.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return null;
    return {
      r: parts[0],
      g: parts[1],
      b: parts[2],
      a: parts.length > 3 && !Number.isNaN(parts[3]) ? parts[3] : 1,
    };
  }

  return null; // gradients, keywords, non-colour values
}

/** Composite `top` over `bottom` (source-over alpha blend). */
function over(top, bottom) {
  const a = top.a + bottom.a * (1 - top.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const blend = (t, b) => (t * top.a + b * bottom.a * (1 - top.a)) / a;
  return { r: blend(top.r, bottom.r), g: blend(top.g, bottom.g), b: blend(top.b, bottom.b), a };
}

function luminance({ r, g, b }) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(fg, bg) {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

/* ── Evaluation ──────────────────────────────────────────────────────────── */

/** Flatten a backdrop stack into one opaque colour, bottom layer last. */
function resolveBackdrop(stack, tokens, themeName) {
  const layers = [];
  for (const token of stack) {
    const colour = parseColor(tokens.has(token) ? tokens.get(token) : token, tokens);
    if (!colour) return { error: `unresolved backdrop token ${token}` };
    layers.push(colour);
  }
  // An opaque page background anchors the stack; without one, alpha is
  // meaningless and the reported ratio would be optimistic.
  const base = layers[layers.length - 1];
  if (base.a < 1) {
    const page = parseColor(tokens.get('--bg-primary'), tokens);
    if (!page) return { error: `no opaque base beneath ${stack.join(' / ')} in ${themeName}` };
    layers.push(page);
  }
  return { colour: layers.reduceRight((bottom, top) => over(top, bottom)) };
}

function evaluate(themeName, tokens) {
  const failures = [];
  const missing = [];
  const rows = [];

  for (const pair of PAIRS) {
    const label = `${pair.fg} on ${pair.on.join(' / ')}`;

    if (pair.fg.startsWith('--') && !tokens.has(pair.fg)) {
      missing.push(`${themeName}: ${pair.fg} is not defined`);
      continue;
    }
    const undefinedBackdrop = pair.on.find((t) => t.startsWith('--') && !tokens.has(t));
    if (undefinedBackdrop) {
      missing.push(`${themeName}: ${undefinedBackdrop} is not defined`);
      continue;
    }

    const fg = parseColor(tokens.has(pair.fg) ? tokens.get(pair.fg) : pair.fg, tokens);
    if (!fg) {
      missing.push(`${themeName}: ${pair.fg} did not resolve to a colour`);
      continue;
    }

    const backdrop = resolveBackdrop(pair.on, tokens, themeName);
    if (backdrop.error) {
      missing.push(`${themeName}: ${backdrop.error}`);
      continue;
    }

    // Translucent foreground text is composited too — otherwise a 60%-alpha
    // label reports the ratio of a colour nobody ever sees.
    const flatFg = fg.a < 1 ? over(fg, backdrop.colour) : fg;
    const ratio = contrast(flatFg, backdrop.colour);
    const pass = ratio >= pair.min;

    rows.push({ label, ratio, min: pair.min, pass, note: pair.note });
    if (!pass) {
      failures.push(
        `${themeName}: ${label} = ${ratio.toFixed(2)}:1, needs ${pair.min}:1` +
          (pair.note ? ` (${pair.note})` : '')
      );
    }
  }

  return { failures, missing, rows };
}

/* ── Main ────────────────────────────────────────────────────────────────── */

function main() {
  if (!fs.existsSync(TOKENS_FILE)) {
    console.error(`[contrast] token file not found: ${TOKENS_FILE}`);
    process.exit(1);
  }

  const css = stripComments(fs.readFileSync(TOKENS_FILE, 'utf8'));
  const scopes = parseScopes(css);

  // Merge the storefront's own palette into :root so --store-* resolves.
  // They are declared on `.storefront-shell, .store-checkout-shell,
  // .store-success-shell` rather than :root — deliberately, so the customer
  // accessibility preferences can re-point them without touching the operator
  // palette — so take every scope in the file that declares one.
  if (fs.existsSync(STOREFRONT_TOKENS_FILE)) {
    const storeScopes = parseScopes(
      stripComments(fs.readFileSync(STOREFRONT_TOKENS_FILE, 'utf8')),
      () => true
    );
    const merged = new Map(scopes.get(':root') || []);
    let found = 0;
    for (const [, declarations] of storeScopes) {
      for (const [name, value] of declarations) {
        if (!name.startsWith('--store-')) continue;
        // First declaration wins: later scopes are preference overrides
        // (.pref-high-contrast and friends), not the default palette.
        if (!merged.has(name)) {
          merged.set(name, value);
          found += 1;
        }
      }
    }
    if (!found) {
      console.error('[contrast] no --store-* tokens found in storefront.css — the parser or the file moved.');
      process.exit(1);
    }
    scopes.set(':root', merged);
  }

  const base = scopes.get(':root');
  if (!base) {
    console.error('[contrast] no :root token block found in variables.css');
    process.exit(1);
  }

  const lightOverrides = scopes.get(':root[data-theme="light"]');
  if (!lightOverrides) {
    console.error('[contrast] no :root[data-theme="light"] block found in variables.css');
    process.exit(1);
  }

  const themes = {
    dark: base,
    light: new Map([...base, ...lightOverrides]),
  };

  const problems = [];
  const notDefined = [];

  for (const [name, tokens] of Object.entries(themes)) {
    const { failures, missing, rows } = evaluate(name, tokens);
    problems.push(...failures);
    notDefined.push(...missing);

    if (VERBOSE) {
      console.log(`\n  ${name}`);
      for (const row of rows) {
        const mark = row.pass ? 'ok  ' : 'FAIL';
        console.log(
          `    ${mark} ${row.ratio.toFixed(2).padStart(6)}:1  (min ${row.min})  ${row.label}`
        );
      }
    }
  }

  /* The light theme is declared twice — once for the explicit toggle, once
   * inside the prefers-color-scheme block for `data-theme="system"`. They are
   * maintained by copy-paste, so drift between them is silent and only shows
   * up for users on the system setting. */
  const systemLight = scopes.get(':root[data-theme="system"]');
  const drift = [];
  if (systemLight) {
    for (const [token, value] of lightOverrides) {
      if (!systemLight.has(token)) {
        drift.push(`  ${token} is missing from the system-light block`);
      } else if (systemLight.get(token) !== value) {
        drift.push(`  ${token}: light="${value}" but system-light="${systemLight.get(token)}"`);
      }
    }
    for (const token of systemLight.keys()) {
      if (!lightOverrides.has(token)) drift.push(`  ${token} is only in the system-light block`);
    }
  }

  if (notDefined.length) {
    console.error('\n[contrast] tokens referenced by the manifest but not defined:');
    [...new Set(notDefined)].forEach((m) => console.error(`  ${m}`));
  }
  if (drift.length) {
    console.error('\n[contrast] light and system-light token blocks have drifted:');
    drift.forEach((d) => console.error(d));
  }
  if (problems.length) {
    console.error('\n[contrast] pairs below their WCAG threshold:');
    problems.forEach((p) => console.error(`  ${p}`));
  }

  if (notDefined.length || drift.length || problems.length) {
    console.error(
      `\n[contrast] FAILED — ${problems.length} contrast, ${new Set(notDefined).size} undefined, ${drift.length} drift.`
    );
    process.exit(1);
  }

  const checked = PAIRS.length * Object.keys(themes).length;
  console.log(`[contrast] ${checked} token pairs pass WCAG AA across light and dark.`);
}

main();
