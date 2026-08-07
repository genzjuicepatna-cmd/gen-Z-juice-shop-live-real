#!/usr/bin/env node
/**
 * Record which drinks have real artwork.
 *
 * The 33 product illustrations in public/assets/art are hand-drawn SVG
 * stand-ins; real renders replace them one at a time. Without this the app
 * would need a hand-maintained list of which slugs had been upgraded, and that
 * list would be wrong within a week.
 *
 * Instead the directory is the source of truth: this scans it and writes the
 * winning file per slug, preferring the smaller modern format. Drop a file in,
 * rebuild, and it is live.
 *
 *   node scripts/build-art-manifest.js
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const artDir = path.join(root, 'public', 'assets', 'art');
const outPath = path.join(root, 'src', 'content', 'art-manifest.json');

/** Best first: a real render beats the SVG stand-in of the same name. */
const PREFERENCE = ['.webp', '.png', '.jpg', '.jpeg', '.svg'];

function main() {
  if (!fs.existsSync(artDir)) {
    fs.writeFileSync(outPath, '{}\n');
    console.log('[art-manifest] no art directory; wrote an empty manifest.');
    return;
  }

  const bySlug = new Map();
  for (const file of fs.readdirSync(artDir)) {
    const ext = path.extname(file).toLowerCase();
    const rank = PREFERENCE.indexOf(ext);
    if (rank === -1) continue;

    const slug = path.basename(file, ext);
    const current = bySlug.get(slug);
    if (!current || rank < current.rank) bySlug.set(slug, { file, rank });
  }

  const manifest = {};
  for (const slug of [...bySlug.keys()].sort()) {
    manifest[slug] = `/assets/art/${bySlug.get(slug).file}`;
  }

  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');

  const real = Object.values(manifest).filter((p) => !p.endsWith('.svg')).length;
  console.log(
    `[art-manifest] ${Object.keys(manifest).length} slugs, ${real} with real artwork.`
  );
}

main();
