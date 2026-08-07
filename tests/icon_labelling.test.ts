// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Material Symbols renders its icons from **ligatures**: the element's text
 * content is the icon name, and the font substitutes a glyph for it. The glyph
 * is what a sighted user sees; the name is what everything else sees.
 *
 * So an unmarked icon span puts its codepoint name into the accessible name of
 * whatever contains it. `<button><span…>analytics</span>Analytics</button>`
 * announces as "analytics Analytics", and an icon beside a heading reads the
 * icon name first. 238 of the 270 spans in this app were unmarked.
 *
 * Every icon span must therefore carry `aria-hidden="true"` — or, where the
 * icon genuinely is the label, an explicit `aria-label` or `role`. Marking
 * them is only half the job: a control whose only content was the ligature
 * becomes nameless, which is worse and which the axe suites will catch. Both
 * `tests/e2e/accessibility.spec.ts` and `tests/e2e/admin-accessibility.spec.ts`
 * gate on `button-name`, so that half is covered there.
 */

const ROOT = join(import.meta.dirname, '..', 'src');

function sourceFiles(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      sourceFiles(path, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

// Span open tags carry inline style objects, so match lazily across newlines.
const SPAN = /<span\b((?:[^<>]|\{[^{}]*\})*?)>/gs;

test('every Material Symbols icon is hidden from assistive tech or named', () => {
  const offenders: string[] = [];

  for (const file of sourceFiles(ROOT)) {
    const source = readFileSync(file, 'utf8');
    if (!source.includes('material-symbols-rounded')) continue;

    for (const match of source.matchAll(SPAN)) {
      const attrs = match[1];
      if (!attrs.includes('material-symbols-rounded')) continue;
      if (/aria-hidden|aria-label|aria-labelledby|role=/.test(attrs)) continue;

      const line = source.slice(0, match.index).split('\n').length;
      offenders.push(`${file.replace(ROOT, 'src')}:${line}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Icon spans missing aria-hidden="true" (the ligature text leaks into the ` +
      `accessible name of whatever contains them):\n  ${offenders.join('\n  ')}`
  );
});
