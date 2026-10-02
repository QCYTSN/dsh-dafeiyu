"""System-wide hotkey support for the BigFish helper.

``RegisterHotKey`` is the only mechanism that delivers a key press to an
unfocused window without installing a low-level keyboard hook, and it is also
the only one that keeps working while that window ignores the mouse. The
registration is therefore owned by a dedicated thread with its own message
loop: ``RegisterHotKey`` binds to the calling thread, and letting Qt's event
loop pump those messages would make delivery depend on Qt internals.

Only Windows is implemented. Elsewhere ``GlobalHotkey`` stays inert and
reports ``registered == False``, so the caller can fall back to the context
menu instead of failing.
"""

from __future__ import annotations

import ctypes
import sys
import threading
from typing import Callable

MOD_ALT = 0x0001
MOD_CONTROL = 0x0002
MOD_SHIFT = 0x0004
MOD_WIN = 0x0008
# Windows 7+: emit one WM_HOTKEY per physical press instead of auto-repeating
# while the keys are held, which would otherwise flap the toggle.
MOD_NOREPEAT = 0x4000

WM_HOTKEY = 0x0312
WM_QUIT = 0x0012

DEFAULT_HOTKEY = "Ctrl+Alt+F"

_MODIFIER_ALIASES = {
    "ctrl": MOD_CONTROL,
    "control": MOD_CONTROL,
    "alt": MOD_ALT,
    "option": MOD_ALT,
    "shift": MOD_SHIFT,
    "win": MOD_WIN,
    "meta": MOD_WIN,
    "super": MOD_WIN,
    "cmd": MOD_WIN,
}

# Canonical modifier order used when rendering a binding back to the user.
_MODIFIER_LABELS = (
    (MOD_CONTROL, "Ctrl"),
    (MOD_ALT, "Alt"),
    (MOD_SHIFT, "Shift"),
    (MOD_WIN, "Win"),
)

# Named keys a user is likely to bind. Letters and digits are handled
# arithmetically in ``virtual_key`` so the table only holds the rest.
_NAMED_KEYS = {
    "backspace": 0x08,
    "tab": 0x09,
    "enter": 0x0D,
    "return": 0x0D,
    "esc": 0x1B,
    "escape": 0x1B,
    "space": 0x20,
    "pageup": 0x21,
    "pgup": 0x21,
    "pagedown": 0x22,
    "pgdn": 0x22,
    "end": 0x23,
    "home": 0x24,
    "left": 0x25,
    "up": 0x26,
    "right": 0x27,
    "down": 0x28,
    "insert": 0x2D,
    "ins": 0x2D,
    "delete": 0x2E,
    "del": 0x2E,
    "-": 0xBD,
    "=": 0xBB,
    "[": 0xDB,
    "]": 0xDD,
    "\\": 0xDC,
    ";": 0xBA,
    "'": 0xDE,
    ",": 0xBC,
    ".": 0xBE,
    "/": 0xBF,
    "`": 0xC0,
}

# Display spellings for the codes that cannot be derived from the tables.
_DISPLAY_KEYS = {
    0x08: "Backspace",
    0x09: "Tab",
    0x0D: "Enter",
    0x1B: "Esc",
    0x20: "Space",
    0x21: "PageUp",
    0x22: "PageDown",
    0x23: "End",
    0x24: "Home",
    0x25: "Left",
    0x26: "Up",
    0x27: "Right",
    0x28: "Down",
    0x2D: "Insert",
    0x2E: "Delete",
    0xBA: ";",
    0xBB: "=",
    0xBC: ",",
    0xBD: "-",
    0xBE: ".",
    0xBF: "/",
    0xC0: "`",
    0xDB: "[",
    0xDC: "\\",
    0xDD: "]",
    0xDE: "'",
}


def virtual_key(token: str) -> int | None:
    """Map one key name to a Windows virtual-key code, or None if unknown."""
    lowered = token.lower()
    if len(lowered) == 1 and "a" <= lowered <= "z":
        return ord(lowered.upper())
    if len(lowered) == 1 and "0" <= lowered <= "9":
        return ord(lowered)
    if lowered in _NAMED_KEYS:
        return _NAMED_KEYS[lowered]
    if lowered.startswith("f") and lowered[1:].isdigit():
        number = int(lowered[1:])
        if 1 <= number <= 24:
            return 0x70 + number - 1
    return None


def parse_hotkey(spec: object) -> tuple[int, int] | None:
    """Parse ``"Ctrl+Alt+F"`` into ``(modifiers, virtual_key)``.

    Returns None for anything unusable: an unknown token, more than one
    non-modifier key, or no modifier at all. A modifier-free binding would
    swallow an ordinary key system-wide, so it is rejected rather than
    honoured.
    """
    if not isinstance(spec, str):
        return None
    tokens = [token.strip() for token in spec.split("+")]
    if not any(tokens):
        return None
    modifiers = 0
    key_code: int | None = None
    for token in tokens:
        if not token:
            # "Ctrl++F" or a trailing '+': the user meant a key that is missing.
            return None
        alias = _MODIFIER_ALIASES.get(token.lower())
        if alias is not None:
            modifiers |= alias
            continue
        if key_code is not None:
            return None
        key_code = virtual_key(token)
        if key_code is None:
            return None
    if key_code is None or modifiers == 0:
        return None
    return modifiers, key_code


def key_label(key_code: int) -> str:
    if 0x41 <= key_code <= 0x5A:
        return chr(key_code)
    if 0x30 <= key_code <= 0x39:
        return chr(key_code)
    if 0x70 <= key_code <= 0x87:
        return f"F{key_code - 0x6F}"
    return _DISPLAY_KEYS.get(key_code, f"0x{key_code:02X}")


def describe_hotkey(spec: object) -> str:
    """Render a binding as ``"Ctrl+Alt+F"`` for menus and bubbles.

    Returns an empty string when the spec is unusable, so callers can simply
    omit the hint instead of printing a broken key name.
    """
    parsed = parse_hotkey(spec)
    if parsed is None:
        return ""
    modifiers, key_code = parsed
    parts = [label for bit, label in _MODIFIER_LABELS if modifiers & bit]
    parts.append(key_label(key_code))
    return "+".join(parts)


class GlobalHotkey:
    """Own a Windows system-wide hotkey on a private message-loop thread.

    ``callback`` runs on that thread, not on the GUI thread, so callers must
    marshal back (``CompanionWindow`` does it by emitting a Qt signal, which
    Qt turns into a queued connection).
    """

    def __init__(
        self,
        spec: str,
        callback: Callable[[], None],
        *,
        identifier: int = 0xDAFE,
        on_error: Callable[[str], None] | None = None,
    ) -> None:
        self.spec = spec
        self.callback = callback
        self.identifier = identifier
        self.on_error = on_error
        self.error: str | None = None
        self._thread: threading.Thread | None = None
        self._thread_id: int | None = None
        self._ready = threading.Event()
        self._registered = False
        self._stopping = False

    @property
    def supported(self) -> bool:
        return sys.platform == "win32"

    @property
    def registered(self) -> bool:
        return self._registered

    def start(self) -> bool:
        """Register the hotkey; never raises and never blocks for long."""
        if not self.supported:
            return self._fail("global hotkeys are only implemented on Windows")
        parsed = parse_hotkey(self.spec)
        if parsed is None:
            return self._fail(f"unusable hotkey {self.spec!r} (expected e.g. Ctrl+Alt+F)")
        if self._thread is not None:
            return self._registered
        modifiers, key_code = parsed
        self._stopping = False
        self._ready.clear()
        self._thread = threading.Thread(
            target=self._run,
            args=(modifiers, key_code),
            name="dsh-bigfish-hotkey",
            daemon=True,
        )
        self._thread.start()
        # A failed registration must not stall startup: the context menu and
        # the DSH settings page stay available as fallbacks.
        self._ready.wait(timeout=3.0)
        return self._registered

    def rebind(self, spec: str) -> bool:
        """Replace the binding at runtime (a CONFIG update changed the spec)."""
        self.stop()
        self.spec = spec
        return self.start()

    def stop(self) -> None:
        """Unregister and join the message loop so a rebind cannot overlap."""
        thread = self._thread
        thread_id = self._thread_id
        self._thread = None
        self._thread_id = None
        self._stopping = True
        if thread_id is not None:
            try:
                ctypes.windll.user32.PostThreadMessageW(thread_id, WM_QUIT, 0, 0)
            except Exception:
                pass
        if thread is not None and thread is not threading.current_thread():
            thread.join(timeout=1.0)
        self._registered = False

    def _fail(self, message: str) -> bool:
        self.error = message
        if self.on_error is not None:
            try:
                self.on_error(message)
            except Exception:
                pass
        return False

    def _run(self, modifiers: int, key_code: int) -> None:
        try:
            from ctypes import wintypes

            user32 = ctypes.windll.user32
            kernel32 = ctypes.windll.kernel32
            user32.RegisterHotKey.argtypes = [wintypes.HWND, ctypes.c_int, wintypes.UINT, wintypes.UINT]
            user32.RegisterHotKey.restype = wintypes.BOOL
            user32.UnregisterHotKey.argtypes = [wintypes.HWND, ctypes.c_int]
            user32.UnregisterHotKey.restype = wintypes.BOOL
            user32.GetMessageW.argtypes = [
                ctypes.POINTER(wintypes.MSG),
                wintypes.HWND,
                wintypes.UINT,
                wintypes.UINT,
            ]
            user32.GetMessageW.restype = ctypes.c_int
            kernel32.GetCurrentThreadId.restype = wintypes.DWORD

            self._thread_id = int(kernel32.GetCurrentThreadId())
            # Passing a NULL window registers the hotkey against this thread,
            # which is exactly what the private message loop below pumps.
            if not user32.RegisterHotKey(None, self.identifier, modifiers | MOD_NOREPEAT, key_code):
                self._fail(f"the hotkey {self.spec!r} is already claimed by another application")
                return
            self._registered = True
            self.error = None
            # Release start() before entering the loop: it must not wait for
            # the hotkey to be pressed.
            self._ready.set()
            if self._stopping:
                return
            message = wintypes.MSG()
            while user32.GetMessageW(ctypes.byref(message), None, 0, 0) > 0:
                if message.message == WM_HOTKEY and int(message.wParam) == self.identifier:
                    try:
                        self.callback()
                    except Exception:
                        pass
            user32.UnregisterHotKey(None, self.identifier)
        except Exception as error:  # pragma: no cover - defensive
            self._fail(f"global hotkey failed: {error}")
        finally:
            self._registered = False
            if self._thread is threading.current_thread():
                self._thread = None
            self._ready.set()
