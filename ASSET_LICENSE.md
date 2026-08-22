# Visual asset notice

The source code in this repository is MIT-licensed. The bundled BigFish visual
character assets under `assets/pet/` are **not covered by the MIT code license**.

These 238px runtime PNG frames were copied from the formal runtime output of
`QCYTSN/ds-local-pet` at local release `v0.2.0`. They are derived from a mixture
of fan-made DeepSeek-related character views and AI-assisted animation sheets.
Image processing, resizing, or repackaging does not change rights in the
underlying artwork. No additional license or warranty is granted for these
visual files.

The plugin does not include source references, paid pose references, candidate
sheets, or original working material. Only the explicitly allowlisted runtime
frames required by the DSH companion are bundled.

The notification sounds under `assets/sounds/` are original procedural audio
generated for this repository by `scripts/generate_notification_sounds.py`.
They contain no third-party recordings and are covered by the repository's MIT
license.

The glove status cursors `assets/cursor_grab.cur` and `assets/cursor_grabbing.cur`
(32x32 Windows cursors used for the hover/press cursor feedback) are derived
works from the Windows 98 style cursor sources in
[phillbush/retrosmart-xcursor](https://github.com/phillbush/retrosmart-xcursor),
which is GPL-3.0 licensed. They are **not covered by the MIT code license**.

The corresponding source is bundled with the plugin in `assets/cursors/`: the
modified XPM sources (`openhand.32.xpm`, `closedhand.32.xpm` with the shipped
palette baked in), the conversion script (`xpm2cur.py`), a note on what was
modified and how to rebuild (`README.md`), and the upstream GPL-3.0 text
(`GPL-3.0.txt`). `xpm2cur.py` reproduces the shipped .cur files byte-for-byte
(covered by the tests).

This is an unofficial fan-made project and is not affiliated with or endorsed
by DeepSeek. Names, marks, and character-related rights belong to their
respective owners.

Source provenance and the fuller notice are documented in:

- https://github.com/QCYTSN/ds-local-pet/blob/main/ASSET_LICENSE.md
- https://github.com/1190fasheqi/dafeiyu-pet
