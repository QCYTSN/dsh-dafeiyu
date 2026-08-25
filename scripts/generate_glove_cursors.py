#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Original glove hand cursors for the companion window (MIT).

Draws two 32x32 Windows .cur files from scratch - original pixel art, no
third-party assets:

- assets/cursor_grab.cur     open hand: four spread fingers + spread thumb
- assets/cursor_grabbing.cur closed fist with knuckles

Both use the same style: white glove (#fcfcfa) with a near-black (#141414)
outline on a transparent background, 32 bpp BGRA, classic AND mask (1 on
transparent pixels) and hotspot (1, 32). Run:

    python scripts/generate_glove_cursors.py [out_dir]

The script is the source of these assets: the art is original and covered by
the repository's MIT license (see ASSET_LICENSE.md). Re-running it in any
output directory reproduces the shipped .cur files byte-for-byte, which
runtime/tests/test_glove_cursor.py verifies.
"""

import math
import struct
import sys
from pathlib import Path

SIZE = 32
OUTLINE = (20, 20, 20)  # #141414
FILL = (252, 252, 250)  # #fcfcfa
HOTSPOT = (1, 32)
SAMPLES = 5  # supersampling per axis; makes the edge pixels land on a clean grid

REPO_ROOT = Path(__file__).resolve().parents[1]
ASSETS = REPO_ROOT / "assets"


def _inside_rounded_rect(px, py, x, y, w, h, r):
    dx = max(x + r - px, px - (x + w - r), 0.0)
    dy = max(y + r - py, py - (y + h - r), 0.0)
    if dx == 0.0 and dy == 0.0:
        return True
    return dx * dx + dy * dy <= r * r


def _inside_capsule(px, py, ax, ay, bx, by, radius):
    vx, vy = bx - ax, by - ay
    length_sq = vx * vx + vy * vy
    if length_sq == 0.0:
        return (px - ax) ** 2 + (py - ay) ** 2 <= radius * radius
    t = max(0.0, min(1.0, ((px - ax) * vx + (py - ay) * vy) / length_sq))
    cx, cy = ax + t * vx, ay + t * vy
    return (px - cx) ** 2 + (py - cy) ** 2 <= radius * radius


def _open_hand_shape(px, py):
    """Open hand: palm + four fanned fingers + thumb pointing up-left."""
    if _inside_rounded_rect(px, py, 4.5, 9.0, 22.0, 13.0, 5.0):
        return True
    for ax, ay, bx, by, radius in (
        (8.2, 10.0, 7.2, 2.6, 2.0),   # index
        (13.2, 10.5, 13.4, 1.3, 2.1),  # middle (longest)
        (18.2, 10.5, 19.3, 2.4, 2.1),  # ring
        (23.2, 10.5, 24.5, 4.8, 1.9),  # pinky
        (7.2, 13.2, 1.6, 5.6, 2.6),   # thumb
    ):
        if _inside_capsule(px, py, ax, ay, bx, by, radius):
            return True
    return False


def _closed_hand_shape(px, py):
    """Closed fist: rounded body + four knuckle bumps + thumb along the side."""
    if _inside_rounded_rect(px, py, 6.0, 7.0, 20.0, 13.0, 5.0):
        return True
    for ax, ay, bx, by, radius in (
        (8.6, 8.2, 8.6, 3.2, 1.9),
        (13.2, 8.4, 13.3, 2.7, 1.9),
        (17.8, 8.4, 18.1, 3.4, 1.9),
        (22.4, 8.4, 23.0, 4.6, 1.8),
        (7.0, 15.4, 3.0, 9.2, 2.5),  # thumb
    ):
        if _inside_capsule(px, py, ax, ay, bx, by, radius):
            return True
    return False


def _render(shape_fn):
    """Supersample the shape and classify pixels: FILL / OUTLINE / transparent."""
    grid = []
    step = 1.0 / SAMPLES
    for y in range(SIZE):
        row = []
        for x in range(SIZE):
            inside = 0
            for sy in range(SAMPLES):
                for sx in range(SAMPLES):
                    if shape_fn(x + (sx + 0.5) * step, y + (sy + 0.5) * step):
                        inside += 1
            row.append(inside / (SAMPLES * SAMPLES))
        grid.append(row)
    pixels = {}
    for y in range(SIZE):
        for x in range(SIZE):
            coverage = grid[y][x]
            if coverage >= 0.62:
                pixels[(x, y)] = FILL
            elif coverage >= 0.04:
                pixels[(x, y)] = OUTLINE
    return pixels


def _pack_cur(pixels, out_path):
    xor = [[(0, 0, 0, 0)] * SIZE for _ in range(SIZE)]
    mask = [[1] * SIZE for _ in range(SIZE)]
    for (x, y), color in pixels.items():
        xor[y][x] = (color[2], color[1], color[0], 255)  # BGRA, straight alpha
        mask[y][x] = 0
    stride = (SIZE + 7) // 8
    xor_size = SIZE * SIZE * 4
    img_size = 40 + xor_size + stride * SIZE
    data = bytearray()
    data += struct.pack("<HHH", 0, 2, 1)  # ICONDIR
    data += struct.pack("<BBBBHHII", SIZE, SIZE, 0, 0, HOTSPOT[0], HOTSPOT[1], img_size, 22)
    data += struct.pack("<IiiHHIIiiII", 40, SIZE, SIZE * 2, 1, 32, 0, xor_size, 0, 0, 0, 0)
    for y in range(SIZE - 1, -1, -1):
        for x in range(SIZE):
            data += bytes(xor[y][x])
    for y in range(SIZE - 1, -1, -1):
        row = bytearray(stride)
        for x in range(SIZE):
            if mask[y][x]:
                row[x // 8] |= 1 << (7 - (x % 8))
        data += bytes(row)
    out_path.write_bytes(bytes(data))
    return len(data)


def _save_preview(pixels, out_path):
    """8x nearest-neighbor preview on a checkerboard, for eyeballing the art."""
    import zlib  # minimal PNG writer, no Pillow dependency

    rows = []
    scale = 8
    for y in range(SIZE * scale):
        row = bytearray([0])
        for x in range(SIZE * scale):
            px = pixels.get((x // scale, y // scale))
            if px is None:
                c = (128, 128, 128) if (x // scale + y // scale) % 2 else (0, 0, 0)
            else:
                c = px
            row += bytes(c)
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag, payload):
        raw = tag + payload
        return struct.pack(">I", len(payload)) + raw + struct.pack(">I", zlib.crc32(raw) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE * scale, SIZE * scale, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    out_path.write_bytes(png)


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    out_dir = Path(args[0]).resolve() if args else ASSETS
    out_dir.mkdir(parents=True, exist_ok=True)
    import hashlib

    for name, shape_fn in (("cursor_grab", _open_hand_shape), ("cursor_grabbing", _closed_hand_shape)):
        pixels = _render(shape_fn)
        cur_path = out_dir / f"{name}.cur"
        size = _pack_cur(pixels, cur_path)
        digest = hashlib.md5(cur_path.read_bytes()).hexdigest()
        print(f"{name}.cur: {size} bytes, md5 {digest}")
        if out_dir != ASSETS:
            # Preview only when building into a scratch directory.
            _save_preview(pixels, out_dir / f"{name}.preview.png")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
