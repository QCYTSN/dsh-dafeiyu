import json
import unittest
from pathlib import Path

from runtime.animation_model import AnimationModel, crossfade_duration


ROOT = Path(__file__).resolve().parents[2]
MANIFEST = json.loads((ROOT / "assets/pet-manifest.json").read_text(encoding="utf-8"))


class AnimationModelTests(unittest.TestCase):
    def setUp(self) -> None:
        self.model = AnimationModel(MANIFEST)

    def test_working_activity_keeps_advancing_on_repeated_events(self) -> None:
        self.model.apply_state("WORKING", "searching")
        self.model.advance(2100, 2100)
        frame = self.model.frame_index
        self.model.apply_state("WORKING", "searching")
        self.assertEqual(self.model.frame_index, frame)
        self.model.advance(42, 2142)
        self.assertEqual(self.model.frame_index, frame + 1)

    def test_incoming_work_interrupts_idle_micro_and_clicks(self) -> None:
        for clip in [*MANIFEST["idleMicroClips"], "head_pat", "poke", "tail"]:
            with self.subTest(clip=clip):
                self.model.play_overlay(clip)
                self.model.apply_state("WAITING")
                self.assertEqual(self.model.active_clip_name, "waiting")
                self.assertIsNone(self.model.overlay_clip_name)

    def test_interaction_finishes_before_returning_to_idle(self) -> None:
        self.assertTrue(self.model.play_interaction("head_pat", 0))
        duration = self.model.overlay_remaining_ms
        self.model.advance(duration - 42, duration - 42)
        self.assertEqual(self.model.active_clip_name, "head_pat")
        self.assertEqual(self.model.frame_index, len(self.model.active_clip.frames) - 1)
        self.model.advance(42, duration)
        self.assertEqual(self.model.active_clip_name, "idle")

    def test_click_spam_does_not_cut_or_restart_a_gesture(self) -> None:
        self.assertTrue(self.model.play_interaction("poke", 0))
        self.model.advance(420, 420)
        frame = self.model.frame_index
        self.assertFalse(self.model.play_interaction("tail", 500))
        self.assertFalse(self.model.play_interaction("poke", 1500))
        self.assertEqual(self.model.frame_index, frame)
        self.model.advance(self.model.overlay_remaining_ms, 11000)
        self.assertTrue(self.model.play_interaction("tail", 11000))

    def test_click_cooldown_survives_a_state_interruption(self) -> None:
        self.model.play_interaction("poke", 100)
        self.model.apply_state("THINKING")
        self.assertFalse(self.model.play_interaction("tail", 500))
        self.assertTrue(self.model.play_interaction("tail", 1300))

    def test_pulse_plays_its_return_to_rest_before_expiring(self) -> None:
        self.model.apply_pulse("SUCCESS", 2200, 0, "IDLE")
        deadline = self.model.pulse_deadline_ms
        self.model.advance(2200, 2200)
        self.assertEqual(self.model.active_clip_name, "success")
        self.model.advance(deadline - 2200 - 42, deadline - 42)
        self.assertEqual(self.model.frame_index, len(self.model.active_clip.frames) - 1)
        self.model.advance(42, deadline)
        self.assertEqual(self.model.active_clip_name, "idle")
        self.assertEqual(self.model.frame_index, 0)

    def test_repeated_completion_does_not_restart_or_extend_the_whole_clip(self) -> None:
        self.model.apply_pulse("SUCCESS", 2200, 0, "IDLE")
        deadline = self.model.pulse_deadline_ms
        self.model.advance(2100, 2100)
        frame = self.model.frame_index
        self.model.apply_pulse("SUCCESS", 2200, 2100, "IDLE")
        self.assertEqual(self.model.frame_index, frame)
        self.assertEqual(self.model.pulse_deadline_ms, deadline)

    def test_idle_snapshot_preserves_pulse_but_new_work_interrupts(self) -> None:
        self.model.apply_pulse("SUCCESS", 2200, 0, "IDLE")
        self.model.apply_state("IDLE")
        self.assertEqual(self.model.active_clip_name, "success")
        self.model.apply_state("WORKING", "commanding")
        self.assertEqual(self.model.active_clip_name, "working_command")
        self.assertIsNone(self.model.pulse_state)

    def test_pulse_takes_priority_over_decorative_actions(self) -> None:
        self.model.play_idle_micro()
        self.model.apply_pulse("ERROR", 1800, 0, "WORKING", "editing")
        self.assertEqual(self.model.active_clip_name, "error")
        self.assertFalse(self.model.play_interaction("poke", 1500))
        self.model.advance(0, self.model.pulse_deadline_ms)
        self.assertEqual(self.model.active_clip_name, "working")

    def test_reduced_motion_pulse_uses_requested_ttl(self) -> None:
        self.model.apply_pulse("SUCCESS", 2200, 0, "IDLE", complete_clip=False)
        self.assertEqual(self.model.pulse_deadline_ms, 2200)
        self.model.advance(0, 2200)
        self.assertEqual(self.model.active_clip_name, "idle")

    def test_error_does_not_jump_back_to_standing_on_a_loop(self) -> None:
        self.model.apply_state("ERROR")
        self.model.advance(20000, 20000)
        self.assertEqual(self.model.frame_index, len(self.model.active_clip.frames) - 1)
        last = self.model.frame
        self.model.advance(5000, 25000)
        self.assertEqual(self.model.frame, last)

    def test_drag_owns_animation_and_release_finishes_without_timer_stages(self) -> None:
        self.model.play_overlay("dragging")
        self.model.advance(20000, 20000)
        self.model.apply_state("WAITING")
        self.assertEqual(self.model.active_clip_name, "dragging")
        self.assertFalse(self.model.play_interaction("poke", 20001))
        self.model.play_overlay("dragging_release")
        duration = self.model.overlay_remaining_ms
        self.model.advance(duration - 42, 20000 + duration - 42)
        self.assertEqual(self.model.active_clip_name, "dragging_release")
        self.model.advance(42, 20000 + duration)
        self.assertEqual(self.model.active_clip_name, "waiting")

    def test_regrab_does_not_get_cleared_by_the_previous_landing(self) -> None:
        self.model.play_overlay("dragging_release")
        self.model.advance(500, 500)
        self.model.play_overlay("dragging")
        self.model.advance(5000, 5500)
        self.assertEqual(self.model.active_clip_name, "dragging")

    def test_idle_micro_requires_idle_and_avoids_immediate_repeats(self) -> None:
        self.assertTrue(self.model.play_idle_micro(0))
        first = self.model.active_clip_name
        self.model.advance(self.model.overlay_remaining_ms, 11000)
        self.assertTrue(self.model.play_idle_micro(0))
        self.assertNotEqual(self.model.active_clip_name, first)
        self.model.apply_state("THINKING")
        self.assertFalse(self.model.play_idle_micro())

    def test_video_frames_stay_crisp_and_drag_switches_atomically(self) -> None:
        self.assertIsNone(crossfade_duration("working_search", "working_search"))
        for name in ("dragging", "dragging_release"):
            self.assertIsNone(crossfade_duration("idle", name))
            self.assertIsNone(crossfade_duration(name, "idle"))
        self.assertEqual(crossfade_duration("thinking", "working"), 0.10)

    def test_unknown_state_and_overlay_are_ignored(self) -> None:
        self.model.apply_state("BOGUS")
        self.assertFalse(self.model.play_overlay("BOGUS"))
        self.model.apply_pulse("SUCCESS", 0, 0)
        self.assertEqual(self.model.active_clip_name, "idle")

    def test_long_resume_skips_frames_without_replaying_the_backlog(self) -> None:
        self.model.apply_state("WORKING", "commanding")
        self.model.advance(86400000, 86400000)
        self.assertEqual(self.model.active_clip_name, "working_command")
        self.assertLess(self.model.frame_index, len(self.model.active_clip.frames))
        self.assertLess(self.model.frame_elapsed_ms, self.model.active_clip.frame_ms)


if __name__ == "__main__":
    unittest.main()
