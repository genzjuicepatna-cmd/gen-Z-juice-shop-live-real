// @ts-nocheck
/**
 * HTML builders for the Juice Pop primitives.
 *
 * Most admin views (POS, Kitchen, Express, Inventory, …) render by assembling
 * `innerHTML` strings rather than JSX, so they cannot import a React component
 * library. Without shared builders every view re-inlines the same class lists
 * and drifts from the design system one copy-paste at a time.
 *
 * These are deliberately thin: they emit the classes defined in
 * components-v2.css and nothing else. No state, no event wiring — the calling
 * view keeps owning both.
 *
 * Every caller-supplied string is escaped. Pass user or database content as
 * `label`/`text`; only pass trusted markup through the explicitly named `html`
 * options.
 */

import { escapeHtml } from './helpers';

/** Join class names, dropping falsy entries. */
export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

/** Serialize an attribute map, escaping values. Keys must be static. */
function attrs(map = {}) {
  return Object.entries(map)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([key, value]) => (value === true ? key : `${key}="${escapeHtml(value)}"`))
    .join(' ');
}

/** Material Symbols ligature. Icon names are static identifiers, never data. */
export function icon(name, { className = '', ariaHidden = true } = {}) {
  return `<span class="${cx('material-symbols-rounded', className)}"${
    ariaHidden ? ' aria-hidden="true"' : ''
  }>${escapeHtml(name)}</span>`;
}

/**
 * Button.
 *
 * @param {string} label      visible text (escaped)
 * @param {object} options
 *   variant  'primary' | 'berry' | 'secondary' | 'danger' | 'ghost'
 *   size     'sm' | 'lg'
 *   iconName leading Material Symbols ligature
 *   block    full width
 *   type     defaults to 'button' so a button inside a form never submits by
 *            accident — the single most common bug in the existing views
 */
export function btn(label, options = {}) {
  const {
    variant = 'primary',
    size,
    iconName,
    block = false,
    type = 'button',
    className = '',
    ...rest
  } = options;

  const classes = cx(
    'btn',
    variant && `btn-${variant}`,
    size && `btn-${size}`,
    block && 'btn-block',
    className
  );

  return `<button type="${escapeHtml(type)}" class="${classes}" ${attrs(rest)}>${
    iconName ? icon(iconName) : ''
  }${escapeHtml(label)}</button>`;
}

/** Icon-only button. `ariaLabel` is required — an unlabelled control fails axe. */
export function iconBtn(iconName, ariaLabel, options = {}) {
  const { className = '', type = 'button', ...rest } = options;
  return `<button type="${escapeHtml(type)}" class="${cx('btn-icon', className)}" aria-label="${escapeHtml(
    ariaLabel
  )}" ${attrs(rest)}>${icon(iconName)}</button>`;
}

/** Quiet metadata pill. */
export function badge(label, variant = 'primary', options = {}) {
  const { className = '', ...rest } = options;
  return `<span class="${cx('badge', variant && `badge-${variant}`, className)}" ${attrs(
    rest
  )}>${escapeHtml(label)}</span>`;
}

/** Loud rotated sticker — NEW, BESTSELLER, 0 SUGAR, streak counts. */
export function sticker(label, options = {}) {
  const { variant, flip = false, className = '', ...rest } = options;
  return `<span class="${cx(
    'sticker',
    variant && `sticker-${variant}`,
    flip && 'sticker-flip',
    className
  )}" ${attrs(rest)}>${escapeHtml(label)}</span>`;
}

/** Filter / category chip. */
export function chip(label, options = {}) {
  const { active = false, iconName, className = '', type = 'button', ...rest } = options;
  return `<button type="${escapeHtml(type)}" class="${cx('chip', active && 'is-active', className)}" ${
    active ? 'aria-pressed="true"' : 'aria-pressed="false"'
  } ${attrs(rest)}>${iconName ? icon(iconName) : ''}${escapeHtml(label)}</button>`;
}

/**
 * Segmented control.
 *
 * @param {Array<{value: string, label: string}>} items
 * @param {string} activeValue
 */
export function segmented(items, activeValue, options = {}) {
  const { ariaLabel = '', className = '', name = '' } = options;
  const buttons = items
    .map((item) => {
      const isActive = item.value === activeValue;
      return `<button type="button" role="tab" aria-selected="${isActive}" data-value="${escapeHtml(
        item.value
      )}"${name ? ` data-name="${escapeHtml(name)}"` : ''}>${escapeHtml(item.label)}</button>`;
    })
    .join('');

  return `<div class="${cx('segmented', className)}" role="tablist"${
    ariaLabel ? ` aria-label="${escapeHtml(ariaLabel)}"` : ''
  }>${buttons}</div>`;
}

/**
 * Progress meter.
 *
 * Emits the ARIA progressbar semantics alongside the visual fill — a bare
 * styled div communicates nothing to a screen reader.
 */
export function meter(value, max = 100, options = {}) {
  const { label = '', large = false, className = '' } = options;
  const safeMax = Number(max) > 0 ? Number(max) : 100;
  const clamped = Math.max(0, Math.min(Number(value) || 0, safeMax));
  const percent = (clamped / safeMax) * 100;

  return `<div class="${cx('meter', large && 'meter-lg', className)}" role="progressbar" aria-valuenow="${clamped}" aria-valuemin="0" aria-valuemax="${safeMax}"${
    label ? ` aria-label="${escapeHtml(label)}"` : ''
  }><div class="meter-fill" style="width:${percent.toFixed(2)}%"></div></div>`;
}

/** Loading placeholder. Width/height are caller-controlled inline styles. */
export function skeleton({ width = '100%', height = '16px', radius, className = '' } = {}) {
  const style = [
    `width:${escapeHtml(width)}`,
    `height:${escapeHtml(height)}`,
    radius ? `border-radius:${escapeHtml(radius)}` : '',
  ]
    .filter(Boolean)
    .join(';');
  return `<div class="${cx('skeleton', className)}" style="${style}" aria-hidden="true"></div>`;
}

/**
 * Surface / card wrapper.
 *
 * `contentHtml` is inserted verbatim — it is markup the caller has already
 * built, so it is the caller's job to have escaped the data inside it.
 */
export function surface(contentHtml, options = {}) {
  const { raised = false, pressable = false, className = '', tag = 'div', ...rest } = options;
  const classes = cx(raised ? 'surface-raised' : 'surface', pressable && 'pressable', className);
  return `<${tag} class="${classes}" ${attrs(rest)}>${contentHtml}</${tag}>`;
}

/** Horizontal snap rail. `itemsHtml` is pre-built markup. */
export function rail(itemsHtml, options = {}) {
  const { className = '', ariaLabel = '' } = options;
  return `<div class="${cx('rail', className)}"${
    ariaLabel ? ` role="group" aria-label="${escapeHtml(ariaLabel)}"` : ''
  }>${itemsHtml}</div>`;
}

/** Empty state with an icon, a message, and an optional action. */
export function emptyState(message, options = {}) {
  const { iconName = 'inbox', actionHtml = '', className = '' } = options;
  return `<div class="${cx('empty-state', className)}">${icon(iconName)}<p>${escapeHtml(
    message
  )}</p>${actionHtml}</div>`;
}

/** Tabular figure wrapper so totals stop reflowing as digits change. */
export function numeric(value, options = {}) {
  const { className = '' } = options;
  return `<span class="${cx('numeric', className)}">${escapeHtml(value)}</span>`;
}
