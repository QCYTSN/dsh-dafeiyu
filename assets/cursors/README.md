# Glove cursor sources

The glove hand cursors shipped as `assets/cursor_grab.cur` (open hand) and
`assets/cursor_grabbing.cur` (closed fist) are derived from the Windows 98
style cursor sources in [phillbush/retrosmart-xcursor](https://github.com/phillbush/retrosmart-xcursor):

- `openhand.32.xpm` / `closedhand.32.xpm` — modified sources (see below)
- `xpm2cur.py` — conversion script used to produce the `.cur` files
- `GPL-3.0.txt` — license text of the upstream project

## Modifications

The upstream XPMs use placeholder colors (`coral` / `cyan`). In these modified
sources the final palette used by the plugin is baked into the color table:

| key | color | role |
| --- | --- | --- |
| `.` | `#141414` | outline (near-black) |
| `+` | `#fcfcfa` | glove fill (white) |
| space | `None` | transparent |

The conversion script then packs the 32x32 pixel art as a Windows `.cur`:
32 bpp BGRA, straight alpha, classic AND mask (1 on transparent pixels, so
legacy renderers do not paint a black square behind the cursor), and the
hotspot carried by the shipped files (`x=1, y=32`) kept unchanged.

## Rebuild

From the repository root:

```bash
python assets/cursors/xpm2cur.py
```

This writes `assets/cursors/openhand.cur` and `assets/cursors/closedhand.cur`,
which are byte-identical to the shipped `assets/cursor_grab.cur` /
`assets/cursor_grabbing.cur` (verified by md5). Copy them over if a
regeneration is needed.

## License

Both cursor images are derived works of phillbush/retrosmart-xcursor and are
distributed under GPL-3.0 (see `GPL-3.0.txt`). They are not covered by the
repository's MIT code license.
