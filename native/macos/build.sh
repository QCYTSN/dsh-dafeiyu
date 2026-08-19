#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
APP="$ROOT/runtime/bin/darwin/dsh-dafeiyu-helper.app"
BIN="$APP/Contents/MacOS/dsh-dafeiyu-helper"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$(dirname "$BIN")" "$APP/Contents/Resources"
cp "$DIR/Info.plist" "$APP/Contents/Info.plist"
cp -R "$ROOT/assets" "$APP/Contents/Resources/assets"

SOURCES=(
  "$DIR/Sources/AnimationModel.swift" \
  "$DIR/Sources/LayoutStore.swift" \
  "$DIR/Sources/Permissions.swift" \
  "$DIR/Sources/PetController.swift" \
  "$DIR/Sources/PetView.swift" \
  "$DIR/Sources/main.swift" \
)
FRAMEWORKS=(
  -framework AppKit \
  -framework UserNotifications \
  -framework ApplicationServices \
  -framework QuartzCore \
)

echo "building arm64 slice (macOS 12+)..."
swiftc -O -swift-version 5 -target arm64-apple-macosx12.0 \
  "${SOURCES[@]}" "${FRAMEWORKS[@]}" -o "$WORK/helper-arm64"

echo "building x86_64 slice (macOS 12+)..."
swiftc -O -swift-version 5 -target x86_64-apple-macosx12.0 \
  "${SOURCES[@]}" "${FRAMEWORKS[@]}" -o "$WORK/helper-x86_64"

lipo -create "$WORK/helper-arm64" "$WORK/helper-x86_64" -output "$BIN"
codesign --force --deep -s - "$APP" 2>/dev/null

echo "built universal macOS helper (arm64 + x86_64, macOS 12+): $APP"
