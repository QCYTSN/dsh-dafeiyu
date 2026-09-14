#!/usr/bin/env python3
"""Import the selected dsh-pet (MIT) VP9-alpha WebM clips as runtime frame assets.

Source project: https://github.com/PC2005-cloud/dsh-pet (MIT, Copyright (c) 2026
PC2005-cloud). Its clips share one 640x360 canvas with the character anchored to
a fixed feet line (y=330) and a fixed center, so a single global crop window --
the union alpha bounding box across every imported clip -- keeps the feet line
and cross-clip alignment (crossfades, walk ground line) intact.

Two ffmpeg facts shape the pipeline: VP9 alpha lives in WebM BlockAdditions and
ffmpeg's native vp9 decoder ignores it (``-c:v libvpx-vp9`` is required), and
alpha becomes a plain gray plane through ``alphaextract``. The bounding box is
therefore measured by piping alphaextract rawvideo through Python and scanning
rows for non-transparent pixels -- the only dependency is ffmpeg with libvpx.

Frames are re-encoded as transparent WebP (q75, 12 fps), which PySide6 decodes
natively and keeps the bundled package small.

Usage:
    python scripts/import_dshpet_webm.py \
        --source <path to dsh-pet>/assets/webm \
        --ffmpeg <ffmpeg bin directory> \
        --out <repository root>

The generated assets/pet-manifest.json and assets/pet/**.webp are committed;
this script is a maintainer tool, not part of the runtime.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

CANVAS_WIDTH = 640
CANVAS_HEIGHT = 360
FPS = 12
FRAME_MS = 83  # round(1000 / 12)
QUALITY = 75
PAD = 12
ALPHA_THRESHOLD = 8

# (clip key, source file name, loop, (start_sec, end_sec) or None for full, motion)
# Overlay clips trim to their centre action; state loops keep the full 10s cycle
# whose first and last frames are the identical standard standing pose, which is
# also what reduced-motion mode displays (looped clips freeze on frame 0).
SELECTION = [
    ("idle", "待机呼吸休闲.webm", True, None, None),
    ("waiting", "东张西望.webm", True, None, None),
    ("thinking", "工作状态-思考冒泡.webm", True, None, None),
    ("working", "工作状态-忙碌点按.webm", True, None, None),
    ("working_search", "工作状态-原地踱步张望.webm", True, None, None),
    ("working_command", "工作状态-清点归档.webm", True, None, None),
    ("success", "工作状态-雀跃庆祝.webm", True, None, None),
    ("error", "工作状态-垂头叹气冒汗.webm", True, None, None),
    ("dragging", "被鼠标拖拽悬空反馈.webm", True, None, None),
    ("dragging_release", "被鼠标拖拽悬空反馈.webm", False, (8.0, 10.04), None),
    ("dragging_dizzy", "被鼠标拖拽悬空反馈.webm", True, (0.0, 1 / FPS), "dizzy"),
    ("dragging_protest", "点击回应-傲娇生气.webm", False, (3.0, 7.0), None),
    ("head_pat", "点击回应-挠痒咯咯笑.webm", False, (3.0, 7.0), None),
    ("poke", "点击回应-元气挥手.webm", False, (3.0, 7.0), None),
    ("tail", "鲸鱼吐泡泡特效.webm", False, (3.0, 7.0), None),
    ("eat_token", "吃Token.webm", False, (2.5, 7.5), None),
]

STATE_MAP = {
    "IDLE": "idle",
    "THINKING": "thinking",
    "WORKING": "working",
    "WAITING": "waiting",
    "SUCCESS": "success",
    "ERROR": "error",
    "DISCONNECTED": "idle",
}
WORKING_ACTIVITY_MAP = {
    "searching": "working_search",
    "commanding": "working_command",
    "editing": "working",
    "testing": "working_command",
    "using-tool": "working",
}
IDLE_MICRO_CLIPS = ["eat_token"]

_OPAQUE = bytes(1 if value > ALPHA_THRESHOLD else 0 for value in range(256))


def run(command: list[str]) -> None:
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"command failed ({result.returncode}): {' '.join(command)}\n{result.stderr[-2000:]}")


def capture(command: list[str]) -> bytes:
    result = subprocess.run(command, capture_output=True)
    if result.returncode != 0:
        raise RuntimeError(f"command failed ({result.returncode}): {' '.join(command)}\n{result.stderr[-2000:]!r}")
    return result.stdout


def frame_count_and_box(ffmpeg: Path, source: Path) -> tuple[int, tuple[int, int, int, int]]:
    """Frame count and union alpha bounding box (x0, y0, x1, y1) of one source.

    The alpha plane is piped out as raw 8-bit gray rows; scanning each row with
    translate() plus find()/rfind() keeps the whole pass in fast C-level bytes
    operations.
    """
    gray = capture([
        str(ffmpeg), "-v", "error", "-c:v", "libvpx-vp9", "-i", str(source),
        "-vf", f"fps={FPS},alphaextract",
        "-f", "rawvideo", "-pix_fmt", "gray", "-",
    ])
    frame_bytes = CANVAS_WIDTH * CANVAS_HEIGHT
    if len(gray) == 0 or len(gray) % frame_bytes != 0:
        raise RuntimeError(f"unexpected rawvideo size {len(gray)} for {source}")
    frames = len(gray) // frame_bytes
    min_x, min_y, max_x, max_y = CANVAS_WIDTH, CANVAS_HEIGHT, -1, -1
    for frame_index in range(frames):
        base = frame_index * frame_bytes
        for y in range(CANVAS_HEIGHT):
            row = gray[base + y * CANVAS_WIDTH:base + (y + 1) * CANVAS_WIDTH]
            opaque = row.translate(_OPAQUE)
            first = opaque.find(1)
            if first < 0:
                continue
            if y < min_y:
                min_y = y
            max_y = y
            if first < min_x:
                min_x = first
            last = opaque.rfind(1)
            if last + 1 > max_x:
                max_x = last + 1
    if max_x < 0:
        raise RuntimeError(f"no opaque pixels found in {source}")
    return frames, (min_x, min_y, max_x + 1, max_y + 1)


def global_crop_box(boxes: list[tuple[int, int, int, int]]) -> tuple[int, int, int, int]:
    x0 = min(box[0] for box in boxes) - PAD
    y0 = min(box[1] for box in boxes) - PAD
    x1 = max(box[2] for box in boxes) + PAD
    y1 = max(box[3] for box in boxes) + PAD
    x0 = max(0, x0 - x0 % 2)
    y0 = max(0, y0 - y0 % 2)
    x1 = min(CANVAS_WIDTH, x1 + x1 % 2)
    y1 = min(CANVAS_HEIGHT, y1 + y1 % 2)
    return x0, y0, x1 - x0, y1 - y0  # x, y, w, h


def encode_webp(ffmpeg: Path, source: Path, crop: tuple[int, int, int, int], target: Path) -> list[Path]:
    """Encode the full 12fps source as cropped transparent WebP frames."""
    target.mkdir(parents=True, exist_ok=True)
    run([
        str(ffmpeg), "-v", "error", "-c:v", "libvpx-vp9", "-i", str(source),
        "-vf", f"fps={FPS},crop={crop[2]}:{crop[3]}:{crop[0]}:{crop[1]}",
        "-c:v", "libwebp", "-lossless", "0", "-q:v", str(QUALITY), "-compression_level", "4",
        f"{target}/frame_%03d.webp",
    ])
    return sorted(target.glob("frame_*.webp"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True, help="dsh-pet assets/webm directory")
    parser.add_argument("--ffmpeg", type=Path, required=True, help="ffmpeg bin directory")
    parser.add_argument("--out", type=Path, required=True, help="repository root")
    args = parser.parse_args()

    ffmpeg = args.ffmpeg / "ffmpeg.exe"
    if not ffmpeg.exists():
        ffmpeg = args.ffmpeg / "ffmpeg"
    pet_root = args.out / "assets" / "pet"
    manifest_path = args.out / "assets" / "pet-manifest.json"

    missing = sorted({name for _, name, _, _, _ in SELECTION if not (args.source / name).exists()})
    if missing:
        print(f"missing source clips: {missing}", file=sys.stderr)
        return 1

    boxes = []
    sources = {}
    for _, name, _, _, _ in SELECTION:
        if name not in sources:
            sources[name] = frame_count_and_box(ffmpeg, args.source / name)
            print(f"measured {name}: {sources[name][0]} frames")
        boxes.append(sources[name][1])
    crop = global_crop_box(boxes)
    print(f"global crop: x={crop[0]} y={crop[1]} w={crop[2]} h={crop[3]}")

    if pet_root.exists():
        shutil.rmtree(pet_root)
    encoded: dict[str, list[Path]] = {}
    clips: dict[str, dict] = {}
    for key, name, loop, window, motion in SELECTION:
        if name not in encoded:
            encoded[name] = encode_webp(ffmpeg, args.source / name, crop, pet_root / f"_src_{len(encoded)}")
        start = int(round((window[0] if window else 0.0) * FPS))
        end = int(round((window[1] if window else (len(encoded[name]) / FPS)) * FPS))
        end = min(end, len(encoded[name]))
        clip_dir = pet_root / key
        clip_dir.mkdir(parents=True, exist_ok=True)
        clip_frames = []
        for index, frame in enumerate(encoded[name][start:end], start=1):
            target = clip_dir / f"{key}_{index:03d}.webp"
            # Several clips may slice one source sequence; copy so later
            # slices still see the full range.
            shutil.copyfile(str(frame), str(target))
            clip_frames.append(f"{key}/{target.name}")
        clip: dict = {"frames": clip_frames, "frameMs": FRAME_MS, "loop": loop}
        if motion:
            clip["motion"] = motion
        clips[key] = clip
        total_kb = sum(p.stat().st_size for p in clip_dir.glob("*.webp")) // 1024
        print(f"clip {key}: {len(clip_frames)} frames, {total_kb} KB")
    for directory in pet_root.glob("_src_*"):
        shutil.rmtree(directory)

    manifest = {
        "formatVersion": 1,
        "characterId": "whaletail-maid",
        "baseSize": crop[2],
        "maxFrameWidth": crop[2],
        "maxFrameHeight": crop[3],
        "clips": clips,
        "stateMap": STATE_MAP,
        "workingActivityMap": WORKING_ACTIVITY_MAP,
        "idleMicroClips": IDLE_MICRO_CLIPS,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    total_mb = sum(p.stat().st_size for p in pet_root.rglob("*.webp")) // (1024 * 1024)
    print(f"manifest written; total asset size: {total_mb} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
