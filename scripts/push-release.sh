#!/usr/bin/env bash
set -euo pipefail

if ! command -v powershell.exe >/dev/null 2>&1; then
  echo "powershell.exe is required. Run this script from WSL on the Windows development machine." >&2
  exit 1
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
windows_script=$(wslpath -w "$script_dir/push-release.ps1")

# Deliberately hand the release push to Windows PowerShell. The PowerShell script
# resolves Windows Git, so WSL shares the stable Windows network path and Git
# Credential Manager instead of depending on WSL-local tokens or GnuTLS.
exec powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$windows_script" "$@"
