#!/usr/bin/env python3
"""
Write the list of icon names present in the subset icon font.

`public/assets/material-symbols-rounded.woff2` is a subset — 1.72 MB of TTF cut
down to about 18 KB by keeping only the icons this app uses. Icons are
ligatures, so a name that is not in the subset produces no substitution and the
raw name renders instead. Because `.material-symbols-rounded` is
`width: 1em; overflow: hidden`, the user sees one or two clipped letters, which
reads as a rendering glitch rather than a missing icon. Five names were in that
state before anyone noticed.

`tests/icon_font_coverage.test.ts` compares the names referenced in src/ against
the manifest this writes, so the failure surfaces at `npm test` instead of on a
counter tablet. Node cannot read a WOFF2 without a dependency, hence Python and
fontTools — the same tool used to build the subset in the first place.

Run this whenever the font is regenerated:

    python3 scripts/dump-icon-names.py

Requires fontTools:  pip install fonttools brotli
"""

import json
import pathlib
import sys

try:
    from fontTools.ttLib import TTFont
except ImportError:
    sys.exit("fontTools is required: pip install fonttools brotli")

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONT = ROOT / "public" / "assets" / "material-symbols-rounded.woff2"
OUT = ROOT / "src" / "content" / "icon-manifest.json"


def ligature_names(font):
    """Every ligature in the font, decoded back to its icon name."""
    cmap = font.getBestCmap()
    glyph_to_char = {}
    for codepoint, glyph in cmap.items():
        glyph_to_char.setdefault(glyph, chr(codepoint))

    names = set()
    for lookup in font["GSUB"].table.LookupList.Lookup:
        for subtable in lookup.SubTable:
            # Lookup type 7 wraps the real subtable one level down.
            subtable = getattr(subtable, "ExtSubTable", subtable)
            ligatures = getattr(subtable, "ligatures", None)
            if not ligatures:
                continue
            for first, entries in ligatures.items():
                for entry in entries:
                    sequence = [first] + list(entry.Component)
                    try:
                        names.add("".join(glyph_to_char[g] for g in sequence).lower())
                    except KeyError:
                        # A component with no cmap entry cannot be typed, so it
                        # is not a name the app could ever reference.
                        continue
    return names


def main():
    if not FONT.exists():
        sys.exit(f"Font not found: {FONT}")

    names = sorted(ligature_names(TTFont(FONT)))
    if len(names) < 50:
        sys.exit(
            f"Only {len(names)} ligatures found in {FONT.name}. That is almost "
            "certainly a parsing failure rather than a genuinely tiny subset — "
            "refusing to write a manifest that would make the test pass wrongly."
        )

    OUT.write_text(json.dumps(names, indent=2) + "\n", encoding="utf-8")
    print(f"[icon-manifest] {len(names)} icon names -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
