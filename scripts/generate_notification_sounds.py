#!/usr/bin/env python3
"""Generate the original BigFish success/error notification sounds."""

from __future__ import annotations

import argparse
import math
import struct
import wave
from pathlib import Path


SAMPLE_RATE = 44_100


def envelope(position: float, duration: float) -> float:
    attack = min(1.0, position / 0.012)
    release = min(1.0, max(0.0, duration - position) / 0.08)
    decay = math.exp(-2.8 * position / duration)
    return attack * release * decay


def render(path: Path, notes: tuple[tuple[float, float, float], ...], duration: float) -> None:
    frames = bytearray()
    for index in range(round(SAMPLE_RATE * duration)):
        time = index / SAMPLE_RATE
        sample = 0.0
        for start, end, frequency in notes:
            if start <= time < end:
                local = time - start
                note_duration = end - start
                phase = 2.0 * math.pi * frequency * local
                voice = math.sin(phase) + 0.22 * math.sin(phase * 2.0)
                sample += 0.24 * envelope(local, note_duration) * voice
        frames.extend(struct.pack("<h", round(max(-1.0, min(1.0, sample)) * 32_767)))

    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(frames)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path, nargs="?", default=Path("assets/sounds"))
    args = parser.parse_args()
    render(
        args.output / "success.wav",
        ((0.00, 0.20, 523.25), (0.12, 0.32, 659.25), (0.24, 0.44, 783.99)),
        0.46,
    )
    render(
        args.output / "error.wav",
        ((0.00, 0.22, 392.00), (0.17, 0.40, 329.63)),
        0.42,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
