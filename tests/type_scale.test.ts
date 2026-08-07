// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The type scale bottoms out at `--text-xs`, 12px. Anything smaller in an
 * operator view was authored ad hoc, and there were 53 of them — form labels,
 * stat captions and status badges at 8px to 11px on screens staff read across
 * a counter all day.
 *
 * Two places are deliberately below the scale, because in both the small size
 * *is* the thing being shown rather than text meant to be read:
 *
 *   - Branding's storefront simulator, a third-scale mock of the customer
 *     phone view. It is `aria-hidden` with a described alternative.
 *   - Settings' thermal receipt preview, which simulates 58mm paper.
 *
 * Both are listed below by file so adding a third is a deliberate act.
 */

const ROOT = join(import.meta.dirname, '..', 'src', 'views');
const MIN_PX = 12;

const ALLOWED = new Map<string, string>([
  ['admin/BrandingView.tsx', 'storefront simulator, a third-scale mock'],
  ['admin/Settings.tsx', 'thermal receipt preview, simulates 58mm paper'],
]);

function sourceFiles(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

const INLINE_PX = /fontSize: '(\d+)px'/g;

test('operator views do not set type below the 12px scale floor', () => {
  const offenders: string[] = [];

  for (const file of sourceFiles(ROOT)) {
    const relative = file.slice(ROOT.length + 1).split('\\').join('/');
    if (ALLOWED.has(relative)) continue;

    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(INLINE_PX)) {
      if (Number(match[1]) >= MIN_PX) continue;
      const line = source.slice(0, match.index).split('\n').length;
      offenders.push(`views/${relative}:${line} — ${match[1]}px`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Inline font sizes below the ${MIN_PX}px scale floor. Use var(--text-xs) ` +
      `or var(--text-sm):\n  ${offenders.join('\n  ')}`
  );
});
