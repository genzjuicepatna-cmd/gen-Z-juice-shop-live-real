// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { badge, btn, chip, cx, iconBtn, meter, numeric, segmented, sticker } from '../src/utils/ui';

/* These builders emit raw HTML strings that views drop into innerHTML, so
   every caller-supplied value has to come back escaped. */

test('btn escapes label content', () => {
  const html = btn('<img src=x onerror=alert(1)>');
  assert.ok(!html.includes('<img'), 'raw markup must not survive');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
});

test('btn escapes attribute values', () => {
  const html = btn('Pay', { id: 'a" onmouseover="alert(1)' });
  assert.ok(!html.includes('onmouseover="alert(1)"'), 'attribute must not break out');
  assert.ok(html.includes('&quot;'));
});

test('btn defaults to type=button so it cannot submit a form by accident', () => {
  assert.ok(btn('Save').startsWith('<button type="button"'));
  assert.ok(btn('Save', { type: 'submit' }).includes('type="submit"'));
});

test('btn composes variant, size and block classes', () => {
  const html = btn('Add', { variant: 'berry', size: 'lg', block: true });
  assert.ok(html.includes('btn btn-berry btn-lg btn-block'));
});

test('iconBtn always carries an accessible name', () => {
  const html = iconBtn('close', 'Close cart');
  assert.ok(html.includes('aria-label="Close cart"'));
  assert.ok(html.includes('btn-icon'));
});

test('badge and sticker escape their labels', () => {
  assert.ok(badge('<b>x</b>').includes('&lt;b&gt;'));
  assert.ok(sticker('<b>x</b>').includes('&lt;b&gt;'));
});

test('sticker applies variant and flip modifiers', () => {
  const html = sticker('New', { variant: 'berry', flip: true });
  assert.ok(html.includes('sticker sticker-berry sticker-flip'));
});

test('chip reports pressed state to assistive tech', () => {
  assert.ok(chip('Smoothies', { active: true }).includes('aria-pressed="true"'));
  assert.ok(chip('Smoothies').includes('aria-pressed="false"'));
});

test('segmented marks exactly one selected tab', () => {
  const html = segmented(
    [
      { value: 'pickup', label: 'Pickup' },
      { value: 'delivery', label: 'Delivery' },
    ],
    'delivery'
  );
  assert.equal((html.match(/aria-selected="true"/g) || []).length, 1);
  assert.ok(html.includes('data-value="delivery"'));
});

test('meter emits progressbar semantics, not just a styled div', () => {
  const html = meter(30, 60, { label: 'Loyalty progress' });
  assert.ok(html.includes('role="progressbar"'));
  assert.ok(html.includes('aria-valuenow="30"'));
  assert.ok(html.includes('aria-valuemax="60"'));
  assert.ok(html.includes('width:50.00%'));
});

test('meter clamps out-of-range and invalid values', () => {
  assert.ok(meter(999, 100).includes('width:100.00%'));
  assert.ok(meter(-5, 100).includes('width:0.00%'));
  // A zero or negative max would divide by zero; it falls back to 100.
  assert.ok(meter(50, 0).includes('aria-valuemax="100"'));
  assert.ok(meter('abc', 100).includes('width:0.00%'));
});

test('numeric wraps values in the tabular-figures class', () => {
  assert.equal(numeric('₹240'), '<span class="numeric">₹240</span>');
});

test('cx drops falsy class names', () => {
  assert.equal(cx('a', false, null, undefined, '', 'b'), 'a b');
});
