#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Convert the glove XPM sources in this directory into Windows .cur files.

Usage (from the repository root):

    python assets/cursors/xpm2cur.py

The palette is read straight from each XPM ("None" = transparent, "#rrggbb" =
opaque, alpha always 255). Hotspots are (1, 32) - the values carried by the
shipped assets/cursor_grab.cur / cursor_grabbing.cur files, reproduced
byte-for-byte so the runtime behavior is unchanged. Output is written next to
the script as openhand.cur / closedhand.cur; copy them to assets/cursor_grab.cur
and assets/cursor_grabbing.cur (those two are the files the helper ships).

Format notes (must match on rebuild or the .cur bytes change):

- ICONDIR (reserved=0, type=2, count=1), ICONDIRENTRY, BITMAPINFOHEADER with
  biHeight = height * 2 (XOR bits + AND mask in a single bottom-up image).
- 32 bpp BGRA, straight alpha (alpha=255 for visible pixels, 0 elsewhere).
- AND mask: 1 on transparent pixels, 0 on visible pixels (classic "reverse"
  mask; needed so legacy renderers do not paint a black square behind the
  cursor). Rows are padded to 32-bit boundaries.
"""

import re
import struct
import sys
from pathlib import Path

SIZE = 32
HOTSPOTS = {"openhand.32.xpm": (1, 32), "closedhand.32.xpm": (1, 32)}
HERE = Path(__file__).resolve().parent


def parse_xpm(path: Path) -> tuple[int, int, dict[str, tuple[int, int, int, int]], list[str]]:
    lines = [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    header = next(i for i, line in enumerate(lines) if re.match(r'"\d+\s+\d+\s+\d+\s+\d+"', line))
    w, h, ncols, _ = (int(x) for x in re.match(r'"(\d+)\s+(\d+)\s+(\d+)\s+(\d+)"', lines[header]).groups())
    colors: dict[str, tuple[int, int, int, int]] = {}
    for i in range(ncols):
        match = re.match(r'"(.+?)\s+c\s+(\S+)"', lines[header + 1 + i])
        if not match:
            continue
        key, value = match.group(1), match.group(2)
        if value == "None":
            colors[key] = (0, 0, 0, 0)
        elif value.startswith("#") and len(value) == 7:
            rgb = tuple(int(value[j : j + 2], 16) for j in (1, 3, 5))
            colors[key] = (rgb[0], rgb[1], rgb[2], 255)
    rows = [lines[header + 1 + ncols + y].strip('"').replace('\\"', '"') for y in range(h)]
    return w, h, colors, rows


def xpm_to_cur(path: Path, out: Path, hotspot: tuple[int, int]) -> int:
    w, h, colors, rows = parse_xpm(path)
    xor = [[(0, 0, 0, 0)] * w for _ in range(h)]
    mask = [[1] * w for _ in range(h)]
    for y in range(h):
        for x, ch in enumerate(rows[y]):
            color = colors.get(ch)
            if color and color[3] > 0:
                xor[y][x] = (color[2], color[1], color[0], 255)  # BGRA
                mask[y][x] = 0
    stride = (w + 7) // 8
    xor_size = w * h * 4
    img_size = 40 + xor_size + stride * h
    data = bytearray()
    data += struct.pack("<HHH", 0, 2, 1)  # ICONDIR
    # ICONDIRENTRY: in .cur files the "planes"/"bitcount" slots carry X/Y hotspot.
    data += struct.pack("<BBBBHHII", w, h, 0, 0, hotspot[0], hotspot[1], img_size, 22)
    data += struct.pack("<IiiHHIIiiII", 40, w, h * 2, 1, 32, 0, xor_size, 0, 0, 0, 0)
    for y in range(h - 1, -1, -1):
        for x in range(w):
            data += bytes(xor[y][x])
    for y in range(h - 1, -1, -1):
        row = bytearray(stride)
        for x in range(w):
            if mask[y][x]:
                row[x // 8] |= 1 << (7 - (x % 8))
        data += bytes(row)
    out.write_bytes(bytes(data))
    return len(data)


def main(argv: list[str] | None = None) -> None:
    args = argv if argv is not None else sys.argv[1:]
    out_dir = Path(args[0]).resolve() if args else HERE
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, hotspot in HOTSPOTS.items():
        src = HERE / name
        out_name = "openhand.cur" if name.startswith("openhand") else "closedhand.cur"
        size = xpm_to_cur(src, out_dir / out_name, hotspot)
        print(f"{out_name}: {size} bytes ({src.name}, hotspot={hotspot})")


if __name__ == "__main__":
    main()
