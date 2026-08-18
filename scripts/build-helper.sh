#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
entry="$project_root/runtime/helper.py"
assets="$project_root/assets"
output="$project_root/runtime/bin/linux-x64"
work="$project_root/.build/helper"
# 改成自己的虚拟环境路径
venv_python="$project_root/venv/bin/python"
project_python="$project_root/.build/python-env/bin/python"
python="${DSH_DAFEIYU_BUILD_PYTHON:-}"

if [[ -z "$python" ]]; then
  if [[ -x "$venv_python" ]]; then
    python="$venv_python"
  elif [[ -x "$project_python" ]]; then
    python="$project_python"
  else
    python="python3"
  fi
fi

mkdir -p "$output" "$work"

if ! "$python" -c "import PyInstaller, PySide6; print(f'PyInstaller {PyInstaller.__version__}; PySide6 {PySide6.__version__}')"; then
  echo "The selected Python cannot import both PyInstaller and PySide6. Install requirements into the same interpreter or set DSH_DAFEIYU_BUILD_PYTHON. Selected: $python" >&2
  exit 1
fi

"$python" -m PyInstaller \
  --noconfirm \
  --clean \
  --onefile \
  --console \
  --name dsh-dafeiyu-helper \
  --distpath "$output" \
  --workpath "$work" \
  --specpath "$work" \
  --add-data "$assets:assets" \
  --paths "$project_root/runtime" \
  "$entry"

executable="$output/dsh-dafeiyu-helper"
chmod +x "$executable"

if [[ -n "${DISPLAY:-}" || -n "${WAYLAND_DISPLAY:-}" ]]; then
  node "$project_root/scripts/test-packaged-helper.mjs" --executable "$executable"
else
  echo "Skipping packaged helper visual smoke test because no display is available."
fi

printf '%s\n' "$executable"
