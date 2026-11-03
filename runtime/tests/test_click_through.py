import unittest

from runtime.helper import WS_EX_LAYERED, WS_EX_TRANSPARENT, click_through_active, click_through_ex_style


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


if __name__ == "__main__":
    unittest.main()
