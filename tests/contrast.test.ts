// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { INK, PAPER, contrastRatio, readableInk, relativeLuminance } from '../src/utils/contrast';

/* Branding lets the shop owner type any hex for the storefront accent, so the
   build-time token gate cannot cover it. readableInk is what keeps text on
   those fills legible, which makes it worth pinning down. */

test('relative luminance matches the WCAG reference points', () => {
  assert.equal(relativeLuminance('#000000'), 0);
  assert.equal(relativeLuminance('#FFFFFF'), 1);
});

test('shorthand hex expands', () => {
  assert.equal(relativeLuminance('#fff'), relativeLuminance('#FFFFFF'));
  assert.equal(relativeLuminance('0f0'), relativeLuminance('#00FF00'));
});

test('unparseable input is reported rather than guessed at', () => {
  for (const bad of ['', '#12', 'rgb(0,0,0)', 'tomato', null, undefined, '#GGGGGG']) {
    assert.equal(relativeLuminance(bad), null, `${bad} should not parse`);
  }
});

test('black on white is the maximum ratio', () => {
  assert.equal(contrastRatio('#000000', '#FFFFFF'), 21);
});

test('contrast ratio is symmetric', () => {
  assert.equal(contrastRatio('#FF9E1B', '#1B1023'), contrastRatio('#1B1023', '#FF9E1B'));
});

test('light fills take dark ink and dark fills take light ink', () => {
  // The brand accents. Mango in particular was the one rendering white at
  // 2:1 in the branding preview.
  assert.equal(readableInk('#FF9E1B'), INK, 'mango');
  assert.equal(readableInk('#FFFFFF'), INK, 'white');
  assert.equal(readableInk('#7CE04F'), INK, 'lime');
  assert.equal(readableInk('#1B1023'), PAPER, 'ink');
  assert.equal(readableInk('#000000'), PAPER, 'black');
  assert.equal(readableInk('#5B34C7'), PAPER, 'grape');
});

test('it picks whichever of the two reads better', () => {
  const fills = [
    '#FF9E1B', '#FF4D8D', '#7CE04F', '#8B5CF6', '#1B1023',
    '#FFFFFF', '#000000', '#808080', '#7A7A7A', '#D6165A',
  ];
  for (const fill of fills) {
    const chosen = contrastRatio(readableInk(fill), fill);
    const other = contrastRatio(readableInk(fill) === INK ? PAPER : INK, fill);
    assert.ok(chosen >= other, `${fill} picked the worse of the two`);
  }
});

/* The accents that actually appear as a fill behind text. --nextgenos-purple
   (#8B5CF6) is deliberately absent: it comes out at 4.33:1 against either ink,
   which is why the system only ever uses it as text on a surface, through
   --nextgenos-purple-on-surface. */
test('the brand fills clear AA with the ink it picks', () => {
  for (const fill of ['#FF9E1B', '#FF4D8D', '#7CE04F', '#1B1023', '#FFFFFF', '#D6165A']) {
    const ratio = contrastRatio(readableInk(fill), fill);
    assert.ok(ratio >= 4.5, `${fill} came out at ${ratio.toFixed(2)}:1`);
  }
});

/* Two inks cannot cover every fill. Contrast against ink rises with the fill's
   luminance while contrast against white falls, and the curves cross around
   luminance 0.195 — a mid grey — where the better of the two is still only
   ~4.3:1. Nothing readableInk can do fixes that; it needs a third ink or a
   different fill. Pinned here so the limit is a known quantity rather than a
   surprise, and so the Branding warning stays justified. */
test('mid-tone fills are a known gap, not a silent pass', () => {
  const worst = contrastRatio(readableInk('#7A7A7A'), '#7A7A7A');
  assert.ok(worst < 4.5, `expected the trough to fall short of AA, got ${worst.toFixed(2)}:1`);
  assert.ok(worst > 4.0, `trough moved unexpectedly: ${worst.toFixed(2)}:1`);
});

test('a half-typed hex falls back to ink rather than flashing white on white', () => {
  assert.equal(readableInk('#FF9'), INK, 'valid shorthand for a pale yellow');
  assert.equal(readableInk('#'), INK);
  assert.equal(readableInk('#FF9E'), INK, 'mid-edit, not yet a colour');
  assert.equal(readableInk(''), INK);
  assert.equal(readableInk(undefined), INK);
});
