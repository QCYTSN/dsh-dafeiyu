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
    """The generator script must reproduce the shipped .cur files byte-for-byte."""

    def test_generator_reproduces_shipped_cursors(self) -> None:
        generator = REPO_ROOT / "scripts" / "generate_glove_cursors.py"
        self.assertTrue(generator.is_file(), "missing scripts/generate_glove_cursors.py")
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run(
                [sys.executable, str(generator), directory],
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            for name in ("cursor_grab.cur", "cursor_grabbing.cur"):
                gen_md5 = hashlib.md5((Path(directory) / name).read_bytes()).hexdigest()
                ship_md5 = hashlib.md5((REPO_ROOT / "assets" / name).read_bytes()).hexdigest()
                self.assertEqual(gen_md5, ship_md5, f"{name} is not reproducible from the generator")


if __name__ == "__main__":
    unittest.main()
