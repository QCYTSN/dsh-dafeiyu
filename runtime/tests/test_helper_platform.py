import os
import unittest
from unittest.mock import patch

from runtime.helper import configure_qt_platform


class QtPlatformTests(unittest.TestCase):
    def test_linux_with_x11_selects_xcb(self) -> None:
        with patch("runtime.helper.sys.platform", "linux"), patch.dict(os.environ, {"DISPLAY": ":0"}, clear=True):
            configure_qt_platform()
            self.assertEqual(os.environ["QT_QPA_PLATFORM"], "xcb")

    def test_linux_wayland_session_can_fall_back_from_xcb(self) -> None:
        environment = {"DISPLAY": ":0", "WAYLAND_DISPLAY": "wayland-0"}
        with patch("runtime.helper.sys.platform", "linux"), patch.dict(os.environ, environment, clear=True):
            configure_qt_platform()
            self.assertEqual(os.environ["QT_QPA_PLATFORM"], "xcb;wayland")

    def test_explicit_platform_is_preserved(self) -> None:
        environment = {"DISPLAY": ":0", "QT_QPA_PLATFORM": "wayland"}
        with patch("runtime.helper.sys.platform", "linux"), patch.dict(os.environ, environment, clear=True):
            configure_qt_platform()
            self.assertEqual(os.environ["QT_QPA_PLATFORM"], "wayland")

    def test_non_linux_does_not_set_platform(self) -> None:
        with patch("runtime.helper.sys.platform", "win32"), patch.dict(os.environ, {"DISPLAY": ":0"}, clear=True):
            configure_qt_platform()
            self.assertNotIn("QT_QPA_PLATFORM", os.environ)


if __name__ == "__main__":
    unittest.main()
