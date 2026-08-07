// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The Material Symbols font is **subset** — `public/assets/material-symbols-rounded.woff2`
 * carries only the icons this app uses, 1.72 MB of TTF cut down to about 18 KB.
 *
 * That is a good trade and a sharp edge. Icons are ligatures: the element's
 * text is the icon name and the font substitutes a glyph for it. A name that is
 * not in the subset gets no substitution, so the raw name renders — and since
 * `.material-symbols-rounded` is `width: 1em; overflow: hidden`, what a user
 * sees is one or two clipped letters. It does not read as a missing icon. It
 * reads as a rendering glitch, which is why five of them survived unnoticed:
 * `code` on the developer role badge, `ac_unit` on the customer's "No ice"
 * option, and three added during the juice-bar rework.
 *
 * The manifest is written by `scripts/dump-icon-names.py`, which reads the
 * shipped font. Node cannot parse a WOFF2 without a dependency, so the font is
 * the source of truth and the JSON is its committed projection — regenerate
 * both together whenever the subset changes.
 *
 * If this fails: either use a name already in the subset, or regenerate the
 * font to include the new one and re-run the script.
 */

const ROOT = join(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');
const MANIFEST = join(SRC, 'content', 'icon-manifest.json');

function sourceFiles(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

/** Icon names as written in markup, and in `icon: 'name'` data fields. */
function referencedIconNames() {
  const names = new Map<string, string>();
  const inMarkup = /material-symbols-rounded[^>]*>\s*([a-z0-9_]+)\s*</gi;
  const inData = /\bicon:\s*'([a-z0-9_]+)'/g;

  for (const file of sourceFiles(SRC)) {
    const source = readFileSync(file, 'utf8');
    const relative = file.slice(ROOT.length + 1);
    if (source.includes('material-symbols-rounded')) {
      for (const m of source.matchAll(inMarkup)) names.set(m[1], relative);
    }
    for (const m of source.matchAll(inData)) names.set(m[1], relative);
  }
  return names;
}

test('every icon name the app renders exists in the subset font', () => {
  const shipped = new Set<string>(JSON.parse(readFileSync(MANIFEST, 'utf8')));
  assert.ok(
    shipped.size > 100,
    `icon-manifest.json has only ${shipped.size} entries — regenerate it with scripts/dump-icon-names.py`
  );

  const referenced = referencedIconNames();
  assert.ok(
    referenced.size > 100,
    `only ${referenced.size} icon names found in src/ — the scanner is broken, not the font`
  );

  const missing = [...referenced.entries()]
    .filter(([name]) => !shipped.has(name))
    .map(([name, file]) => `${name}  (${file})`)
    .sort();

  assert.deepEqual(
    missing,
    [],
    `Icon names absent from the subset font. These render as clipped raw text, ` +
      `not as icons:\n  ${missing.join('\n  ')}`
  );
});
