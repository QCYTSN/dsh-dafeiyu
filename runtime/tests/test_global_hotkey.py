"""Unit tests for the mouse-passthrough hotkey binding.

The parser is the only part of the passthrough feature that can be exercised
without a desktop session, and it is also the part that decides whether the
pet can be recovered after it stops accepting clicks. A spec that parses to
something the user did not ask for is worse than one that is rejected, so the
rejection cases are tested as carefully as the accepted ones.
"""

from __future__ import annotations

import unittest

from runtime.global_hotkey import (
    DEFAULT_HOTKEY,
    MOD_ALT,
    MOD_CONTROL,
    MOD_SHIFT,
    MOD_WIN,
    describe_hotkey,
    parse_hotkey,
    virtual_key,
)


class ParseHotkeyTests(unittest.TestCase):
    def test_default_binding_is_usable(self) -> None:
        self.assertIsNotNone(parse_hotkey(DEFAULT_HOTKEY))

    def test_parses_modifiers_and_letter(self) -> None:
        self.assertEqual(parse_hotkey("Ctrl+Alt+F"), (MOD_CONTROL | MOD_ALT, ord("F")))

    def test_is_case_insensitive(self) -> None:
        self.assertEqual(parse_hotkey("ctrl+alt+f"), parse_hotkey("CTRL+ALT+F"))

    def test_tolerates_spaces_around_tokens(self) -> None:
        self.assertEqual(parse_hotkey(" Ctrl + Alt + F "), (MOD_CONTROL | MOD_ALT, ord("F")))

    def test_accepts_every_modifier(self) -> None:
        self.assertEqual(
            parse_hotkey("Ctrl+Alt+Shift+Win+F"),
            (MOD_CONTROL | MOD_ALT | MOD_SHIFT | MOD_WIN, ord("F")),
        )

    def test_accepts_function_keys(self) -> None:
        self.assertEqual(parse_hotkey("Ctrl+F1"), (MOD_CONTROL, 0x70))
        self.assertEqual(parse_hotkey("Ctrl+F24"), (MOD_CONTROL, 0x87))

    def test_accepts_digits_and_named_keys(self) -> None:
        self.assertEqual(parse_hotkey("Alt+1"), (MOD_ALT, ord("1")))
        self.assertEqual(parse_hotkey("Alt+Space"), (MOD_ALT, 0x20))

    def test_rejects_binding_without_modifier(self) -> None:
        # A bare key would be swallowed system-wide.
        self.assertIsNone(parse_hotkey("F"))
        self.assertIsNone(parse_hotkey("F5"))

    def test_rejects_binding_without_key(self) -> None:
        self.assertIsNone(parse_hotkey("Ctrl+Alt"))
        self.assertIsNone(parse_hotkey("Ctrl"))

    def test_rejects_unknown_tokens(self) -> None:
        self.assertIsNone(parse_hotkey("Ctrl+Foo"))
        self.assertIsNone(parse_hotkey("Ctrl+Alt+F25"))
        self.assertIsNone(parse_hotkey("Hyper+F"))

    def test_rejects_two_non_modifier_keys(self) -> None:
        self.assertIsNone(parse_hotkey("Ctrl+A+B"))

    def test_rejects_empty_and_dangling_plus(self) -> None:
        for spec in ("", "   ", "+", "Ctrl++F", "Ctrl+Alt+"):
            with self.subTest(spec=spec):
                self.assertIsNone(parse_hotkey(spec))

    def test_rejects_non_strings(self) -> None:
        for spec in (None, 5, [], {}, True):
            with self.subTest(spec=spec):
                self.assertIsNone(parse_hotkey(spec))


class DescribeHotkeyTests(unittest.TestCase):
    def test_normalises_spelling_and_order(self) -> None:
        self.assertEqual(describe_hotkey("alt+ctrl+f"), "Ctrl+Alt+F")
        self.assertEqual(describe_hotkey("shift+ctrl+f5"), "Ctrl+Shift+F5")

    def test_renders_letters_digits_and_function_keys(self) -> None:
        self.assertEqual(describe_hotkey("Ctrl+q"), "Ctrl+Q")
        self.assertEqual(describe_hotkey("Alt+9"), "Alt+9")
        self.assertEqual(describe_hotkey("Ctrl+F12"), "Ctrl+F12")

    def test_renders_named_keys(self) -> None:
        self.assertEqual(describe_hotkey("Ctrl+Space"), "Ctrl+Space")
        self.assertEqual(describe_hotkey("Ctrl+Left"), "Ctrl+Left")

    def test_unusable_spec_renders_empty(self) -> None:
        # Callers show the hint only when it is non-empty, so an unusable
        # binding must not leak a half-parsed key name into the UI.
        self.assertEqual(describe_hotkey("Ctrl+Foo"), "")
        self.assertEqual(describe_hotkey("F"), "")


class VirtualKeyTests(unittest.TestCase):
    def test_letters_are_uppercased(self) -> None:
        self.assertEqual(virtual_key("a"), ord("A"))
        self.assertEqual(virtual_key("Z"), ord("Z"))

    def test_unknown_name(self) -> None:
        self.assertIsNone(virtual_key("nope"))


if __name__ == "__main__":
    unittest.main()
