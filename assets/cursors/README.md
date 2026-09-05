# Glove cursor sources

The glove hand cursors shipped as `assets/cursor_grab.cur` (open hand) and
`assets/cursor_grabbing.cur` (closed fist) are **unmodified copies** of the
cursor images distributed by the Chromium project:

- https://chromium.googlesource.com/chromium/src/+/main/ui/resources/cursors/hand_grab.cur
- https://chromium.googlesource.com/chromium/src/+/main/ui/resources/cursors/hand_grabbing.cur

They are 32x32, hotspot (13, 13), and licensed under the BSD 3-Clause
("New BSD") license held by The Chromium Authors; see `LICENSE` in this
directory. They are not covered by the repository's MIT code license; while
both are permissive and fully compatible, the copyright notice and license of
the cursor files must be retained in redistributions.

For reference, the MD5 digests of the shipped files (and of the upstream
copies at the URLs above):

| file | md5 |
| --- | --- |
| `assets/cursor_grab.cur` | `3F37213B8C0A7374308B2AE99D4EEFA2` |
| `assets/cursor_grabbing.cur` | `8605CF2C21985F59D2480DA72AEBE3AA` |

`runtime/tests/test_glove_cursor.py` verifies these digests so an accidental
modification or license change is caught by the test suite.
