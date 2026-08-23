import json
import unittest
from pathlib import Path

from runtime.animation_model import AnimationModel, crossfade_duration


ROOT = Path(__file__).resolve().parents[2]
MANIFEST = json.loads((ROOT / "assets" / "pet-manifest.json").read_text(encoding="utf-8"))


class AnimationModelTests(unittest.TestCase):
    def test_working_activity_selects_a_persistent_loop(self) -> None:
        model = AnimationModel(MANIFEST)
        model.apply_state("WORKING", "searching")
        self.assertEqual(model.active_clip_name, "working_search")
        for tick in range(12):
            model.advance(150, tick * 150)
        self.assertEqual(model.active_clip_name, "working_search")

    def test_interaction_returns_to_latest_agent_state(self) -> None:
        model = AnimationModel(MANIFEST)
        model.apply_state("THINKING")
        model.play_overlay("head_pat")
        model.apply_state("WAITING")
        for tick in range(8):
            model.advance(200, tick * 200)
        self.assertEqual(model.active_clip_name, "waiting")
        self.assertEqual(model.base_state, "WAITING")

    def test_pulse_expires_to_current_base_state(self) -> None:
        model = AnimationModel(MANIFEST)
        model.apply_state("WORKING", "editing")
        model.apply_pulse("SUCCESS", 1000, 100, "IDLE")
        self.assertEqual(model.active_clip_name, "success")
        model.advance(100, 1200)
        self.assertEqual(model.active_clip_name, "idle")

    def test_idle_micro_does_not_interrupt_agent_work(self) -> None:
        model = AnimationModel(MANIFEST)
        model.apply_state("THINKING")
        self.assertFalse(model.play_idle_micro())
        self.assertEqual(model.active_clip_name, "thinking")

    def test_drag_overlay_returns_to_latest_agent_state(self) -> None:
        model = AnimationModel(MANIFEST)
        model.apply_state("THINKING")
        self.assertTrue(model.play_overlay("dragging"))
        model.apply_state("WAITING")
        model.clear_overlay()
        self.assertEqual(model.active_clip_name, "waiting")
        self.assertEqual(model.base_state, "WAITING")

    def test_drag_transitions_never_crossfade(self) -> None:
        self.assertIsNone(crossfade_duration("idle", "dragging"))
        self.assertIsNone(crossfade_duration("dragging", "thinking"))
        self.assertIsNone(crossfade_duration("blink", "idle"))
        for stage in ("dragging_release", "dragging_dizzy", "dragging_protest"):
            self.assertIsNone(crossfade_duration("idle", stage), stage)
            self.assertIsNone(crossfade_duration(stage, "idle"), stage)
        self.assertEqual(crossfade_duration("thinking", "working"), 0.10)
        self.assertEqual(crossfade_duration("working_search", "working_search"), 0.045)

    def test_drag_stage_clips_are_single_frame_and_registered(self) -> None:
        stages = {
            "dragging_release": False,
            "dragging_dizzy": True,
            "dragging_protest": False,
        }
        model = AnimationModel(MANIFEST)
        for name, loop in stages.items():
            clip = MANIFEST["clips"][name]
            self.assertEqual(len(clip["frames"]), 1, name)
            self.assertIs(clip["loop"], loop, name)
            self.assertTrue(model.play_overlay(name), name)

    def test_single_frame_drag_stage_survives_advance_until_cleared(self) -> None:
        model = AnimationModel(MANIFEST)
        model.apply_state("IDLE")
        model.play_overlay("dragging_dizzy")
        for tick in range(10):
            model.advance(260, tick * 260)
        self.assertEqual(model.active_clip_name, "dragging_dizzy")
        model.clear_overlay()
        self.assertEqual(model.active_clip_name, "idle")


if __name__ == "__main__":
    unittest.main()
