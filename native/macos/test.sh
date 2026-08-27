#!/usr/bin/env bash
# Runs the Swift core tests via Swift Package Manager (`swift test` at the
# repo root). Prefers the Xcode toolchain: the Command Line Tools on some
# macOS versions ship a mismatched PackageDescription library, which breaks
# manifest compilation.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"

if [ -d "/Applications/Xcode.app" ]; then
  export DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer"
fi

cd "$ROOT"
swift test
