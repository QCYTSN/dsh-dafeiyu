import sys
import unittest

from runtime.helper import (
    WS_EX_LAYERED,
    WS_EX_TRANSPARENT,
    click_through_active,
    click_through_ex_style,
    paint_pet,
    window_ex_style_api,
)


class ClickThroughTests(unittest.TestCase):
    def test_holding_ctrl_makes_the_pet_reachable(self) -> None:
        self.assertTrue(click_through_active(True, False))
        self.assertFalse(click_through_active(True, True))
        self.assertFalse(click_through_active(False, False))
        self.assertFalse(click_through_active(False, True))

    def test_transparent_style_is_layered(self) -> None:
        style = click_through_ex_style(0x00000008, True)  # WS_EX_TOPMOST kept
        self.assertEqual(style & WS_EX_TRANSPARENT, WS_EX_TRANSPARENT)
        self.assertEqual(style & WS_EX_LAYERED, WS_EX_LAYERED)
        self.assertEqual(style & 0x00000008, 0x00000008)

    def test_clearing_keeps_other_bits(self) -> None:
        style = WS_EX_TRANSPARENT | WS_EX_LAYERED | 0x00000008
        self.assertEqual(click_through_ex_style(style, False), WS_EX_LAYERED | 0x00000008)

    @unittest.skipUnless(sys.platform == "win32", "Win32 only")
    def test_hwnd_is_declared_pointer_sized(self) -> None:
        import ctypes
        from ctypes import wintypes

        get_style, set_style = window_ex_style_api()
        self.assertEqual(ctypes.sizeof(wintypes.HWND), ctypes.sizeof(ctypes.c_void_p))
        self.assertIs(get_style.argtypes[0], wintypes.HWND)
        self.assertIs(set_style.argtypes[0], wintypes.HWND)
        self.assertIs(get_style.restype, ctypes.c_long)
        self.assertIs(set_style.argtypes[2], ctypes.c_long)


class CrossfadeOpacityTests(unittest.TestCase):
    def rendered_alpha(self, fade_alpha: float, opacity: float) -> int:
        try:
            from PySide6.QtCore import QSize, Qt
            from PySide6.QtGui import QColor, QImage, QPainter, QPixmap
            from PySide6.QtWidgets import QApplication
        except ImportError:
            self.skipTest("Qt not installed")
        if QApplication.instance() is None:
            # Only one QApplication per process: the Qt integration tests create their own.
            app = QApplication([])
            self.addCleanup(lambda: (app.shutdown(), None)[1])
        old, new = QPixmap(8, 8), QPixmap(8, 8)
        old.fill(QColor(255, 0, 0))
        new.fill(QColor(0, 0, 255))
        image = QImage(8, 8, QImage.Format.Format_ARGB32_Premultiplied)
        image.fill(Qt.GlobalColor.transparent)
        painter = QPainter(image)
        paint_pet(painter, new, old, fade_alpha, opacity, 0, 0, 1.0, QSize(8, 8), 1.0)
        painter.end()
        return image.pixelColor(4, 4).alpha()

    def test_opacity_is_constant_during_a_crossfade(self) -> None:
        settled = self.rendered_alpha(1.0, 0.6)
        for fade_alpha in (0.1, 0.5, 0.9):
            self.assertAlmostEqual(self.rendered_alpha(fade_alpha, 0.6), settled, delta=2)

    def test_full_opacity_stays_solid_during_a_crossfade(self) -> None:
        self.assertEqual(self.rendered_alpha(0.5, 1.0), 255)


if __name__ == "__main__":
    unittest.main()
