#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
APP="$ROOT/runtime/bin/darwin/dsh-dafeiyu-helper.app"
BIN="$APP/Contents/MacOS/dsh-dafeiyu-helper"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

rm -rf "$APP"
mkdir -p "$(dirname "$BIN")" "$APP/Contents/Resources"
cp "$DIR/Info.plist" "$APP/Contents/Info.plist"
cp -R "$ROOT/assets" "$APP/Contents/Resources/assets"
PACKAGE_VERSION="$(node -p "require('$ROOT/package.json').version")"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $PACKAGE_VERSION" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $PACKAGE_VERSION" "$APP/Contents/Info.plist"

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
chmod 0755 "$BIN"
codesign --force --deep --sign - --timestamp=none "$APP"
lipo "$BIN" -verify_arch arm64 x86_64
plutil -lint "$APP/Contents/Info.plist"
codesign --verify --deep --strict --verbose=2 "$APP"

echo "built universal macOS helper (arm64 + x86_64, macOS 12+): $APP"
