import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from runtime.helper import BUBBLE_MODES as HELPER_BUBBLE_MODES
from runtime.layout_store import (
    BUBBLE_MODES,
    DEFAULT_LAYOUT,
    default_layout_path,
    load_layout,
    normalise_layout,
    save_layout,
)


class LayoutStoreTests(unittest.TestCase):
    def test_corrupt_layout_falls_back_safely(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "layout.json"
            path.write_text("not json", encoding="utf-8")
            self.assertEqual(load_layout(path), DEFAULT_LAYOUT)

    def test_layout_is_clamped_and_saved_atomically(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "nested" / "layout.json"
            save_layout(path, {"x": 120, "y": -20, "scale": 5, "reducedMotion": True})
            self.assertEqual(load_layout(path), {
                "version": 1,
                "x": 120,
                "y": -20,
                "petX": None,
                "petY": None,
                "scale": 1.4,
                "bubbleScale": 1.0,
                "reducedMotion": True,
                "bubbleMode": "hover",
                "bubbleStates": ["SUCCESS", "ERROR", "WAITING"],
            })
            self.assertEqual(json.loads(path.read_text(encoding="utf-8"))["scale"], 1.4)
            self.assertEqual(list(path.parent.glob("*.tmp")), [])

    def test_boolean_is_not_accepted_as_a_coordinate_or_scale(self) -> None:
        self.assertEqual(normalise_layout({"x": True, "petX": False, "scale": False, "bubbleScale": False}), DEFAULT_LAYOUT)

    def test_bubble_mode_and_states_are_normalised(self) -> None:
        self.assertEqual(normalise_layout({"bubbleMode": "hidden"})["bubbleMode"], "hidden")
        self.assertEqual(normalise_layout({"bubbleMode": "invalid"})["bubbleMode"], "hover")
        self.assertEqual(normalise_layout({"bubbleStates": ["SUCCESS", "ERROR"]})["bubbleStates"], ["SUCCESS", "ERROR"])
        self.assertEqual(normalise_layout({"bubbleStates": "bad"})["bubbleStates"], ["SUCCESS", "ERROR", "WAITING"])

    def test_bubble_scale_is_clamped(self) -> None:
        self.assertEqual(normalise_layout({"bubbleScale": 9})["bubbleScale"], 1.2)
        self.assertEqual(normalise_layout({"bubbleScale": 0.1})["bubbleScale"], 0.8)
        self.assertEqual(normalise_layout({})["bubbleScale"], 1.0)

    def test_xdg_config_home_is_used_on_linux(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {"XDG_CONFIG_HOME": directory}, clear=True):
                self.assertEqual(
                    default_layout_path(),
                    Path(directory) / "dsh" / "dsh-dafeiyu" / "layout.json",
                )

    def test_character_scale_supports_the_mini_range(self) -> None:
        self.assertEqual(normalise_layout({"scale": 0.1})["scale"], 0.55)
        self.assertEqual(normalise_layout({"scale": 0.6})["scale"], 0.6)


class BubbleModeTests(unittest.TestCase):
    """The hover-only card is the default, so it has to survive every entry point."""

    def test_status_card_starts_hidden_until_hovered(self) -> None:
        self.assertEqual(DEFAULT_LAYOUT["bubbleMode"], "hover")

    def test_the_two_mode_lists_agree(self) -> None:
        # The helper validates the environment value against its own list and the
        # store validates the file against this one; a mode accepted by only one of
        # them would silently snap back to this file's value.
        self.assertEqual(set(HELPER_BUBBLE_MODES), BUBBLE_MODES)
        self.assertIn(DEFAULT_LAYOUT["bubbleMode"], BUBBLE_MODES)

    def test_every_mode_survives_normalisation(self) -> None:
        for mode in sorted(BUBBLE_MODES):
            with self.subTest(mode=mode):
                self.assertEqual(normalise_layout({"bubbleMode": mode})["bubbleMode"], mode)

    def test_hover_survives_a_save_and_load_round_trip(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "layout.json"
            save_layout(path, {**DEFAULT_LAYOUT, "bubbleMode": "hover", "petX": 12, "petY": 34})
            self.assertEqual(json.loads(path.read_text(encoding="utf-8"))["bubbleMode"], "hover")
            reloaded = load_layout(path)
            self.assertEqual(reloaded["bubbleMode"], "hover")
            self.assertEqual((reloaded["petX"], reloaded["petY"]), (12, 34))

    def test_missing_file_uses_the_hover_default(self) -> None:
        self.assertEqual(load_layout(Path("/nonexistent/layout.json"))["bubbleMode"], "hover")


if __name__ == "__main__":
    unittest.main()
