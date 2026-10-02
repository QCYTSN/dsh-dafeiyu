"""End-to-end checks for the BigFish helper's interactive desktop behaviour.

This deliberately drives the *packaged* helper the way DSH does (same protocol
on stdin/stdout) and then asks Windows what actually happened, instead of
trusting the helper's own reporting:

* mouse passthrough is asserted on the native ``WS_EX_TRANSPARENT`` style bit,
  because a Qt window flag that never reaches the HWND would still "pass" a
  self-reported test;
* the hover-only status card is asserted on the real window rectangle while the
  pointer is moved with ``SetCursorPos``, because the collapse/expand decision
  is what the user actually sees.

Usage:
    python scripts/verify-helper.py --executable runtime/bin/win32-x64/dsh-dafeiyu-helper.exe
"""

from __future__ import annotations

import argparse
import ctypes
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
from ctypes import wintypes

GWL_EXSTYLE = -20
WS_EX_TRANSPARENT = 0x00000020

INPUT_KEYBOARD = 1
KEYEVENTF_KEYUP = 0x0002
VK_CONTROL = 0x11
VK_MENU = 0x12  # Alt
VK_F9 = 0x78

TEST_HOTKEY = "Ctrl+Alt+F9"


# ---- Win32 helpers -------------------------------------------------------

class RECT(ctypes.Structure):
    _fields_ = [
        ("left", wintypes.LONG),
        ("top", wintypes.LONG),
        ("right", wintypes.LONG),
        ("bottom", wintypes.LONG),
    ]


def ex_style(hwnd: int) -> int:
    return ctypes.windll.user32.GetWindowLongW(wintypes.HWND(hwnd), GWL_EXSTYLE)


def transparent(hwnd: int) -> bool:
    return bool(ex_style(hwnd) & WS_EX_TRANSPARENT)


def window_height(hwnd: int) -> int:
    rect = RECT()
    if not ctypes.windll.user32.GetWindowRect(wintypes.HWND(hwnd), ctypes.byref(rect)):
        raise OSError("GetWindowRect failed")
    return rect.bottom - rect.top


def window_rect(hwnd: int) -> tuple[int, int, int, int]:
    rect = RECT()
    ctypes.windll.user32.GetWindowRect(wintypes.HWND(hwnd), ctypes.byref(rect))
    return rect.left, rect.top, rect.right, rect.bottom


def cursor_position() -> tuple[int, int]:
    point = wintypes.POINT()
    ctypes.windll.user32.GetCursorPos(ctypes.byref(point))
    return point.x, point.y


def move_cursor(x: int, y: int) -> None:
    ctypes.windll.user32.SetCursorPos(int(x), int(y))


class PROCESSENTRY32(ctypes.Structure):
    _fields_ = [
        ("dwSize", wintypes.DWORD),
        ("cntUsage", wintypes.DWORD),
        ("th32ProcessID", wintypes.DWORD),
        ("th32DefaultHeapID", ctypes.POINTER(ctypes.c_ulong)),
        ("th32ModuleID", wintypes.DWORD),
        ("cntThreads", wintypes.DWORD),
        ("th32ParentProcessID", wintypes.DWORD),
        ("pcPriClassBase", ctypes.c_long),
        ("dwFlags", wintypes.DWORD),
        ("szExeFile", ctypes.c_char * 260),
    ]


TH32CS_SNAPPROCESS = 0x00000002
INVALID_HANDLE_VALUE = ctypes.c_void_p(-1).value


def process_tree(root_pid: int) -> set[int]:
    """A PyInstaller onefile launch is a parent plus the real child process.

    The Qt window belongs to the child, so matching only the PID returned by
    ``Popen`` would never find it.
    """
    kernel32 = ctypes.windll.kernel32
    snapshot = kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    if snapshot == INVALID_HANDLE_VALUE:
        return {root_pid}
    parents: dict[int, int] = {}
    try:
        entry = PROCESSENTRY32()
        entry.dwSize = ctypes.sizeof(PROCESSENTRY32)
        if kernel32.Process32First(snapshot, ctypes.byref(entry)):
            while True:
                parents[int(entry.th32ProcessID)] = int(entry.th32ParentProcessID)
                if not kernel32.Process32Next(snapshot, ctypes.byref(entry)):
                    break
    finally:
        kernel32.CloseHandle(snapshot)

    tree = {root_pid}
    changed = True
    while changed:
        changed = False
        for pid, parent in parents.items():
            if parent in tree and pid not in tree:
                tree.add(pid)
                changed = True
    return tree


def visible_windows_for(pids: set[int]) -> list[int]:
    user32 = ctypes.windll.user32
    user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    user32.GetWindowThreadProcessId.restype = wintypes.DWORD
    user32.IsWindowVisible.argtypes = [wintypes.HWND]
    user32.IsWindowVisible.restype = wintypes.BOOL
    found: list[int] = []
    prototype = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

    def visit(hwnd, _lparam):
        owner = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(owner))
        if owner.value in pids and user32.IsWindowVisible(hwnd):
            found.append(int(hwnd))
        return True

    user32.EnumWindows(prototype(visit), 0)
    return found


def window_text(hwnd: int, getter_name: str) -> str:
    """Read a window title or class as text."""
    getter = getattr(ctypes.windll.user32, getter_name)
    buffer = ctypes.create_unicode_buffer(512)
    getter(wintypes.HWND(hwnd), buffer, len(buffer))
    return buffer.value


# The window the helper paints the character in.
PET_TITLE = "DSH 大肥鱼"


def wait_for_window(root_pid: int, timeout: float = 20.0) -> int:
    """Find the pet window, not just any window the helper owns.

    The exe is built with ``--console``, so a console window can exist next to
    the Qt one and ``EnumWindows`` order is Z-order dependent. Picking the first
    visible window would make this harness flaky against a perfectly fine build.
    """
    deadline = time.monotonic() + timeout
    pids = process_tree(root_pid)
    while time.monotonic() < deadline:
        windows = visible_windows_for(pids)
        for hwnd in windows:
            if window_text(hwnd, "GetWindowTextW") == PET_TITLE:
                return hwnd
        # A retitled build should still verify, so fall back to the Qt window.
        for hwnd in windows:
            if window_text(hwnd, "GetClassNameW").startswith("Qt"):
                return hwnd
        time.sleep(0.1)
    raise TimeoutError(f"no pet window appeared for pid tree of {root_pid}")


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", wintypes.LONG),
        ("dy", wintypes.LONG),
        ("mouseData", wintypes.DWORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
    ]


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", wintypes.WORD),
        ("wScan", wintypes.WORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
    ]


class HARDWAREINPUT(ctypes.Structure):
    _fields_ = [
        ("uMsg", wintypes.DWORD),
        ("wParamL", wintypes.WORD),
        ("wParamH", wintypes.WORD),
    ]


class INPUT(ctypes.Structure):
    # SendInput rejects the call unless cbSize equals sizeof(INPUT), and the
    # real union is sized by its largest member. Listing all three keeps the
    # size correct on both 32- and 64-bit builds.
    class _UNION(ctypes.Union):
        _fields_ = [("mi", MOUSEINPUT), ("ki", KEYBDINPUT), ("hi", HARDWAREINPUT)]

    _anonymous_ = ("u",)
    _fields_ = [("type", wintypes.DWORD), ("u", _UNION)]


def send_key(vk: int, up: bool) -> None:
    event = INPUT(type=INPUT_KEYBOARD)
    event.ki = KEYBDINPUT(wVk=vk, wScan=0, dwFlags=KEYEVENTF_KEYUP if up else 0, time=0, dwExtraInfo=None)
    sent = ctypes.windll.user32.SendInput(1, ctypes.byref(event), ctypes.sizeof(INPUT))
    if sent != 1:
        raise OSError(
            f"SendInput failed for vk=0x{vk:02X} "
            f"(cbSize={ctypes.sizeof(INPUT)}, winerror={ctypes.get_last_error()})",
        )


def press_hotkey() -> None:
    """Ctrl+Alt+F9 through the normal input pipeline, so RegisterHotKey sees it."""
    send_key(VK_CONTROL, False)
    send_key(VK_MENU, False)
    send_key(VK_F9, False)
    time.sleep(0.05)
    send_key(VK_F9, True)
    send_key(VK_MENU, True)
    send_key(VK_CONTROL, True)


# ---- Helper driver -------------------------------------------------------

class Helper:
    def __init__(self, executable: str, env_overrides: dict[str, str]) -> None:
        environment = dict(os.environ)
        environment.update(env_overrides)
        self.process = subprocess.Popen(
            [executable],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=environment,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            # Match how DSH launches the helper (windowsHide) so the test never
            # pops a console window on the user's desktop.
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        self.replies: list[dict] = []
        self.errors: list[str] = []
        self._lock = threading.Lock()
        threading.Thread(target=self._pump_stdout, daemon=True).start()
        threading.Thread(target=self._pump_stderr, daemon=True).start()

    def _pump_stdout(self) -> None:
        for line in self.process.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                reply = json.loads(line)
            except ValueError:
                continue
            with self._lock:
                self.replies.append(reply)

    def _pump_stderr(self) -> None:
        for line in self.process.stderr:
            line = line.strip()
            if line:
                with self._lock:
                    self.errors.append(line)

    def send(self, **payload) -> None:
        payload.setdefault("protocolVersion", 1)
        payload.setdefault("timestamp", int(time.time() * 1000))
        self.process.stdin.write(json.dumps(payload) + "\n")
        self.process.stdin.flush()

    def wait_for_reply(self, kind: str, timeout: float = 15.0) -> dict:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            with self._lock:
                for reply in self.replies:
                    if reply.get("kind") == kind:
                        return reply
            time.sleep(0.05)
        raise TimeoutError(f"no {kind!r} reply; stderr={self.stderr()}")

    def settings_replies(self) -> list[dict]:
        with self._lock:
            return [reply for reply in self.replies if reply.get("kind") == "settings"]

    def wait_for_settings(self, predicate, timeout: float = 10.0) -> dict:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            for reply in self.settings_replies():
                if predicate(reply):
                    return reply
            time.sleep(0.05)
        raise TimeoutError(
            f"no matching settings reply; got={self.settings_replies()} stderr={self.stderr()}",
        )

    def stderr(self) -> str:
        with self._lock:
            return " | ".join(self.errors)

    def close(self) -> None:
        try:
            self.send(kind="shutdown")
            self.process.wait(timeout=10)
        except Exception:
            self.process.kill()


def wait_for_style(hwnd: int, wanted: bool, timeout: float = 6.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if transparent(hwnd) == wanted:
            return True
        time.sleep(0.05)
    return False


def base_env(work: str, name: str, **extra: str) -> dict[str, str]:
    environment = {
        "DSH_DAFEIYU_LAYOUT_PATH": os.path.join(work, f"layout-{name}.json"),
        "DSH_DAFEIYU_SOUND_ENABLED": "0",
        "DSH_DAFEIYU_REDUCED_MOTION": "1",
        "DSH_DAFEIYU_SCALE": "1",
        "DSH_DAFEIYU_BUBBLE_SCALE": "1",
    }
    environment.update(extra)
    return environment


# ---- Passthrough scenarios ----------------------------------------------

def scenario_toggle(executable: str, work: str) -> list[str]:
    """Start with passthrough off, toggle it twice with the real hotkey."""
    notes: list[str] = []
    helper = Helper(executable, base_env(
        work, "toggle",
        DSH_DAFEIYU_CLICK_THROUGH="0",
        DSH_DAFEIYU_CLICK_THROUGH_HOTKEY=TEST_HOTKEY,
    ))
    try:
        helper.wait_for_reply("ready")
        hwnd = wait_for_window(helper.process.pid)
        if transparent(hwnd):
            raise AssertionError("passthrough must start disabled when the env says 0")
        notes.append("startup: WS_EX_TRANSPARENT clear")

        if "toggles mouse passthrough" not in helper.stderr():
            raise AssertionError(f"the hotkey was not registered: {helper.stderr()}")
        notes.append(f"hotkey registered: {helper.stderr()}")

        press_hotkey()
        if not wait_for_style(hwnd, True):
            raise AssertionError(
                f"hotkey did not enable passthrough (exstyle=0x{ex_style(hwnd):08X}, "
                f"settings={helper.settings_replies()}, stderr={helper.stderr()})",
            )
        helper.wait_for_settings(lambda r: r.get("clickThrough") is True)
        notes.append("hotkey on: WS_EX_TRANSPARENT set, reported clickThrough=true")

        press_hotkey()
        if not wait_for_style(hwnd, False):
            raise AssertionError(
                f"hotkey did not disable passthrough (exstyle=0x{ex_style(hwnd):08X}, "
                f"settings={helper.settings_replies()})",
            )
        helper.wait_for_settings(lambda r: r.get("clickThrough") is False)
        notes.append("hotkey off: WS_EX_TRANSPARENT cleared, reported clickThrough=false")

        # A CONFIG message must drive the same native bit without the hotkey.
        helper.send(kind="config", clickThrough=True)
        if not wait_for_style(hwnd, True):
            raise AssertionError("CONFIG clickThrough=true did not reach the native window")
        notes.append("config on: WS_EX_TRANSPARENT set")

        helper.send(kind="config", clickThrough=False)
        if not wait_for_style(hwnd, False):
            raise AssertionError("CONFIG clickThrough=false did not reach the native window")
        notes.append("config off: WS_EX_TRANSPARENT cleared")
    finally:
        helper.close()
    return notes


def scenario_startup_enabled(executable: str, work: str) -> list[str]:
    """A persisted `true` must be applied before the window is first shown."""
    helper = Helper(executable, base_env(
        work, "startup",
        DSH_DAFEIYU_CLICK_THROUGH="1",
        DSH_DAFEIYU_CLICK_THROUGH_HOTKEY=TEST_HOTKEY,
    ))
    try:
        helper.wait_for_reply("ready")
        hwnd = wait_for_window(helper.process.pid)
        if not wait_for_style(hwnd, True):
            raise AssertionError(
                f"env DSH_DAFEIYU_CLICK_THROUGH=1 was not applied (exstyle=0x{ex_style(hwnd):08X})",
            )
        return ["startup: WS_EX_TRANSPARENT already set from the saved setting"]
    finally:
        helper.close()


def scenario_bad_hotkey(executable: str, work: str) -> list[str]:
    """An unusable binding must be reported, never fatal."""
    helper = Helper(executable, base_env(
        work, "bad",
        DSH_DAFEIYU_CLICK_THROUGH="0",
        DSH_DAFEIYU_CLICK_THROUGH_HOTKEY="Ctrl+NotAKey",
    ))
    try:
        helper.wait_for_reply("ready")
        wait_for_window(helper.process.pid)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline and "unusable hotkey" not in helper.stderr():
            time.sleep(0.05)
        if "unusable hotkey" not in helper.stderr():
            raise AssertionError(f"expected a warning about the bad binding, got: {helper.stderr()}")
        return ["bad binding reported on stderr and startup continued"]
    finally:
        helper.close()


# ---- Status card scenarios ----------------------------------------------

def wait_for_height(hwnd: int, wanted: int, timeout: float = 6.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if window_height(hwnd) == wanted:
            return True
        time.sleep(0.05)
    return False


def wait_for_height_above(hwnd: int, floor: int, timeout: float = 6.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if window_height(hwnd) > floor:
            return True
        time.sleep(0.05)
    return False


def settle_height(hwnd: int, quiet_ms: float = 0.6) -> int:
    """Return the window height once it has stopped changing."""
    previous = window_height(hwnd)
    deadline = time.monotonic() + quiet_ms
    while time.monotonic() < deadline:
        time.sleep(0.05)
        current = window_height(hwnd)
        if current != previous:
            previous = current
            deadline = time.monotonic() + quiet_ms
    return previous


def pet_centre(hwnd: int) -> tuple[int, int]:
    """A point that is certainly on the character (bottom centre of the window)."""
    left, top, right, bottom = window_rect(hwnd)
    return (left + right) // 2, bottom - 30


def scenario_hover_card(executable: str, work: str) -> list[str]:
    """The default mode must keep the card off screen until the pointer arrives."""
    notes: list[str] = []
    original = cursor_position()
    helper = Helper(executable, base_env(
        work, "hover",
        DSH_DAFEIYU_BUBBLE_MODE="hover",
        DSH_DAFEIYU_CLICK_THROUGH_HOTKEY=TEST_HOTKEY,
    ))
    try:
        helper.wait_for_reply("ready")
        hwnd = wait_for_window(helper.process.pid)
        helper.send(kind="state", state="THINKING", message="悬停测试", detail="卡片应当只在鼠标移过来时出现")
        collapsed = settle_height(hwnd)
        notes.append(f"idle: card hidden (window height {collapsed})")

        # Park the pointer well away from the pet first, so the baseline is
        # measured without any hover.
        move_cursor(2, 2)
        time.sleep(0.6)
        collapsed = settle_height(hwnd)

        x, y = pet_centre(hwnd)
        move_cursor(x, y)
        if not wait_for_height_above(hwnd, collapsed):
            raise AssertionError(
                f"hovering the pet did not reveal the card "
                f"(height stayed {window_height(hwnd)}, baseline {collapsed})",
            )
        # The card must *stay* revealed while the pointer rests on the fish: a
        # window that grows and immediately collapses again is the flicker this
        # assertion exists to catch.
        expanded = settle_height(hwnd)
        if expanded <= collapsed:
            raise AssertionError(
                f"the card collapsed while the pointer was still on the pet "
                f"(settled at {expanded}, baseline {collapsed}, "
                f"pointed at {x},{y} in {window_rect(hwnd)}, cursor now {cursor_position()})",
            )
        notes.append(f"hover: card shown and held (window height {collapsed} -> {expanded})")

        move_cursor(2, 2)
        if not wait_for_height(hwnd, collapsed):
            raise AssertionError(
                f"the card did not collapse after the pointer left "
                f"(height {window_height(hwnd)}, baseline {collapsed})",
            )
        notes.append("pointer away: card hidden again")
        return notes
    finally:
        move_cursor(*original)
        helper.close()


def scenario_card_modes(executable: str, work: str) -> list[str]:
    """`always` ignores hover; `hidden` never grows, hover or not.

    `hidden` doubles as the pet-only baseline: measuring it in the same run
    keeps the comparison honest across scales and card heights.
    """
    notes: list[str] = []
    original = cursor_position()
    measured: dict[str, tuple[int, int]] = {}
    try:
        for mode in ("hidden", "always"):
            helper = Helper(executable, base_env(
                work, f"mode-{mode}",
                DSH_DAFEIYU_BUBBLE_MODE=mode,
                DSH_DAFEIYU_CLICK_THROUGH_HOTKEY=TEST_HOTKEY,
            ))
            try:
                helper.wait_for_reply("ready")
                hwnd = wait_for_window(helper.process.pid)
                helper.send(kind="state", state="THINKING", message="模式检查", detail=f"bubbleMode={mode}")
                move_cursor(2, 2)
                away = settle_height(hwnd)

                x, y = pet_centre(hwnd)
                move_cursor(x, y)
                time.sleep(1.0)
                hovered = settle_height(hwnd)
                measured[mode] = (away, hovered)
            finally:
                helper.close()

        baseline = measured["hidden"][1]
        away, hovered = measured["hidden"]
        if (away, hovered) != (baseline, baseline):
            raise AssertionError(
                f"bubbleMode=hidden must never grow the window (away {away}, hover {hovered})",
            )
        notes.append(f"hidden: window never grows (height {baseline})")

        away, hovered = measured["always"]
        if away != hovered:
            raise AssertionError(
                f"bubbleMode=always must not depend on hover (away {away}, hover {hovered})",
            )
        if away <= baseline:
            raise AssertionError(
                f"bubbleMode=always should show the card without hover (height {away} vs pet-only {baseline})",
            )
        notes.append(f"always: card present without hover (height {away} vs pet-only {baseline})")
        return notes
    finally:
        move_cursor(*original)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", required=True)
    args = parser.parse_args()
    if sys.platform != "win32":
        print("This verification needs a real Windows desktop session.", file=sys.stderr)
        return 2
    executable = os.path.abspath(args.executable)
    if not os.path.isfile(executable):
        print(f"Missing executable: {executable}", file=sys.stderr)
        return 2

    failures = 0
    with tempfile.TemporaryDirectory(prefix="dafeiyu-verify-") as work:
        for name, scenario in (
            ("startup passthrough", scenario_startup_enabled),
            ("hotkey toggle", scenario_toggle),
            ("bad binding", scenario_bad_hotkey),
            ("hover status card", scenario_hover_card),
            ("card modes", scenario_card_modes),
        ):
            try:
                for note in scenario(executable, work):
                    print(f"  ok   {note}")
                print(f"PASS  {name}")
            except Exception as error:
                failures += 1
                print(f"FAIL  {name}: {error}", file=sys.stderr)
    print("ALL SCENARIOS PASSED" if failures == 0 else f"{failures} scenario(s) failed")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
