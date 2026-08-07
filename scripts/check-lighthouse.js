/**
 * Turn one or more Lighthouse reports into a pass or a fail.
 *
 * The CI step that produced these used to run `npx vite preview` — vite is not
 * a dependency of this Next.js project, so no server ever started — and then
 * uploaded whatever it got as an artifact without asserting anything. The
 * result was a green build and a score nobody had ever read. When Lighthouse
 * was finally run by hand, performance was 54.
 *
 * Usage:
 *   node scripts/check-lighthouse.js report-1.json report-2.json report-3.json
 *
 * Pass several reports and the **median** of each category is what gets
 * checked. That is not belt-and-braces: on a loaded runner this exact build
 * scored 94, 55, 90 and 64 on four consecutive runs of identical code. A gate
 * reading a single run would fail about a third of the time, and a gate that
 * fails randomly is removed within a week — at which point it is worth nothing
 * again, which is how the original step ended up asserting nothing at all.
 *
 * Performance is a timing measurement and moves with whatever else the machine
 * is doing. The other three are rule checks — deterministic — so they are held
 * at 100 and one bad run there is a real regression, not weather.
 */

import fs from 'node:fs';

const MINIMUMS = {
  performance: 70,
  accessibility: 100,
  'best-practices': 100,
  seo: 100
};

/**
 * 70, not the ~92 this scores on a quiet machine.
 *
 * This gate exists to catch the catastrophic case — the 54 that shipped
 * unnoticed because the Supabase SDK sat in the critical path — not to police
 * single-point movements. Tightening it without also pinning the runner just
 * buys flakiness. The real number is tracked in docs/UI_CONTRACTS.md §4a.
 */
const paths = process.argv.slice(2);
if (!paths.length) {
  console.error('[lighthouse] Usage: node scripts/check-lighthouse.js <report.json> [more.json ...]');
  process.exit(2);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

const reports = [];
for (const path of paths) {
  let report;
  try {
    report = JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(`[lighthouse] Could not read ${path}: ${error.message}`);
    process.exit(2);
  }
  if (!report.categories) {
    console.error(`[lighthouse] ${path} has no categories — Lighthouse did not complete.`);
    process.exit(2);
  }
  reports.push(report);
}

console.log(`[lighthouse] ${reports[0].finalDisplayedUrl || paths[0]}  (${reports.length} run${reports.length > 1 ? 's' : ''})`);

const failures = [];
for (const [key, minimum] of Object.entries(MINIMUMS)) {
  const scores = reports.map((r) => (r.categories[key] ? Math.round(r.categories[key].score * 100) : null));
  if (scores.some((s) => s === null)) {
    failures.push(`${key}: missing from at least one report`);
    continue;
  }
  const value = median(scores);
  const ok = value >= minimum;
  const spread = reports.length > 1 ? `  runs: ${scores.join(', ')}` : '';
  const title = reports[0].categories[key].title;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${title.padEnd(16)} ${String(value).padStart(3)}  (min ${minimum})${spread}`);
  if (!ok) failures.push(`${title} median ${value} < ${minimum}`);
}

const metrics = ['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift'];
const detail = metrics
  .map((id) => reports[0].audits?.[id])
  .filter(Boolean)
  .map((audit) => `${audit.title}: ${audit.displayValue}`)
  .join('  |  ');
if (detail) console.log(`  first run — ${detail}`);

if (failures.length) {
  console.error(`\n[lighthouse] Below threshold:\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
console.log('[lighthouse] All categories meet their minimum.');
