"""Asset path resolution for packaged, cached, and legacy helper layouts."""

from __future__ import annotations

import importlib
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from runtime.asset_paths import bundle_root


def _frozen_layout(root: Path, *, sibling: bool, packaged: bool) -> Path:
    """Build a fake exe location with the requested asset directories."""
    exe_dir = root / "runtime" / "bin" / "win32-x64"
    exe_dir.mkdir(parents=True)
    (exe_dir / "dsh-dafeiyu-helper.exe").write_bytes(b"x")
    if sibling:
        (exe_dir / "assets").mkdir()
    if packaged:
        package_assets = root / "assets"
        package_assets.mkdir()
        (package_assets / "pet-manifest.json").write_text("{}")
    return exe_dir


class BundleRootTests(unittest.TestCase):
    def test_sibling_assets_next_to_the_exe_win(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            exe_dir = _frozen_layout(root, sibling=True, packaged=True)
            meipass = root / "embedded"
            meipass.mkdir()
            with mock.patch.object(sys, "executable", str(exe_dir / "dsh-dafeiyu-helper.exe")), \
                 mock.patch.object(sys, "_MEIPASS", str(meipass), create=True):
                self.assertEqual(bundle_root(), exe_dir)

    def test_package_layout_when_run_from_the_installed_tree(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            exe_dir = _frozen_layout(root, sibling=False, packaged=True)
            meipass = root / "embedded"
            meipass.mkdir()
            with mock.patch.object(sys, "executable", str(exe_dir / "dsh-dafeiyu-helper.exe")), \
                 mock.patch.object(sys, "_MEIPASS", str(meipass), create=True):
                self.assertEqual(bundle_root(), root)

    def test_legacy_embedded_assets_remain_the_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            exe_dir = _frozen_layout(root, sibling=False, packaged=False)
            meipass = root / "embedded"
            (meipass / "assets").mkdir(parents=True)
            with mock.patch.object(sys, "executable", str(exe_dir / "dsh-dafeiyu-helper.exe")), \
                 mock.patch.object(sys, "_MEIPASS", str(meipass), create=True):
                self.assertEqual(bundle_root(), meipass)

    def test_source_layout_resolves_to_the_repository_root(self) -> None:
        with mock.patch.object(sys, "_MEIPASS", None, create=True):
            module = importlib.import_module("runtime.asset_paths")
            self.assertEqual(module.bundle_root(), Path(module.__file__).resolve().parent.parent)


if __name__ == "__main__":
    unittest.main()
