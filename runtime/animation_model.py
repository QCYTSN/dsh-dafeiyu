"""Pure animation state model for the BigFish native helper.

The model intentionally has no Qt dependency. It keeps durable DSH state
separate from temporary visual overlays so a click, idle micro-animation, or
success pulse always returns to the newest Agent state.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


STATES = {"IDLE", "THINKING", "WORKING", "WAITING", "SUCCESS", "ERROR", "DISCONNECTED"}
DRAG_CLIPS = {"dragging", "dragging_release"}
INTERACTION_CLIPS = {"head_pat", "poke", "tail"}


def crossfade_duration(previous_clip: str, current_clip: str) -> float | None:
    """Fade clip changes only; never blend successive 24 fps video frames."""
    if previous_clip == current_clip or previous_clip in DRAG_CLIPS or current_clip in DRAG_CLIPS:
        return None
    return 0.10


@dataclass(frozen=True)
class Clip:
    name: str
    frames: tuple[str, ...]
    frame_ms: int
    loop: bool


class AnimationModel:
    def __init__(self, manifest: dict[str, Any]) -> None:
        self.clips = {
            name: Clip(
                name=name,
                frames=tuple(value["frames"]),
                frame_ms=int(value["frameMs"]),
                loop=bool(value["loop"]),
            )
            for name, value in manifest["clips"].items()
        }
        self.state_map = dict(manifest["stateMap"])
        self.working_activity_map = dict(manifest.get("workingActivityMap", {}))
        self.idle_micro_clips = tuple(manifest.get("idleMicroClips", ()))
        self.idle_micro_intervals_ms = manifest.get("idleMicroIntervalsMs", {
            "quiet": (45000, 90000), "normal": (25000, 45000), "lively": (12000, 22000),
        })
        self.interaction_cooldown_ms = int(manifest.get("interactionCooldownMs", 1200))
        self.last_interaction_ms: int | None = None
        self.last_idle_micro: str | None = None
        self.base_state = "IDLE"
        self.base_activity: str | None = None
        self.base_clip_name = self.state_map["IDLE"]
        self.overlay_clip_name: str | None = None
        self.pulse_state: str | None = None
        self.pulse_deadline_ms: int | None = None
        self.pulse_clip_name: str | None = None
        self.active_clip_name = self.base_clip_name
        self.frame_index = 0
        self.frame_elapsed_ms = 0

    @property
    def active_clip(self) -> Clip:
        return self.clips[self.active_clip_name]

    @property
    def frame(self) -> str:
        return self.active_clip.frames[self.frame_index]

    @property
    def overlay_remaining_ms(self) -> int:
        if self.overlay_clip_name is None or self.active_clip.loop:
            return 0
        return (len(self.active_clip.frames) - self.frame_index) * self.active_clip.frame_ms - self.frame_elapsed_ms

    def idle_micro_interval(self, activity_level: str) -> tuple[int, int]:
        lower, upper = self.idle_micro_intervals_ms.get(activity_level, self.idle_micro_intervals_ms["normal"])
        return int(lower), int(upper)

    def apply_state(self, state: str, activity: str | None = None) -> None:
        if state not in STATES:
            return
        self.base_state = state
        self.base_activity = activity
        self.base_clip_name = self._clip_for(state, activity)
        # Repeated idle snapshots must not cancel a completion reaction.
        if state != "IDLE":
            self.pulse_state = None
            self.pulse_deadline_ms = None
            self.pulse_clip_name = None
            if self.overlay_clip_name not in DRAG_CLIPS:
                self.overlay_clip_name = None
        if self.overlay_clip_name is None:
            self._activate(self._underlay_clip_name())

    def apply_pulse(
        self,
        state: str,
        ttl_ms: int,
        now_ms: int,
        resume_state: str | None = None,
        resume_activity: str | None = None,
        *,
        complete_clip: bool = True,
    ) -> None:
        if state not in STATES or ttl_ms <= 0:
            return
        if resume_state in STATES:
            self.base_state = resume_state
            self.base_activity = resume_activity
            self.base_clip_name = self._clip_for(resume_state, resume_activity)
        previous_deadline = self.pulse_deadline_ms if self.pulse_state == state else None
        self.pulse_state = state
        self.pulse_clip_name = self._clip_for(state, None)
        clip = self.clips[self.pulse_clip_name]
        duration_ms = len(clip.frames) * clip.frame_ms if complete_clip else 0
        self.pulse_deadline_ms = max(now_ms + ttl_ms, previous_deadline or now_ms + duration_ms)
        if self.overlay_clip_name not in DRAG_CLIPS:
            self.overlay_clip_name = None
        if self.overlay_clip_name is None:
            self._activate(self.pulse_clip_name)

    def play_overlay(self, clip_name: str) -> bool:
        if clip_name not in self.clips:
            return False
        self.overlay_clip_name = clip_name
        self._activate(clip_name)
        return True

    def clear_overlay(self) -> None:
        self.overlay_clip_name = None
        self._activate(self._underlay_clip_name())

    def play_interaction(self, clip_name: str, now_ms: int) -> bool:
        if clip_name not in INTERACTION_CLIPS or self.pulse_state is not None:
            return False
        if self.overlay_clip_name in INTERACTION_CLIPS | DRAG_CLIPS:
            return False
        if self.last_interaction_ms is not None and now_ms - self.last_interaction_ms < self.interaction_cooldown_ms:
            return False
        if not self.play_overlay(clip_name):
            return False
        self.last_interaction_ms = now_ms
        return True

    def play_idle_micro(self, index: int = 0) -> bool:
        if self.base_state != "IDLE" or self.overlay_clip_name is not None or self.pulse_state is not None:
            return False
        if not self.idle_micro_clips:
            return False
        clip_name = self.idle_micro_clips[index % len(self.idle_micro_clips)]
        if len(self.idle_micro_clips) > 1 and clip_name == self.last_idle_micro:
            clip_name = self.idle_micro_clips[(index + 1) % len(self.idle_micro_clips)]
        self.last_idle_micro = clip_name
        return self.play_overlay(clip_name)

    def advance(self, elapsed_ms: int, now_ms: int) -> None:
        if elapsed_ms < 0:
            return
        if self.pulse_deadline_ms is not None and now_ms >= self.pulse_deadline_ms:
            self.pulse_state = None
            self.pulse_deadline_ms = None
            self.pulse_clip_name = None
            if self.overlay_clip_name is None:
                self._activate(self.base_clip_name)
                elapsed_ms = 0

        clip = self.active_clip
        if not clip.frames:
            return
        steps, self.frame_elapsed_ms = divmod(self.frame_elapsed_ms + elapsed_ms, clip.frame_ms)
        next_frame = self.frame_index + steps
        if next_frame < len(clip.frames):
            self.frame_index = next_frame
        elif clip.loop:
            self.frame_index = next_frame % len(clip.frames)
        elif self.overlay_clip_name is not None:
            self.overlay_clip_name = None
            self._activate(self._underlay_clip_name())
        else:
            self.frame_index = len(clip.frames) - 1
            self.frame_elapsed_ms = 0

    def _clip_for(self, state: str, activity: str | None) -> str:
        if state == "WORKING" and activity in self.working_activity_map:
            return self.working_activity_map[activity]
        return self.state_map.get(state, self.state_map["IDLE"])

    def _underlay_clip_name(self) -> str:
        return self.pulse_clip_name or self.base_clip_name

    def _activate(self, clip_name: str) -> None:
        if self.active_clip_name == clip_name:
            return
        self.active_clip_name = clip_name
        self.frame_index = 0
        self.frame_elapsed_ms = 0
