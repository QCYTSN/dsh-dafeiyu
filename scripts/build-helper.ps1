param(
  [string]$Python = $env:DSH_DAFEIYU_BUILD_PYTHON
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$entry = Join-Path $projectRoot 'runtime\helper.py'
$output = Join-Path $projectRoot 'runtime\bin\win32-x64'
$work = Join-Path $projectRoot '.build\helper'
$projectPython = Join-Path $projectRoot '.build\python-env\Scripts\python.exe'

if (-not $Python) {
  $Python = if (Test-Path -LiteralPath $projectPython) { $projectPython } else { 'python' }
}

New-Item -ItemType Directory -Force -Path $output, $work | Out-Null

& $Python -c "import PyInstaller, PySide6; print(f'PyInstaller {PyInstaller.__version__}; PySide6 {PySide6.__version__}')"
if ($LASTEXITCODE -ne 0) {
  throw "The selected Python cannot import both PyInstaller and PySide6. Install requirements into the same interpreter or set DSH_DAFEIYU_BUILD_PYTHON. Selected: $Python"
}

# Keep unrelated tools' DLL directories out of dependency discovery. Older
# UCRT DLLs from image tools in PATH can make the frozen QtCore fail to load.
$buildPaths = & $Python -c "import json, os, sys; from pathlib import Path; import PySide6, shiboken6; print(json.dumps([str(Path(sys.executable).parent), sys.base_prefix, os.path.join(os.environ['SystemRoot'], 'System32'), os.environ['SystemRoot'], str(Path(PySide6.__file__).parent), str(Path(shiboken6.__file__).parent)]))"
if ($LASTEXITCODE -ne 0) { throw 'Unable to resolve the isolated Helper build paths' }
$originalBuildPath = $env:PATH
try {
  $env:PATH = ($buildPaths | ConvertFrom-Json) -join ';'

  & $Python -m PyInstaller `
    --noconfirm `
    --clean `
    --onefile `
    --console `
    --name dsh-dafeiyu-helper `
    --distpath $output `
    --workpath $work `
    --specpath $work `
    --paths (Join-Path $projectRoot 'runtime') `
    $entry
  $buildExit = $LASTEXITCODE
} finally {
  $env:PATH = $originalBuildPath
}

if ($buildExit -ne 0) {
  throw "PyInstaller failed with exit code $buildExit"
}

$executable = Join-Path $output 'dsh-dafeiyu-helper.exe'
& node (Join-Path $PSScriptRoot 'test-packaged-helper.mjs') --executable $executable
if ($LASTEXITCODE -ne 0) {
  throw "Packaged helper visual smoke test failed with exit code $LASTEXITCODE"
}

Write-Output $executable
