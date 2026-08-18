"""Phase 0 native BigFish helper.

The DSH plugin owns this process and sends newline-delimited JSON over stdin.
Closing stdin is a lifecycle signal: the helper exits instead of becoming an
independent desktop application.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
import threading
import time
from pathlib import Path
from typing import Any, TextIO

try:
    from .animation_model import AnimationModel, crossfade_duration
    from .layout_store import default_layout_path, load_layout, save_layout
except ImportError:
    from animation_model import AnimationModel, crossfade_duration
    from layout_store import default_layout_path, load_layout, save_layout


PROTOCOL_VERSION = 1
STATES = {"IDLE", "THINKING", "WORKING", "WAITING", "SUCCESS", "ERROR", "DISCONNECTED"}
SEARCH_FRAME_MS = 800
SEARCH_MICRO_CLIPS = ("searching_sigh", "searching_throw", "searching_got_it")
SEARCH_DONE_PHASES = ("done_starry", "done_happy")
SEARCH_GRACE_MS = 1200
SEARCH_EXIT_MIN_MS = 2400
WORKING_MICRO_CLIPS = ("working_confused", "working_delight", "working_idea", "working_sigh", "working_tired")
# Avoid a hard computer/seat -> standing-thinking cut when DSH emits a
# thinking event immediately after a tool result.
WORKING_MIN_HOLD_MS = 2800
QUESTION_ANSWER_MS = 2400


def bundle_root() -> Path:
    """Locate packaged assets both from source and a PyInstaller one-file build."""
    frozen_root = getattr(sys, "_MEIPASS", None)
    if frozen_root is not None:
        return Path(frozen_root)
    return Path(__file__).resolve().parent.parent


def configure_stdio() -> None:
    """Make the JSONL pipe UTF-8 regardless of the Windows console code page."""
    for stream, errors in ((sys.stdin, "strict"), (sys.stdout, "backslashreplace"), (sys.stderr, "backslashreplace")):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(encoding="utf-8", errors=errors)


def parse_message(line: str) -> dict[str, Any]:
    message = json.loads(line)
    if not isinstance(message, dict):
        raise ValueError("message must be an object")
    if message.get("protocolVersion") != PROTOCOL_VERSION:
        raise ValueError("unsupported protocol version")
    kind = message.get("kind")
    if kind in {"state", "pulse"} and message.get("state") not in STATES:
        raise ValueError("unsupported companion state")
    return message


def emit_reply(kind: str, **payload: Any) -> None:
    print(
        json.dumps(
            {"protocolVersion": PROTOCOL_VERSION, "kind": kind, "timestamp": int(time.time() * 1000), **payload},
            ensure_ascii=False,
        ),
        flush=True,
    )


class EventRecorder:
    def __init__(self, path: Path | None) -> None:
        self.path = path
        self._stream: TextIO | None = None
        if path is not None:
            path.parent.mkdir(parents=True, exist_ok=True)
            self._stream = path.open("a", encoding="utf-8")

    def record(self, message: dict[str, Any]) -> None:
        if self._stream is None:
            return
        self._stream.write(json.dumps(message, ensure_ascii=False) + "\n")
        self._stream.flush()

    def close(self) -> None:
        if self._stream is not None:
            self._stream.close()


def run_headless(recorder: EventRecorder) -> int:
    try:
        emit_reply("ready")
        for line in sys.stdin:
            if not line.strip():
                continue
            try:
                message = parse_message(line)
            except (ValueError, json.JSONDecodeError) as error:
                print(json.dumps({"kind": "error", "message": str(error)}), flush=True)
                continue
            recorder.record(message)
            if message.get("kind") == "ping":
                emit_reply("pong")
                continue
            if message.get("kind") == "shutdown":
                break
    finally:
        recorder.close()
    return 0


def run_visual(recorder: EventRecorder, snapshot_path: Path | None = None) -> int:
    try:
        from PySide6.QtCore import QObject, QPoint, QRectF, Qt, QTimer, QUrl, Signal
        from PySide6.QtGui import QColor, QDesktopServices, QFont, QFontMetrics, QMouseEvent, QPainter, QPen, QPixmap
        from PySide6.QtWidgets import QApplication, QMenu, QWidget
    except ImportError:
        print(
            "PySide6 is required for visual mode. Run with --headless for protocol tests.",
            file=sys.stderr,
        )
        recorder.close()
        return 2

    class Inbox(QObject):
        message = Signal(dict)
        closed = Signal()

    manifest_path = bundle_root() / "assets" / "pet-manifest.json"
    asset_root = manifest_path.parent / "pet"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        print(f"Unable to load BigFish asset manifest: {error}", file=sys.stderr)
        recorder.close()
        return 2

    class CompanionWindow(QWidget):
        LABELS = {
            "IDLE": "休息中",
            "THINKING": "思考中",
            "WORKING": "干活中",
            "WAITING": "等你呢",
            "SUCCESS": "完成啦",
            "ERROR": "出问题了",
            "DISCONNECTED": "已断开",
        }

        def __init__(self) -> None:
            super().__init__()
            self.layout_path = default_layout_path()
            self.layout = load_layout(self.layout_path)
            configured_scale = os.environ.get("DSH_DAFEIYU_SCALE")
            try:
                self.scale = min(1.4, max(0.7, float(configured_scale))) if configured_scale else self.layout["scale"]
            except ValueError:
                self.scale = self.layout["scale"]
            configured_bubble_scale = os.environ.get("DSH_DAFEIYU_BUBBLE_SCALE")
            try:
                self.bubble_scale = (
                    min(1.2, max(0.8, float(configured_bubble_scale)))
                    if configured_bubble_scale
                    else self.layout["bubbleScale"]
                )
            except ValueError:
                self.bubble_scale = self.layout["bubbleScale"]
            configured_reduced_motion = os.environ.get("DSH_DAFEIYU_REDUCED_MOTION")
            self.reduced_motion = (
                configured_reduced_motion == "1"
                if configured_reduced_motion is not None
                else self.layout["reducedMotion"]
            )
            self.activity_level = os.environ.get("DSH_DAFEIYU_ACTIVITY_LEVEL", "normal")
            configured_bubble_mode = os.environ.get("DSH_DAFEIYU_BUBBLE_MODE")
            self.bubble_mode = (
                configured_bubble_mode
                if configured_bubble_mode in {"always", "hidden", "custom"}
                else self.layout.get("bubbleMode", "always")
            )
            configured_bubble_states = os.environ.get("DSH_DAFEIYU_BUBBLE_STATES")
            if configured_bubble_states is not None:
                self.bubble_states = [part.strip() for part in configured_bubble_states.split(",") if part.strip()]
            else:
                self.bubble_states = list(self.layout.get("bubbleStates", ["SUCCESS", "ERROR", "WAITING"]))
            self.model = AnimationModel(manifest)
            self.asset_scale = int(manifest.get("assetScale", 1))
            self.pixmaps: dict[str, QPixmap] = {}
            for clip in self.model.clips.values():
                for frame in clip.frames:
                    if frame in self.pixmaps:
                        continue
                    pixmap = QPixmap(str(asset_root / frame))
                    if pixmap.isNull():
                        raise RuntimeError(f"Unable to load BigFish frame: {frame}")
                    self.pixmaps[frame] = pixmap

            self.display_state = "IDLE"
            self.status_state = "IDLE"
            self.status_message = "我在这儿等新任务哦"
            self.status_detail = "DSH · 等待下一次任务"
            self.status_deadline_ms: int | None = self._now_ms() + 4200
            self.overlay_state: str | None = None
            self.overlay_message = ""
            self.overlay_detail = ""
            self.overlay_deadline_ms: int | None = None
            self.task = ""
            self.tasks: list[dict[str, Any]] = []
            self.drag_phase = "none"
            self.release_start_ms = 0
            self.landed_start_ms = 0
            self.cry_start_ms = 0
            self.leaving = False
            self.search_phase = "none"
            self.searching_active = False
            self.search_phase_ms = 0
            self.search_micro_next_ms = 0
            self.search_queued = False
            self.search_queued_ms = 0
            self.search_queued_book_base = ""
            self.search_started_ms = 0
            self.idle_micro_end_ms = None
            self.idle_micro_index = 0
            self.work_phase = "none"
            self.working_active = False
            self.work_phase_ms = 0
            self.work_started_ms = 0
            self.work_exit_queued = False
            self.work_micro_next_ms = 0
            self.question_phase = "none"
            self.question_phase_ms = 0
            self.debug_log_path = self._debug_log_path()
            self._last_animation_log = None
            self.webui_url = os.environ.get("DSH_DAFEIYU_WEBUI_URL", "http://127.0.0.1:3080/")
            self.shake_timer: QTimer | None = None
            self.shake_origin: QPoint | None = None
            self.shake_count = 0
            self.drag_origin: QPoint | None = None
            self.pet_origin: QPoint | None = None
            self.pet_x = 0
            self.pet_y = 0
            self.dragging = False
            self.last_tick_ms = self._now_ms()
            self.fade_from_pixmap: QPixmap | None = None
            self.fade_started = 0.0
            self.fade_duration = 0.15
            self.card_cache: QPixmap | None = None
            self.card_cache_key: tuple | None = None
            self.animation_timer = QTimer(self)
            # PreciseTimer avoids Windows timer coalescing (~15.6 ms system
            # tick), which made the nominal 50 FPS actually run at irregular
            # 15.6/31 ms intervals and stuttered multi-frame clips.
            self.animation_timer.setTimerType(Qt.TimerType.PreciseTimer)
            self.animation_timer.timeout.connect(self._tick)
            self.animation_timer.start(40 if self.reduced_motion else 20)
            self.micro_timer = QTimer(self)
            self.micro_timer.setSingleShot(True)
            self.micro_timer.timeout.connect(self._play_idle_micro)
            if not self.reduced_motion:
                self._schedule_micro()
            self.snapshot_saved = False
            self.setWindowTitle("DSH 大肥鱼")
            self.setWindowFlags(
                Qt.WindowType.FramelessWindowHint
                | Qt.WindowType.WindowStaysOnTopHint
                | Qt.WindowType.Tool
            )
            self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
            self._apply_window_size()
            QTimer.singleShot(0, self._restore_visible_position)
            if "enter" in self.model.clips:
                self.model.play_overlay("enter")

        def apply_message(self, message: dict[str, Any]) -> None:
            recorder.record(message)
            kind = message.get("kind")
            if kind == "question":
                self._apply_question(message)
                self.update()
                return
            if kind == "shutdown":
                if "leave" in self.model.clips and not self.leaving:
                    self.leaving = True
                    self.model.hold_overlay = True
                    self.model.play_overlay("leave")
                    clip = self.model.clips["leave"]
                    QTimer.singleShot(len(clip.frames) * clip.frame_ms + 200, QApplication.quit)
                else:
                    QApplication.quit()
                return
            previous_frame = self.model.frame
            previous_clip = self.model.active_clip_name
            if kind == "task":
                self.task = str(message.get("task", ""))
                self._show_status(str(message.get("message", self.task)), str(message.get("detail", "")), self.model.base_state, None if self.model.base_state in {"THINKING", "WORKING", "WAITING", "ERROR"} else 6000)
            elif kind == "tasks":
                raw_tasks = message.get("tasks")
                self.tasks = raw_tasks if isinstance(raw_tasks, list) else []
                self._sync_bubble_size()
            elif kind == "config":
                self._apply_config(message)
            elif kind in {"state", "pulse"}:
                state = str(message.get("state", "IDLE"))
                self.display_state = state
                if kind == "pulse":
                    ttl_ms = max(250, int(message.get("ttlMs", 1800)))
                    resume_state = str(message.get("resumeState", self.model.base_state))
                    searching_was_active = self.searching_active
                    working_was_active = self.working_active and self.work_phase != "seat_out"
                    if state == "SUCCESS" and (searching_was_active or self.search_phase in SEARCH_DONE_PHASES):
                        if searching_was_active: self._finish_searching()
                        ttl_ms += self._done_remaining_ms()
                    if state == "SUCCESS" and working_was_active:
                        self._finish_working()
                        ttl_ms += self._work_remaining_ms()
                    self.model.apply_pulse(state, ttl_ms, self._now_ms(), resume_state, message.get("resumeActivity"))
                    if searching_was_active and state != "SUCCESS":
                        self._cancel_searching(); self.model.clear_overlay()
                    if working_was_active and state != "SUCCESS":
                        self._cancel_working(); self.model.clear_overlay()
                    self._show_status(str(message.get("resumeMessage", self.LABELS.get(resume_state, resume_state))), str(message.get("resumeDetail", "")), resume_state, None if resume_state in {"THINKING", "WORKING", "WAITING", "ERROR"} else ttl_ms + 2200)
                    self._show_overlay(str(message.get("message", self.LABELS.get(state, state))), str(message.get("detail", "")), state, ttl_ms)
                    if state in {"SUCCESS", "ERROR"}: self._notify_alert(state)
                else:
                    activity = None if self.reduced_motion else message.get("activity")
                    is_searching = activity == "searching"
                    previous_base = self.model.base_clip_name
                    self.model.apply_state(state, activity)
                    if self.question_phase == "none":
                        if state == "WORKING":
                            if not self.working_active and self.work_phase != "seat_out": self._begin_working()
                            if is_searching:
                                if not self.searching_active and self.search_phase not in SEARCH_DONE_PHASES:
                                    if self.working_active and self.work_phase in {"stay", "micro"} and self.model.overlay_clip_name is None:
                                        self.search_queued = True; self.search_queued_ms = self._now_ms(); self.search_queued_book_base = previous_base; self.model.base_clip_name = previous_base; self.model._activate(previous_base)
                                    else: self._begin_searching()
                            elif self.searching_active:
                                self._finish_searching()
                            elif self.search_queued:
                                self.search_queued = False; self.search_queued_ms = 0
                        elif self.working_active:
                            # Do not stand up immediately after a tool result:
                            # hold the seated computer pose and let _tick start
                            # the reverse transition after the minimum dwell.
                            if state in {"THINKING", "IDLE", "DISCONNECTED"}:
                                self.work_exit_queued = True
                            else:
                                self._finish_working()
                    persistent = state in {"THINKING", "WORKING", "WAITING", "ERROR"}
                    self._show_status(str(message.get("message", self.LABELS.get(state, state))), str(message.get("detail", "")), state, None if persistent else 4200)
            self._sync_frame_transition(previous_frame, previous_clip)
            self._sync_bubble_size()
            self.update()
            if snapshot_path is not None and not self.snapshot_saved:
                QTimer.singleShot(180, self._save_snapshot)

        def _apply_config(self, message: dict[str, Any]) -> None:
            """Apply a live CONFIG message without restarting the window."""
            scale = message.get("scale")
            if isinstance(scale, (int, float)) and not isinstance(scale, bool):
                self.scale = min(1.4, max(0.7, float(scale)))
            bubble_scale = message.get("bubbleScale")
            if isinstance(bubble_scale, (int, float)) and not isinstance(bubble_scale, bool):
                self.bubble_scale = min(1.2, max(0.8, float(bubble_scale)))
            reduced_motion = message.get("reducedMotion")
            if isinstance(reduced_motion, bool) and reduced_motion != self.reduced_motion:
                self.reduced_motion = reduced_motion
                self.animation_timer.setInterval(40 if self.reduced_motion else 20)
                if self.reduced_motion:
                    self.micro_timer.stop()
                else:
                    self._schedule_micro()
            activity_level = message.get("activityLevel")
            if activity_level in {"quiet", "normal", "lively"}:
                self.activity_level = activity_level
                if not self.reduced_motion:
                    self._schedule_micro()
            bubble_mode = message.get("bubbleMode")
            if bubble_mode in {"always", "hidden", "custom"}:
                self.bubble_mode = bubble_mode
            bubble_states = message.get("bubbleStates")
            if isinstance(bubble_states, list):
                self.bubble_states = [str(state) for state in bubble_states if isinstance(state, str)]
            self._sync_bubble_size()
            self._save_layout()

        def _begin_searching(self) -> None:
            """Enter the searching activity: book_ready -> book_reading."""
            self.searching_active = True
            self.search_phase = "ready"
            self.model.play_overlay("searching_ready")
            self.search_phase_ms = self._now_ms()
            self.search_started_ms = self._now_ms()
            self._log_animation("begin_searching")

        def _finish_searching(self) -> None:
            """Leave searching: starry_face -> book_happy；短查询直接回工作姿态。"""
            self.searching_active = False
            if self._now_ms() - self.search_started_ms < SEARCH_EXIT_MIN_MS:
                # 短暂查询不播星眼/开心收尾，避免工作与查资料频繁快切
                self.search_phase = "none"
                self.search_micro_next_ms = 0
                self.model.clear_overlay()
                self._log_animation("cancel_searching")
                return
            self.search_phase = "done_starry"
            self.model.play_overlay("searching_starry")
            self.search_phase_ms = self._now_ms()
            self._log_animation("finish_searching")

        def _cancel_searching(self) -> None:
            """Hard interrupt (drag) cancels the whole searching suite."""
            self.searching_active = False
            self.search_phase = "none"
            self.search_micro_next_ms = 0
            self.search_queued = False
            self.search_queued_ms = 0
            self._log_animation("cancel_searching")

        def _begin_working(self) -> None:
            """Enter working: seat entrance -> seated computer pose."""
            self.working_active = True
            self.work_exit_queued = False
            self.work_started_ms = self._now_ms()
            self.work_phase = "seat_in"
            self.model.play_overlay("working_seat_in")
            self._log_animation("begin_working")

        def _finish_working(self, *, force: bool = False) -> None:
            """Leave working with a minimum seated dwell and reverse transition."""
            now_ms = self._now_ms()
            if not force and now_ms - self.work_started_ms < WORKING_MIN_HOLD_MS:
                self.work_exit_queued = True
                self._log_animation("queue_working_exit")
                return
            self.work_exit_queued = False
            if self.work_phase == "seat_in":
                # Keep the entrance animation intact; _tick will begin the
                # reverse sequence once it reaches the seated pose.
                self.work_exit_queued = True
                self._log_animation("defer_working_exit_until_seated")
                return
            if self.work_phase in {"seat_out", "none"}:
                return
            self.work_phase = "seat_out"
            self.work_phase_ms = now_ms
            self.model.play_overlay("working_seat_out")
            self._log_animation("finish_working")

        def _cancel_working(self) -> None:
            """Hard interrupt (drag) cancels the working suite."""
            self.working_active = False
            self.work_phase = "none"
            self.work_exit_queued = False
            self.work_micro_next_ms = 0
            self._log_animation("cancel_working")

        def _work_remaining_ms(self) -> int:
            if self.work_phase != "seat_out":
                return 0
            clip = self.model.clips["working_seat_out"]
            total = len(clip.frames) * clip.frame_ms
            elapsed = self._now_ms() - self.work_phase_ms
            return max(0, total - elapsed)

        def _apply_question(self, message: dict[str, Any]) -> None:
            state = str(message.get("state", "asked"))
            if state == "asked":
                self._begin_question(str(message.get("question") or ""))
            elif state == "answered":
                self._finish_question()

        def _begin_question(self, question: str) -> None:
            """提问：打断进行中的进出场动画，播放 question 表情并保持到用户回答。"""
            self._cancel_working()
            self._cancel_searching()
            self.question_phase = "asked"
            self.question_phase_ms = self._now_ms()
            self.model.play_overlay("question")
            if question:
                # 状态卡字幕显示实际提问的问题
                self._show_status(question, "等你回答", self.display_state, None)
            else:
                self._show_status("问你一个问题", "请回答我", self.display_state, None)
            self._log_animation("begin_question")

        def _finish_question(self) -> None:
            """回答：播放 answer 表情一段时间后回到底图。"""
            self.question_phase = "answered"
            self.question_phase_ms = self._now_ms()
            self.model.play_overlay("answer")
            self._log_animation("finish_question")

        def _cancel_question(self) -> None:
            """硬打断（拖拽）取消 question/answer 表情。"""
            self.question_phase = "none"
            self.question_phase_ms = 0
            self._log_animation("cancel_question")

        def _debug_log_path(self) -> Path:
            override = os.environ.get("DSH_DAFEIYU_DEBUG_LOG")
            return Path(override) if override else default_layout_path().parent / "debug-animation.log"

        def _log_animation(self, event: str) -> None:
            try:
                key = (
                    self.model.active_clip_name,
                    self.model.frame,
                    self.search_phase,
                    self.work_phase,
                    self.question_phase,
                    self.model.base_clip_name,
                    self.model.overlay_clip_name,
                )
                if key == getattr(self, "_last_animation_log", None):
                    return
                self._last_animation_log = key
                self.debug_log_path.parent.mkdir(parents=True, exist_ok=True)
                with self.debug_log_path.open("a", encoding="utf-8") as stream:
                    stream.write(f"{self._now_ms()}ms {event} clip={key[0]} frame={key[1]} search={key[2]} work={key[3]} question={key[4]} base={key[5]} overlay={key[6]}\\n")
            except OSError:
                pass

        def _tick(self) -> None:
            now_ms = self._now_ms()
            budget_ms = 2 * self.animation_timer.interval()
            elapsed_ms = min(budget_ms, max(0, now_ms - self.last_tick_ms))
            self.last_tick_ms = now_ms
            had_pulse = self.model.pulse_state is not None
            previous_frame = self.model.frame
            previous_clip = self.model.active_clip_name
            model_elapsed = 0 if self.reduced_motion and self.model.active_clip.loop else elapsed_ms
            self.model.advance(model_elapsed, now_ms)
            self._sync_frame_transition(previous_frame, previous_clip)
            if had_pulse and self.model.pulse_state is None: self.display_state = self.model.base_state
            overlay_expired = self.overlay_deadline_ms is not None and now_ms >= self.overlay_deadline_ms
            if overlay_expired: self._clear_overlay()
            # Idle micro-actions have their own deadline. Do not rely only on
            # AnimationModel's non-loop completion: sweep must always return
            # to the standing idle base instead of remaining on screen.
            if self.idle_micro_end_ms is not None:
                if self.model.overlay_clip_name in {"blink", "glance", "sweep"} and now_ms >= self.idle_micro_end_ms:
                    self.model.clear_overlay()
                    self.idle_micro_end_ms = None
                elif self.model.overlay_clip_name not in {"blink", "glance", "sweep"}:
                    self.idle_micro_end_ms = None
            if self.drag_phase == "release" and now_ms - self.release_start_ms >= 250:
                self.drag_phase = "landed"; self.model.play_overlay("dragging_landed"); self._show_overlay("整理下衣领...", "", self.status_state, 1400); self.landed_start_ms = now_ms
            elif self.drag_phase == "landed" and now_ms - self.landed_start_ms >= 1000:
                self.drag_phase = "cry"; self.model.play_overlay("dragging_cry"); self._show_overlay("发型都乱了...", "", self.status_state, 1600); self.cry_start_ms = now_ms
            elif self.drag_phase == "cry" and now_ms - self.cry_start_ms >= 1000:
                self.model.clear_overlay(); self.drag_phase = "none"
            if self.search_queued and now_ms - self.search_queued_ms >= SEARCH_GRACE_MS:
                self.search_queued = False; self.model.base_clip_name = self.search_queued_book_base; self._begin_searching()
            if self.search_phase == "ready" and now_ms - self.search_phase_ms >= SEARCH_FRAME_MS:
                self.search_phase = "reading"; self.model.clear_overlay(); self.search_phase_ms = now_ms; self.search_micro_next_ms = now_ms + random.randint(3500, 8000)
            elif self.search_phase == "reading" and now_ms >= self.search_micro_next_ms:
                self.search_phase = "micro"; self.model.play_overlay(random.choice(SEARCH_MICRO_CLIPS)); self.search_phase_ms = now_ms
            elif self.search_phase == "micro" and now_ms - self.search_phase_ms >= SEARCH_FRAME_MS:
                self.search_phase = "reading"; self.model.clear_overlay(); self.search_phase_ms = now_ms; self.search_micro_next_ms = now_ms + random.randint(3500, 8000)
            elif self.search_phase == "done_starry" and now_ms - self.search_phase_ms >= SEARCH_FRAME_MS:
                self.search_phase = "done_happy"; self.model.play_overlay("searching_happy"); self.search_phase_ms = now_ms
            elif self.search_phase == "done_happy" and now_ms - self.search_phase_ms >= SEARCH_FRAME_MS:
                self.search_phase = "none"; self.model.clear_overlay()
            if self.work_phase == "seat_in" and self.model.overlay_clip_name is None:
                self.work_phase = "stay"
                self.work_micro_next_ms = now_ms + random.randint(3500, 8000)
                if self.work_exit_queued and now_ms - self.work_started_ms >= WORKING_MIN_HOLD_MS:
                    self._finish_working()
            elif self.work_phase == "stay" and self.work_exit_queued and now_ms - self.work_started_ms >= WORKING_MIN_HOLD_MS:
                self._finish_working()
            elif self.work_phase == "stay" and now_ms >= self.work_micro_next_ms and not self.searching_active and not self.search_queued:
                self.work_phase = "micro"; self.model.play_overlay(random.choice(WORKING_MICRO_CLIPS)); self.work_phase_ms = now_ms
            elif self.work_phase == "micro" and now_ms - self.work_phase_ms >= SEARCH_FRAME_MS:
                self.work_phase = "stay"; self.model.clear_overlay(); self.work_phase_ms = now_ms; self.work_micro_next_ms = now_ms + random.randint(3500, 8000)
            elif self.work_phase == "seat_out" and self.model.overlay_clip_name is None:
                self.work_phase = "none"; self.working_active = False
            if self.question_phase == "answered" and now_ms - self.question_phase_ms >= QUESTION_ANSWER_MS:
                self.question_phase = "none"
                if self.model.overlay_clip_name == "answer": self.model.clear_overlay()
            if self.reduced_motion:
                frame_changed = (previous_frame, previous_clip) != (self.model.frame, self.model.active_clip_name)
                if frame_changed or self.fade_from_pixmap is not None or had_pulse or overlay_expired: self.update()
            else:
                self.update()

        def _play_idle_micro(self) -> None:
            if self.reduced_motion:
                return
            # Fixed idle rotation: blink -> glance -> sweep -> repeat.
            # Every transient clip gets an explicit end time and returns to
            # the standing idle base instead of leaving sweep on screen.
            clips = ("blink", "glance", "sweep")
            clip_name = clips[self.idle_micro_index % len(clips)]
            self.idle_micro_index = (self.idle_micro_index + 1) % len(clips)
            previous_frame = self.model.frame
            previous_clip = self.model.active_clip_name
            if self.model.base_state == "IDLE" and self.model.overlay_clip_name is None and self.model.play_overlay(clip_name):
                clip = self.model.clips[clip_name]
                duration = len(clip.frames) * clip.frame_ms if not clip.loop else clip.frame_ms
                # Sweep is intentionally capped so one cleanup action cannot
                # dominate the idle rotation.
                if clip_name == "sweep":
                    duration = min(duration, 1800)
                self.idle_micro_end_ms = self._now_ms() + max(300, duration)
                self._sync_frame_transition(previous_frame, previous_clip)
                self.update()
            self._schedule_micro()

        def _sync_frame_transition(
            self,
            previous_frame: str,
            previous_clip: str,
            *,
            allow_fade: bool = True,
        ) -> None:
            current_frame = self.model.frame
            if current_frame == previous_frame:
                return
            duration = crossfade_duration(previous_clip, self.model.active_clip_name) if allow_fade else None
            if duration is None:
                self.fade_from_pixmap = None
                return
            self.fade_from_pixmap = self.pixmaps.get(previous_frame)
            self.fade_started = time.monotonic()
            self.fade_duration = duration

        def _play_model_overlay(
            self,
            clip_name: str,
            *,
            allow_fade: bool = True,
            repaint: bool = True,
        ) -> bool:
            previous_frame = self.model.frame
            previous_clip = self.model.active_clip_name
            if not self.model.play_overlay(clip_name):
                return False
            self._sync_frame_transition(previous_frame, previous_clip, allow_fade=allow_fade)
            if repaint:
                self.update()
            return True

        def _begin_drag(self) -> None:
            if self.dragging: return
            self.dragging = True
            self.drag_phase = "hold"
            self.animation_timer.stop(); self.micro_timer.stop()
            self._cancel_searching(); self._cancel_working(); self._cancel_question()
            self._play_model_overlay("dragging_hold", allow_fade=False, repaint=False)
            self._show_overlay("呀——！干什么啦！", "", self.status_state, 2600)

        def _finish_drag(self) -> None:
            if not self.dragging: return
            now_ms = self._now_ms()
            previous_frame = self.model.frame; previous_clip = self.model.active_clip_name
            self.model.advance(0, now_ms); self.drag_phase = "release"
            self.model.play_overlay("dragging_release")
            self._show_overlay("呜....", "", self.status_state, 1500)
            self.release_start_ms = now_ms
            self._sync_frame_transition(previous_frame, previous_clip, allow_fade=False)
            self.dragging = False; self.last_tick_ms = now_ms
            self.animation_timer.start(40 if self.reduced_motion else 20)
            if not self.reduced_motion: self._schedule_micro()

        def _schedule_micro(self) -> None:
            if self.reduced_motion:
                self.micro_timer.stop()
                return
            intervals = {
                "quiet": (12000, 24000),
                "normal": (6500, 12500),
                "lively": (3500, 8000),
            }
            lower, upper = intervals.get(self.activity_level, intervals["normal"])
            self.micro_timer.start(random.randint(lower, upper))

        def _bubble_visible(self) -> bool:
            if self.bubble_mode == "hidden":
                return False
            if self.bubble_mode == "always":
                return True
            if len(self.tasks) >= 2:
                return any(task.get("state") in self.bubble_states for task in self.tasks)
            state = self.overlay_state or self.status_state or self.model.base_state or "IDLE"
            return state in self.bubble_states

        def _sync_bubble_size(self) -> None:
            old_size = (self.width(), self.height())
            self._apply_window_size()
            if (self.width(), self.height()) != old_size:
                self._move_to_pet(self.pet_x, self.pet_y)

        def _apply_window_size(self) -> None:
            pet_width = round(int(manifest["maxFrameWidth"]) * self.scale)
            pet_height = round(int(manifest["maxFrameHeight"]) * self.scale)
            if self._bubble_visible():
                bubble_width = round(420 * self.bubble_scale)
                bubble_height = self._card_height()
                self.setFixedSize(max(pet_width + 50, bubble_width + 28), pet_height + bubble_height + 34)
            else:
                self.setFixedSize(pet_width + 50, pet_height + 26)

        def _screen_geometry_at(self, x: int, y: int):
            screen = QApplication.screenAt(QPoint(x, y)) or QApplication.primaryScreen()
            if screen is None:
                return None
            return screen.availableGeometry()

        def _pet_size(self) -> tuple[int, int]:
            return (
                round(int(manifest["maxFrameWidth"]) * self.scale),
                round(int(manifest["maxFrameHeight"]) * self.scale),
            )

        def _move_to_pet(self, pet_x: int, pet_y: int) -> None:
            """Move the window so the pet stands at (pet_x, pet_y).

            The pet position is the source of truth; the window is just the
            container that keeps the status bubble on screen.  While the window
            fits on screen the pet stays centered under it.  When the window
            would have to leave the screen, it is clamped and the pet shifts
            inside the window instead, so the pet can stand at any screen
            position while the bubble stays fully visible.
            """
            pet_width, pet_height = self._pet_size()
            geometry = self._screen_geometry_at(pet_x, pet_y)
            if geometry is None:
                self.pet_x = pet_x
                self.pet_y = pet_y
                self.move(
                    pet_x - (self.width() - pet_width) // 2,
                    pet_y - (self.height() - pet_height - 8),
                )
                self.update()
                return

            min_x = geometry.left()
            max_x = max(min_x, geometry.right() - self.width() + 1)
            min_y = geometry.top()
            max_y = max(min_y, geometry.bottom() - self.height() + 1)

            center_offset_x = (self.width() - pet_width) // 2
            window_x = min(max(pet_x - center_offset_x, min_x), max_x)
            offset_x = min(max(pet_x - window_x, 0), self.width() - pet_width)
            self.pet_x = window_x + offset_x

            top_offset_y = self.height() - pet_height - 8
            window_y = min(max(pet_y - top_offset_y, min_y), max_y)
            self.pet_y = window_y + top_offset_y

            self.move(window_x, window_y)
            self.update()

        def _pet_offset_x(self, pet_width: int) -> int:
            return min(max(self.pet_x - self.x(), 0), self.width() - pet_width)

        def _pet_rect(self) -> tuple[int, int, int, int]:
            pet_width, pet_height = self._pet_size()
            return self._pet_offset_x(pet_width), self.height() - pet_height - 8, pet_width, pet_height

        def _bubble_rect(self) -> tuple[int, int, int, int]:
            card_width = round(420 * self.bubble_scale)
            card_height = self._card_height()
            pet_width, _ = self._pet_size()
            pet_center_x = self._pet_offset_x(pet_width) + pet_width // 2
            margin = 14
            card_x = pet_center_x - card_width // 2
            min_x = margin
            max_x = self.width() - card_width - margin
            if max_x < min_x:
                max_x = min_x
            card_x = min(max(card_x, min_x), max_x)
            return card_x, 7, card_width, card_height

        def _restore_visible_position(self) -> None:
            pet_width, pet_height = self._pet_size()
            top_offset = self.height() - pet_height - 8
            center_offset = (self.width() - pet_width) // 2
            saved_pet_x = self.layout.get("petX")
            saved_pet_y = self.layout.get("petY")
            if isinstance(saved_pet_x, int) and isinstance(saved_pet_y, int):
                pet_x, pet_y = saved_pet_x, saved_pet_y
            else:
                saved_x = self.layout.get("x")
                saved_y = self.layout.get("y")
                if isinstance(saved_x, int) and isinstance(saved_y, int):
                    # Legacy layouts stored the window position.  Recreate the
                    # pet position that the old centered layout would have had.
                    pet_x = saved_x + center_offset
                    pet_y = saved_y + top_offset
                else:
                    geometry = self._screen_geometry_at(self.x() + self.width() // 2, self.y() + self.height() // 2)
                    if geometry is None:
                        return
                    pet_x = geometry.right() - pet_width - 24
                    pet_y = geometry.bottom() - pet_height - 24
            self._move_to_pet(pet_x, pet_y)

        def _save_layout(self) -> None:
            self.layout = {
                "version": 1,
                "x": self.x(),
                "y": self.y(),
                "petX": self.pet_x,
                "petY": self.pet_y,
                "scale": self.scale,
                "bubbleScale": self.bubble_scale,
                "reducedMotion": self.reduced_motion,
                "bubbleMode": self.bubble_mode,
                "bubbleStates": self.bubble_states,
            }
            try:
                save_layout(self.layout_path, self.layout)
            except OSError as error:
                print(f"Unable to save BigFish layout: {error}", file=sys.stderr)

        def _save_snapshot(self) -> None:
            if snapshot_path is None or self.snapshot_saved:
                return
            snapshot_path.parent.mkdir(parents=True, exist_ok=True)
            self.snapshot_saved = self.grab().save(str(snapshot_path), "PNG")

        def _show_status(self, message: str, detail: str, state: str, ttl_ms: int | None) -> None:
            self.status_message = message
            self.status_detail = detail
            self.status_state = state
            self.status_deadline_ms = None if ttl_ms is None else self._now_ms() + ttl_ms

        def _show_overlay(self, message: str, detail: str, state: str, ttl_ms: int) -> None:
            self.overlay_message = message
            self.overlay_detail = detail or self.status_detail
            self.overlay_state = state
            self.overlay_deadline_ms = self._now_ms() + ttl_ms

        def _clear_overlay(self) -> None:
            self.overlay_message = ""
            self.overlay_detail = ""
            self.overlay_state = None
            self.overlay_deadline_ms = None

        @staticmethod
        def _now_ms() -> int:
            return int(time.monotonic() * 1000)

        def _current_card(self) -> tuple[str, str, str] | None:
            now_ms = self._now_ms()
            if self.overlay_message and (
                self.overlay_deadline_ms is None or now_ms < self.overlay_deadline_ms
            ):
                return self.overlay_message, self.overlay_detail, self.overlay_state or self.status_state
            if self.status_message and (
                self.status_deadline_ms is None or now_ms < self.status_deadline_ms
            ):
                return self.status_message, self.status_detail, self.status_state
            return None

        @staticmethod
        def _status_colors(state: str) -> tuple[QColor, QColor]:
            return {
                "SUCCESS": (QColor("#D9F7E4"), QColor("#12B85A")),
                "ERROR": (QColor("#FDE3E3"), QColor("#E5484D")),
                "WAITING": (QColor("#FFF0CE"), QColor("#D88A00")),
                "THINKING": (QColor("#E2ECFF"), QColor("#4C78E8")),
                "WORKING": (QColor("#DDEBFF"), QColor("#3478F6")),
                "DISCONNECTED": (QColor("#ECEEF1"), QColor("#7B818A")),
            }.get(state, (QColor("#ECEEF1"), QColor("#747A84")))

        def _draw_status_icon(self, painter: QPainter, state: str, center_x: int, center_y: int) -> None:
            background, foreground = self._status_colors(state)
            radius = 23
            painter.setPen(Qt.PenStyle.NoPen)
            painter.setBrush(background)
            painter.drawEllipse(center_x - radius, center_y - radius, radius * 2, radius * 2)
            pen = QPen(foreground, 3)
            pen.setCapStyle(Qt.PenCapStyle.RoundCap)
            pen.setJoinStyle(Qt.PenJoinStyle.RoundJoin)
            painter.setPen(pen)
            painter.setBrush(Qt.BrushStyle.NoBrush)
            if state == "SUCCESS":
                painter.drawLine(center_x - 10, center_y, center_x - 3, center_y + 8)
                painter.drawLine(center_x - 3, center_y + 8, center_x + 12, center_y - 10)
            elif state == "ERROR":
                painter.drawLine(center_x - 8, center_y - 8, center_x + 8, center_y + 8)
                painter.drawLine(center_x + 8, center_y - 8, center_x - 8, center_y + 8)
            elif state == "WAITING":
                painter.drawLine(center_x, center_y - 10, center_x, center_y + 3)
                painter.setBrush(foreground)
                painter.drawEllipse(center_x - 2, center_y + 9, 4, 4)
            elif state in {"THINKING", "WORKING"}:
                painter.setPen(Qt.PenStyle.NoPen)
                painter.setBrush(foreground)
                for offset in (-9, 0, 9):
                    painter.drawEllipse(center_x + offset - 3, center_y - 3, 6, 6)
            else:
                painter.setPen(Qt.PenStyle.NoPen)
                painter.setBrush(foreground)
                painter.drawEllipse(center_x - 5, center_y - 5, 10, 10)

        def _card_height(self) -> int:
            if len(self.tasks) >= 2:
                rows = min(len(self.tasks), 3)
                return round((58 + rows * 26) * self.bubble_scale)
            return round(84 * self.bubble_scale)

        def _draw_card_background(
            self,
            painter: QPainter,
            card_x: int,
            card_y: int,
            card_width: int,
            card_height: int,
            corner_radius: int,
            s: float,
        ) -> None:
            painter.setPen(Qt.PenStyle.NoPen)
            painter.setBrush(QColor(17, 24, 39, 13))
            painter.drawRoundedRect(
                card_x + 1, card_y + round(13 * s), card_width - 2, card_height,
                corner_radius, corner_radius,
            )
            painter.setBrush(QColor(17, 24, 39, 18))
            painter.drawRoundedRect(
                card_x, card_y + round(7 * s), card_width, card_height,
                corner_radius, corner_radius,
            )
            painter.setPen(QPen(QColor(218, 221, 226, 205), 1))
            painter.setBrush(QColor(252, 252, 253, 248))
            painter.drawRoundedRect(
                card_x, card_y, card_width, card_height,
                corner_radius, corner_radius,
            )

        def _draw_multi_task_card(
            self,
            painter: QPainter,
            card_x: int,
            card_y: int,
            card_width: int,
            card_height: int,
            s: float,
        ) -> None:
            title_font = QFont("Microsoft YaHei UI")
            title_font.setPointSizeF(max(8.0, 11.0 * s))
            title_font.setWeight(QFont.Weight.DemiBold)
            detail_font = QFont("Microsoft YaHei UI")
            detail_font.setPointSizeF(max(7.0, 9.0 * s))
            text_x = card_x + round(16 * s)
            text_width = max(40, card_width - round(32 * s))
            painter.setFont(title_font)
            painter.setPen(QColor("#25282D"))
            title = f"{len(self.tasks)} 个任务进行中"
            painter.drawText(
                text_x,
                card_y + round(10 * s),
                text_width,
                max(12, round(22 * s)),
                Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter,
                QFontMetrics(title_font).elidedText(title, Qt.TextElideMode.ElideRight, text_width),
            )
            painter.setFont(detail_font)
            for index, task in enumerate(self.tasks[:3]):
                row_y = card_y + round((36 + index * 24) * s)
                state = str(task.get("state", "IDLE"))
                state_label = self.LABELS.get(state, state)
                label = task.get("project") or task.get("task") or task.get("message") or state_label
                line = f"{state_label} · {label}"
                _, foreground = self._status_colors(state)
                painter.setPen(Qt.PenStyle.NoPen)
                painter.setBrush(foreground)
                painter.drawEllipse(text_x, row_y + round(4 * s), round(8 * s), round(8 * s))
                painter.setPen(QColor("#747981"))
                painter.drawText(
                    text_x + round(14 * s),
                    row_y,
                    text_width - round(14 * s),
                    max(12, round(20 * s)),
                    Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter,
                    QFontMetrics(detail_font).elidedText(line, Qt.TextElideMode.ElideRight, text_width - round(14 * s)),
                )
            if len(self.tasks) > 3:
                more = f"还有 {len(self.tasks) - 3} 个任务…"
                painter.setPen(QColor("#9AA0A6"))
                painter.drawText(
                    text_x + round(14 * s),
                    card_y + round((36 + 3 * 24) * s),
                    text_width,
                    max(12, round(20 * s)),
                    Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter,
                    more,
                )

        def _notify_alert(self, state: str) -> None:
            try:
                QApplication.beep()
            except Exception:
                pass
            self._shake_window()

        def _shake_window(self) -> None:
            if self.shake_timer is None:
                self.shake_timer = QTimer(self)
                self.shake_timer.setTimerType(Qt.TimerType.PreciseTimer)
                self.shake_timer.timeout.connect(self._shake_tick)
            self.shake_origin = self.pos()
            self.shake_count = 0
            self.shake_timer.start(30)

        def _shake_tick(self) -> None:
            offsets = [(6, 0), (-6, 0), (4, 0), (-4, 0), (2, 0), (-2, 0), (0, 0)]
            if self.shake_origin is None:
                self.shake_timer.stop()
                return
            if self.shake_count < len(offsets):
                dx, dy = offsets[self.shake_count]
                self.move(self.shake_origin.x() + dx, self.shake_origin.y() + dy)
                self.shake_count += 1
            else:
                self.shake_timer.stop()
                self.move(self.shake_origin)

        def _draw_status_card(
            self,
            painter: QPainter,
            card_x: int,
            card_y: int,
            card_width: int,
            card_height: int,
            s: float,
            card: tuple[str, str, str],
        ) -> None:
            corner_radius = round(30 * s)
            self._draw_card_background(painter, card_x, card_y, card_width, card_height, corner_radius, s)
            title, detail, card_state = card
            icon_center_x = card_x + card_width - round(39 * s)
            icon_center_y = card_y + card_height // 2
            painter.save()
            painter.translate(icon_center_x, icon_center_y)
            painter.scale(s, s)
            painter.translate(-icon_center_x, -icon_center_y)
            self._draw_status_icon(painter, card_state, icon_center_x, icon_center_y)
            painter.restore()

            text_x = card_x + round(24 * s)
            text_width = max(40, card_width - round(102 * s))
            title_font = QFont("Microsoft YaHei UI")
            title_font.setPointSizeF(max(8.0, 11.0 * s))
            title_font.setWeight(QFont.Weight.DemiBold)
            detail_font = QFont("Microsoft YaHei UI")
            detail_font.setPointSizeF(max(7.0, 9.0 * s))
            painter.setFont(title_font)
            painter.setPen(QColor("#25282D"))
            title_text = QFontMetrics(title_font).elidedText(
                title,
                Qt.TextElideMode.ElideRight,
                text_width,
            )
            painter.drawText(
                text_x,
                card_y + round(15 * s),
                text_width,
                max(12, round(27 * s)),
                Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter,
                title_text,
            )
            painter.setFont(detail_font)
            painter.setPen(QColor("#747981"))
            detail_text = QFontMetrics(detail_font).elidedText(
                detail,
                Qt.TextElideMode.ElideRight,
                text_width,
            )
            painter.drawText(
                text_x,
                card_y + round(43 * s),
                text_width,
                max(12, round(24 * s)),
                Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter,
                detail_text,
            )

        def _draw_tasks_card(
            self,
            painter: QPainter,
            card_x: int,
            card_y: int,
            card_width: int,
            card_height: int,
            s: float,
        ) -> None:
            corner_radius = round(30 * s)
            self._draw_card_background(painter, card_x, card_y, card_width, card_height, corner_radius, s)
            self._draw_multi_task_card(painter, card_x, card_y, card_width, card_height, s)

        def _tasks_card_signature(self) -> tuple:
            return tuple(
                (
                    str(task.get("state", "")),
                    str(task.get("project", "")),
                    str(task.get("task", "")),
                    str(task.get("message", "")),
                )
                for task in self.tasks[:3]
            ) + (len(self.tasks),)

        def _paint_card(self, painter: QPainter) -> int:
            """Draw the status bubble, cached offscreen so the 50 FPS repaint
            only blits the card instead of re-running font layout and rounded
            rects on every tick. Returns the bubble height used to clamp the
            pet's vertical position."""
            if not self._bubble_visible():
                self.card_cache = None
                self.card_cache_key = None
                return 12
            card_x, card_y, card_width, card_height = self._bubble_rect()
            multi = len(self.tasks) >= 2
            if multi:
                key = (
                    "multi",
                    card_x, card_y, card_width, card_height,
                    round(self.bubble_scale, 3),
                    self._tasks_card_signature(),
                )
            else:
                current = self._current_card()
                if current is None:
                    self.card_cache = None
                    self.card_cache_key = None
                    return 12
                key = (
                    "single",
                    card_x, card_y, card_width, card_height,
                    round(self.bubble_scale, 3),
                    current[0], current[1], current[2],
                )
            if self.card_cache is None or self.card_cache_key != key:
                self.card_cache_key = key
                cache = QPixmap(card_width, card_height)
                cache.fill(Qt.GlobalColor.transparent)
                card_painter = QPainter(cache)
                card_painter.setRenderHint(QPainter.RenderHint.Antialiasing, True)
                card_painter.translate(-card_x, -card_y)
                if multi:
                    self._draw_tasks_card(
                        card_painter, card_x, card_y, card_width, card_height, self.bubble_scale
                    )
                else:
                    self._draw_status_card(
                        card_painter, card_x, card_y, card_width, card_height, self.bubble_scale, current
                    )
                card_painter.end()
                self.card_cache = cache
            painter.drawPixmap(card_x, card_y, self.card_cache)
            return card_y + card_height + 19

        def paintEvent(self, _event: Any) -> None:
            painter = QPainter(self)
            painter.setRenderHint(QPainter.RenderHint.Antialiasing, True)
            # 平滑缩放：放大/缩小时插值，避免锯齿和模糊
            painter.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform, True)
            bubble_height = self._paint_card(painter)

            pixmap = self.pixmaps[self.model.frame]
            # Phase comes from the tick accumulator so delayed paints do not jump motion.
            phase = self.model.motion_phase
            motion = self.model.active_clip.motion
            if self.reduced_motion:
                motion = None
            scale_extra = 1.0
            angle = 0.0
            offset_x = 0
            offset_y = 0
            clip_name = self.model.active_clip_name
            if motion == "breathe":
                # 独立版同款：缩放呼吸 + 轻摇摆（无位移）
                scale_extra = 1.0 + 0.02 * math.sin(phase * 2.5)
                angle = math.sin(phase * 2.5) * 1.5
            elif motion == "think":
                offset_y = math.sin(phase * 2.8) * 3
                angle = math.sin(phase * 1.3) * 0.8
            elif motion == "work":
                offset_x = math.sin(phase * 5.4) * 3
                angle = math.sin(phase * 3.1) * 1.0
            elif motion == "wait":
                offset_y = math.sin(phase * 1.8) * 1
                angle = math.sin(phase * 1.2) * 0.8
            elif motion == "bounce":
                # (1-cos)/2 has no derivative cusp, unlike -abs(sin): the pet
                # settles smoothly at the bottom instead of snapping.
                offset_y = -(1.0 - math.cos(phase * 5.2)) * 4.0
                scale_extra = 1.0 + 0.02 * math.sin(phase * 5.2)
            elif motion in {"shake", "dizzy"}:
                offset_x = math.sin(phase * 11.0) * 4
                angle = math.sin(phase * 11.0) * 1.5
            elif motion == "float":
                offset_y = math.sin(phase * 3.0) * 4
                angle = math.sin(phase * 1.6) * 1.0
            # Give walking clips a light bob and quick sway without changing frame timing.
            if clip_name in ("working_search", "working_command"):
                offset_y = -(1.0 - math.cos(phase * 4.5)) * 2.5
                angle = math.sin(phase * 9.0) * 2.5

            # Scale procedural offsets with the character while retaining subpixel motion.
            offset_x = offset_x * self.scale
            offset_y = offset_y * self.scale

            fade_alpha = 1.0
            if self.fade_from_pixmap is not None and not self.fade_from_pixmap.isNull():
                fade_elapsed = time.monotonic() - self.fade_started
                if fade_elapsed < self.fade_duration:
                    fade_alpha = min(1.0, (fade_elapsed / self.fade_duration) ** 0.7)
                else:
                    self.fade_from_pixmap = None

            def draw_pet(pix: QPixmap, alpha: float) -> None:
                clip_scale = self.model.active_clip.scale
                base_width = (pix.width() / self.asset_scale) * self.scale * clip_scale
                base_height = (pix.height() / self.asset_scale) * self.scale * clip_scale
                pw = base_width * scale_extra
                ph = base_height * scale_extra
                x = self._pet_offset_x(base_width) + (base_width - pw) / 2 + offset_x
                y = self.height() - ph - 8 + offset_y
                if bubble_height > y:
                    y = bubble_height
                cx = x + pw / 2
                cy = y + ph / 2
                painter.save()
                painter.setOpacity(alpha)
                painter.translate(cx, cy)
                painter.rotate(angle)
                painter.translate(-cx, -cy)
                painter.drawPixmap(QRectF(x, y, pw, ph), pix, QRectF(0, 0, pix.width(), pix.height()))
                painter.restore()

            if fade_alpha < 1.0 and self.fade_from_pixmap is not None:
                # Keep the old frame opaque underneath so the pet never flashes transparent.
                draw_pet(self.fade_from_pixmap, 1.0)
            draw_pet(pixmap, fade_alpha)

        def mousePressEvent(self, event: QMouseEvent) -> None:
            if event.button() == Qt.MouseButton.LeftButton:
                self.drag_origin = event.globalPosition().toPoint()
                self.pet_origin = QPoint(self.pet_x, self.pet_y)
                self.dragging = False

        def mouseMoveEvent(self, event: QMouseEvent) -> None:
            if self.drag_origin is not None and self.pet_origin is not None:
                if not self.dragging and (event.globalPosition().toPoint() - self.drag_origin).manhattanLength() > 5:
                    self._begin_drag()
                delta = event.globalPosition().toPoint() - self.drag_origin
                self._move_to_pet(self.pet_origin.x() + delta.x(), self.pet_origin.y() + delta.y())

        def mouseReleaseEvent(self, event: QMouseEvent) -> None:
            if event.button() == Qt.MouseButton.LeftButton:
                if self.dragging:
                    self._finish_drag()
                    self._move_to_pet(self.pet_x, self.pet_y)
                    self._save_layout()
                else:
                    self._play_click_interaction(event.position().x(), event.position().y())
            self.drag_origin = None
            self.pet_origin = None
            self.dragging = False

        def _play_click_interaction(self, x: float, y: float) -> None:
            pet_x, pet_y, pet_width, pet_height = self._pet_rect()
            relative_x = max(0.0, x - pet_x)
            relative_y = max(0.0, y - pet_y)
            if relative_y < pet_height * 0.45:
                self._play_model_overlay("head_pat")
                self._show_overlay("摸摸也不能让我少干活哦~", self.status_detail, self.status_state, 1800)
            elif relative_x > pet_width * 0.72:
                self._play_model_overlay("tail")
                self._show_overlay("尾巴不是进度条啦！", self.status_detail, self.status_state, 1500)
            else:
                self._play_model_overlay("poke")
                self._show_overlay("戳我干嘛，任务还在跑呢", self.status_detail, self.status_state, 1500)

        def mouseDoubleClickEvent(self, event: QMouseEvent) -> None:
            if event.button() == Qt.MouseButton.LeftButton:
                self._play_model_overlay("head_pat")
                self._show_overlay("好啦好啦，知道你喜欢我~", self.status_detail, self.status_state, 1800)

        def contextMenuEvent(self, event: Any) -> None:
            menu = QMenu(self)
            size_menu = menu.addMenu("大小")
            size_actions = {}
            for label, scale in (("小", 0.8), ("标准", 1.0), ("大", 1.25)):
                action = size_menu.addAction(label)
                action.setCheckable(True)
                action.setChecked(abs(self.scale - scale) < 0.05)
                size_actions[action] = scale
            bubble_size_menu = menu.addMenu("气泡大小")
            bubble_size_actions = {}
            for label, bubble_scale in (("小", 0.8), ("标准", 1.0), ("大", 1.2)):
                action = bubble_size_menu.addAction(label)
                action.setCheckable(True)
                action.setChecked(abs(self.bubble_scale - bubble_scale) < 0.05)
                bubble_size_actions[action] = bubble_scale
            reduced_action = menu.addAction("减少动态")
            reduced_action.setCheckable(True)
            reduced_action.setChecked(self.reduced_motion)
            open_webui_action = menu.addAction("打开 WebUI")
            menu.addSeparator()
            hide_action = menu.addAction("本次隐藏")
            exit_action = menu.addAction("本次关闭")
            selected = menu.exec(event.globalPos())
            if selected in size_actions:
                self.scale = size_actions[selected]
                self._apply_window_size()
                self._move_to_pet(self.pet_x, self.pet_y)
                self._save_layout()
            elif selected in bubble_size_actions:
                self.bubble_scale = bubble_size_actions[selected]
                self._apply_window_size()
                self._move_to_pet(self.pet_x, self.pet_y)
                self._save_layout()
            elif selected == reduced_action:
                self.reduced_motion = reduced_action.isChecked()
                self.animation_timer.setInterval(40 if self.reduced_motion else 20)
                if self.reduced_motion:
                    self.micro_timer.stop()
                else:
                    self._schedule_micro()
                self._save_layout()
                self.update()
            elif selected == open_webui_action:
                QDesktopServices.openUrl(QUrl(self.webui_url))
            elif selected == hide_action:
                self.hide()
            elif selected == exit_action:
                self._save_layout()
                emit_reply("closed", reason="user")
                QApplication.quit()

    application = QApplication(sys.argv[:1])
    application.setQuitOnLastWindowClosed(False)
    inbox = Inbox()
    window = CompanionWindow()
    inbox.message.connect(window.apply_message)
    inbox.closed.connect(application.quit)

    def read_stdin() -> None:
        for line in sys.stdin:
            if not line.strip():
                continue
            try:
                message = parse_message(line)
                if message.get("kind") == "ping":
                    emit_reply("pong")
                inbox.message.emit(message)
            except (ValueError, json.JSONDecodeError) as error:
                print(json.dumps({"kind": "error", "message": str(error)}), flush=True)
        inbox.closed.emit()

    reader = threading.Thread(target=read_stdin, name="dsh-bigfish-stdin", daemon=True)
    reader.start()
    window.show()
    emit_reply("ready")
    code = application.exec()
    recorder.close()
    return code


def main() -> int:
    configure_stdio()
    parser = argparse.ArgumentParser(description="DSH BigFish native helper")
    parser.add_argument("--headless", action="store_true", help="validate the protocol without opening a window")
    parser.add_argument("--event-log", type=Path, help="append received protocol messages to a JSONL file")
    parser.add_argument("--snapshot", type=Path, help="save one diagnostic visual frame after the first message")
    args = parser.parse_args()
    recorder = EventRecorder(args.event_log)
    return run_headless(recorder) if args.headless else run_visual(recorder, args.snapshot)


if __name__ == "__main__":
    raise SystemExit(main())
