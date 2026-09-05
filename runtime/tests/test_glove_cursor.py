import hashlib
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from runtime.helper import (
    GloveCursorController,
    load_native_cursor,
    reset_native_cursor,
    set_native_cursor,
)

REPO_ROOT = Path(__file__).resolve().parents[2]


class GloveCursorControllerTests(unittest.TestCase):
    """Cursor state machine: hover / press / release / leave / WM_SETCURSOR."""

    OPEN = object()
    CLOSED = object()

    def make(self, open_h=OPEN, closed_h=CLOSED):
        return GloveCursorController(open_h, closed_h)

    def test_hover_shows_open_hand(self) -> None:
        self.assertIs(self.make().on_enter(), self.OPEN)

    def test_press_shows_closed_fist(self) -> None:
        controller = self.make()
        self.assertIs(controller.on_press(), self.CLOSED)
        self.assertTrue(controller.pressed)

    def test_release_inside_restores_open_hand(self) -> None:
        controller = self.make()
        controller.on_press()
        self.assertIs(controller.on_release(inside=True), self.OPEN)
        self.assertFalse(controller.pressed)

    def test_release_outside_requests_reset(self) -> None:
        controller = self.make()
        controller.on_press()
        self.assertIsNone(controller.on_release(inside=False))
        self.assertFalse(controller.pressed)

    def test_leave_clears_pressed_and_resets(self) -> None:
        controller = self.make()
        controller.on_press()
        self.assertIsNone(controller.on_leave())
        self.assertFalse(controller.pressed)

    def test_wm_setcursor_on_lbutton_down_is_closed(self) -> None:
        self.assertIs(self.make().on_wm_setcursor(0x0201), self.CLOSED)

    def test_wm_setcursor_on_move_is_open(self) -> None:
        self.assertIs(self.make().on_wm_setcursor(0x0200), self.OPEN)

    def test_wm_setcursor_while_pressed_is_closed(self) -> None:
        controller = self.make()
        controller.on_press()
        self.assertIs(controller.on_wm_setcursor(0x0200), self.CLOSED)

    def test_missing_assets_degrade_cleanly(self) -> None:
        controller = self.make(None, None)
        self.assertIsNone(controller.on_enter())
        self.assertIsNone(controller.on_press())
        self.assertIsNone(controller.on_release(inside=True))
        self.assertIsNone(controller.on_wm_setcursor(0x0201))
        controller.on_press()
        controller.on_leave()
        self.assertFalse(controller.pressed)


class NativeCursorFallbackTests(unittest.TestCase):
    """Loading failures and non-Windows platforms must degrade to default."""

    def test_load_returns_none_on_non_windows(self) -> None:
        with patch("runtime.helper.sys.platform", "linux"):
            self.assertIsNone(load_native_cursor(Path("cursor_grab.cur")))

    def test_load_returns_none_for_missing_file(self) -> None:
        missing = Path(tempfile.gettempdir()) / "dsh-dafeiyu-definitely-missing.cur"
        self.assertIsNone(load_native_cursor(missing))

    def test_set_and_reset_are_safe_without_windows(self) -> None:
        with patch("runtime.helper.sys.platform", "linux"):
            set_native_cursor(123)  # must not raise
            reset_native_cursor()  # must not raise


class CursorSourceTests(unittest.TestCase):
    """The shipped .cur files are unmodified upstream Chromium copies.

    Digests are pinned against the files published in Chromium's
    ui/resources/cursors (see assets/cursors/README.md). If an upstream file
    is ever swapped (different art or a different license), this test fails.
    """

    UPSTREAM_DIGESTS = {
        "cursor_grab.cur": "3f37213b8c0a7374308b2ae99d4eefa2",
        "cursor_grabbing.cur": "8605cf2c21985f59d2480da72aebe3aa",
    }

    def test_shipped_cursors_match_upstream_chromium(self) -> None:
        for name, expected in self.UPSTREAM_DIGESTS.items():
            digest = hashlib.md5((REPO_ROOT / "assets" / name).read_bytes()).hexdigest()
            self.assertEqual(digest, expected, f"{name} differs from the upstream Chromium cursor")

    def test_cursor_license_notice_is_bundled(self) -> None:
        cursors_dir = REPO_ROOT / "assets" / "cursors"
        for name in ("LICENSE", "README.md"):
            self.assertTrue((cursors_dir / name).is_file(), f"missing assets/cursors/{name}")
        license_text = (cursors_dir / "LICENSE").read_text(encoding="utf-8")
        self.assertIn("Redistribution and use in source and binary forms", license_text)


@unittest.skipUnless(sys.platform == "win32", "Windows-only native cursor tests")
class WindowsNativeCursorTests(unittest.TestCase):
    """Real Win32 calls: pointer-sized signatures and valid handles.

    ctypes defaults to C int return values for undeclared functions, which
    truncates 64-bit HCURSORs; these tests pin the explicit signatures and
    exercise the actual loading path.
    """

    def test_cursor_api_uses_pointer_sized_signatures(self) -> None:
        import ctypes
        from ctypes import wintypes

        from runtime.helper import _cursor_api

        load_from_file, set_cursor, load_cursor = _cursor_api()
        # wintypes.HANDLE is c_void_p = pointer-sized; no truncation to C int.
        self.assertEqual(ctypes.sizeof(wintypes.HANDLE), ctypes.sizeof(ctypes.c_void_p))
        self.assertIs(load_from_file.restype, wintypes.HANDLE)
        self.assertIs(set_cursor.restype, wintypes.HANDLE)
        self.assertIs(load_cursor.restype, wintypes.HANDLE)
        self.assertEqual(list(load_from_file.argtypes), [wintypes.LPCWSTR])
        self.assertEqual(list(set_cursor.argtypes), [wintypes.HANDLE])
        self.assertEqual(list(load_cursor.argtypes), [wintypes.HANDLE, wintypes.LPCWSTR])

    def test_bundled_cursor_loads_to_valid_handle(self) -> None:
        from runtime.helper import load_native_cursor

        handle = load_native_cursor(REPO_ROOT / "assets" / "cursor_grab.cur")
        self.assertTrue(handle, "bundled cursor_grab.cur must load to a valid handle")

    def test_set_and_reset_with_real_handles(self) -> None:
        from runtime.helper import load_native_cursor, reset_native_cursor, set_native_cursor

        handle = load_native_cursor(REPO_ROOT / "assets" / "cursor_grab.cur")
        self.assertTrue(handle)
        set_native_cursor(handle)  # must not raise or truncate
        reset_native_cursor()


if __name__ == "__main__":
    unittest.main()
